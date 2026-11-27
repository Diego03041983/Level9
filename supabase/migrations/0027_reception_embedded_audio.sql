-- Embedded MP4 soundtracks own playback; do not overlay a single legacy WAV.
create or replace function public.enqueue_reception_scene(
  p_session_id uuid,p_scene_key text,p_idempotency_key text,p_extra_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.reception_sessions%rowtype; p public.participants%rowtype;
  v_path text; v_loop boolean:=false; v_duration integer:=0; embedded_audio boolean:=false;
  a_path text; a_volume numeric:=1; a_cue integer:=0; a_duration integer:=0;
  media_key text; queued_id uuid; scene_duration integer:=12000;
begin
  select * into s from public.reception_sessions where id=p_session_id;
  if not found then raise exception 'reception session not found'; end if;
  select * into p from public.participants where id=s.participant_id;
  media_key:=case when p.is_celebrant and p_scene_key='PLAYER_UNLOCKED' then 'BIRTHDAY_HERO' else p_scene_key end;
  select ma.storage_path,rma.loop,coalesce((ma.metadata->>'durationMs')::integer,0),coalesce((ma.metadata->>'embeddedAudio')::boolean,false)
    into v_path,v_loop,v_duration,embedded_audio from public.reception_media_assignments rma
    join public.media_assets ma on ma.id=rma.media_asset_id
    where rma.event_id=s.event_id and rma.scene_key=media_key and rma.media_kind='video'
      and (rma.participant_id=s.participant_id or rma.participant_id is null)
    order by (rma.participant_id is not null) desc limit 1;
  if s.protocol_mode='quick' and p_scene_key='DETECTION' then media_key:='IDENTITY_REVEAL'; end if;
  select ma.storage_path,rma.volume,rma.cue_ms,coalesce((ma.metadata->>'durationMs')::integer,0)
    into a_path,a_volume,a_cue,a_duration from public.reception_media_assignments rma
    join public.media_assets ma on ma.id=rma.media_asset_id
    where rma.event_id=s.event_id and rma.scene_key=media_key and rma.media_kind='audio'
      and (rma.participant_id=s.participant_id or rma.participant_id is null)
    order by (rma.participant_id is not null) desc limit 1;
  scene_duration:=least(600000,greatest(scene_duration,v_duration+1000,a_cue+a_duration+1000));
  if p_scene_key in ('WAITING_NICKNAME','WAITING_PHOTO','STANDBY') then scene_duration:=600000; end if;
  update public.scene_events set status='expired' where event_id=s.event_id
    and payload->>'sessionId'=s.id::text and status in ('queued','delivered','playing');
  insert into public.scene_events(event_id,scene_type,payload,priority,duration_ms,sound,animation,
    interrupt_policy,target_device_id,idempotency_key,created_by)
  values(s.event_id,'NEXUS_'||p_scene_key,
    jsonb_strip_nulls(jsonb_build_object('sessionId',s.id,'participantId',p.id,
      'firstName',p.first_name,'lastName',p.last_name,'gamerTag',p.gamer_tag,
      'playerNumber',p.player_number,'avatarKey',p.avatar_key,'photoPath',p.photo_path,
      'isCelebrant',p.is_celebrant,'state',p_scene_key,'videoPath',v_path,
      'videoLoop',coalesce(v_loop,false)))||coalesce(p_extra_payload,'{}'::jsonb),
    case when p_scene_key in ('PLAYER_UNLOCKED','IDENTITY_REVEAL') then 95 else 88 end,
    scene_duration,case when embedded_audio then '{}'::jsonb else jsonb_strip_nulls(jsonb_build_object('path',a_path,'volume',a_volume,'cueMs',a_cue)) end,
    jsonb_build_object('preset','nexus','reducedMotionSafe',true),'force',s.display_device_id,
    p_idempotency_key,s.created_by)
  on conflict(event_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into queued_id;
  return queued_id;
end $$;
