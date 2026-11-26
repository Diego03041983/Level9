-- Quick reception has only two operator stops: nickname and photo.
-- TV playback acknowledgements advance the protocol, even if the admin refreshes.
create or replace function public.advance_quick_reception_on_scene_end()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_scene public.scene_events%rowtype;
  v_session public.reception_sessions%rowtype;
  v_next text;
  v_key text;
begin
  if new.status<>'completed' then return new; end if;
  select * into v_scene from public.scene_events where id=new.scene_event_id;
  if v_scene.scene_type not in ('NEXUS_DETECTION','NEXUS_NICKNAME_CONFIRMED','NEXUS_AVATAR_PROCESSING','NEXUS_PLAYER_UNLOCKED') then
    return new;
  end if;
  if nullif(v_scene.payload->>'sessionId','') is null then return new; end if;
  select * into v_session from public.reception_sessions
  where id=(v_scene.payload->>'sessionId')::uuid and protocol_mode='quick' and status='active'
  for update;
  if not found then return new; end if;
  v_next:=case
    when v_scene.scene_type='NEXUS_DETECTION' and v_session.protocol_state='DETECTION' then 'WAITING_NICKNAME'
    when v_scene.scene_type='NEXUS_NICKNAME_CONFIRMED' and v_session.protocol_state='NICKNAME_CONFIRMED' then 'WAITING_PHOTO'
    when v_scene.scene_type='NEXUS_AVATAR_PROCESSING' and v_session.protocol_state='AVATAR_PROCESSING' then 'COMPLETED'
    else null end;
  if v_next is null then return new; end if;
  v_key:='quick-auto:'||v_scene.id::text||':'||v_next;
  if v_next='COMPLETED' then
    update public.participants set registration_status='ACTIVATED',activated_at=coalesce(activated_at,now()),
      administrative_status='active',operational_status='available',arrived_at=coalesce(arrived_at,now()),departed_at=null
      where id=v_session.participant_id;
    insert into public.xp_transactions(event_id,participant_id,amount,reason_code,reason,idempotency_key,source_type,source_id,created_by)
      values(v_session.event_id,v_session.participant_id,100,'NEXUS_ACTIVATION','Activación NEXUS-9',
        'nexus-activation:'||v_session.participant_id,'participant',v_session.participant_id,v_session.created_by)
      on conflict (event_id,idempotency_key) do nothing;
    update public.reception_sessions set protocol_state=v_next,status='completed',completed_at=now(),version=version+1
      where id=v_session.id;
  else
    update public.reception_sessions set protocol_state=v_next,version=version+1 where id=v_session.id;
    update public.participants set registration_status=case
      when v_next='WAITING_NICKNAME' then 'NICKNAME_PENDING'
      when v_next='WAITING_PHOTO' then 'PHOTO_PENDING'
      else 'PROCESSING' end where id=v_session.participant_id;
    perform public.enqueue_reception_scene(v_session.id,v_next,v_key,'{}'::jsonb);
  end if;
  insert into public.reception_session_events(session_id,from_state,to_state,action,idempotency_key,created_by)
    values(v_session.id,v_session.protocol_state,v_next,'auto_advance',v_key,v_session.created_by)
    on conflict (session_id,idempotency_key) do nothing;
  return new;
end $$;

drop trigger if exists quick_reception_scene_completed on public.scene_playback_logs;
create trigger quick_reception_scene_completed after insert on public.scene_playback_logs
for each row execute function public.advance_quick_reception_on_scene_end();

-- The first film segment speaks the player's own identity WAV.
create or replace function public.enqueue_reception_scene(
  p_session_id uuid,p_scene_key text,p_idempotency_key text,p_extra_payload jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  s public.reception_sessions%rowtype; p public.participants%rowtype;
  v_path text; v_loop boolean:=false; v_duration integer:=0;
  a_path text; a_volume numeric:=1; a_cue integer:=0; a_duration integer:=0;
  media_key text; queued_id uuid; scene_duration integer:=12000;
begin
  select * into s from public.reception_sessions where id=p_session_id;
  if not found then raise exception 'reception session not found'; end if;
  select * into p from public.participants where id=s.participant_id;
  media_key:=case when p.is_celebrant and p_scene_key='PLAYER_UNLOCKED' then 'BIRTHDAY_HERO' else p_scene_key end;
  select ma.storage_path,rma.loop,coalesce((ma.metadata->>'durationMs')::integer,0)
    into v_path,v_loop,v_duration from public.reception_media_assignments rma
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
    scene_duration,jsonb_strip_nulls(jsonb_build_object('path',a_path,'volume',a_volume,'cueMs',a_cue)),
    jsonb_build_object('preset','nexus','reducedMotionSafe',true),'force',s.display_device_id,
    p_idempotency_key,s.created_by)
  on conflict(event_id,idempotency_key) do update set idempotency_key=excluded.idempotency_key
  returning id into queued_id;
  return queued_id;
end $$;
