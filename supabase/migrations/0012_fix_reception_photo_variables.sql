-- Correct PL/pgSQL variable names that collided with participant columns.

create or replace function public.control_reception_session(
  p_session_id uuid,
  p_expected_version integer,
  p_action text,
  p_payload jsonb,
  p_actor_user_id uuid,
  p_idempotency_key text
) returns public.reception_sessions
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  current_session public.reception_sessions;
  participant_row public.participants;
  next_state text;
  nickname text;
  submitted_photo_path text;
  photo_allowed boolean;
  selected_avatar_key text;
  old_state text;
begin
  select * into current_session from public.reception_sessions where id = p_session_id for update;
  if not found then raise exception 'reception session not found' using errcode = 'P0002'; end if;
  if caller is null or caller <> p_actor_user_id
     or not public.has_event_role(current_session.event_id, array['owner','admin','operator','checkin']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if current_session.version <> p_expected_version then raise exception 'reception session changed' using errcode = '40001'; end if;
  if exists (select 1 from public.reception_session_events where session_id = p_session_id and idempotency_key = p_idempotency_key) then
    return current_session;
  end if;
  old_state := current_session.protocol_state;
  select * into participant_row from public.participants where id = current_session.participant_id for update;

  if p_action = 'pause' then
    update public.reception_sessions set status='paused',version=version+1 where id=p_session_id returning * into current_session;
    next_state := current_session.protocol_state;
  elsif p_action = 'resume' then
    update public.reception_sessions set status='active',version=version+1 where id=p_session_id returning * into current_session;
    next_state := current_session.protocol_state;
    perform public.enqueue_reception_scene(current_session.id,next_state,p_idempotency_key,'{}'::jsonb);
  elsif p_action = 'cancel' then
    update public.reception_sessions set status='cancelled',cancelled_at=now(),version=version+1 where id=p_session_id returning * into current_session;
    update public.participants set registration_status='CANCELLED',administrative_status='invited',operational_status='unavailable' where id=current_session.participant_id;
    next_state := current_session.protocol_state;
  elsif p_action = 'repeat' then
    update public.reception_sessions set version=version+1 where id=p_session_id returning * into current_session;
    next_state := current_session.protocol_state;
    perform public.enqueue_reception_scene(current_session.id,next_state,p_idempotency_key,'{}'::jsonb);
  elsif p_action = 'nickname' then
    if current_session.protocol_state not in ('NICKNAME_REQUEST','WAITING_NICKNAME') then raise exception 'nickname not expected' using errcode='22023'; end if;
    nickname := nullif(btrim(p_payload->>'nickname'),'');
    if nickname is null then nickname := participant_row.first_name; end if;
    if char_length(nickname) > 40 or nickname ~ '[[:cntrl:]]' then raise exception 'invalid nickname' using errcode='22023'; end if;
    if exists (select 1 from public.participants where event_id=current_session.event_id and id<>participant_row.id and lower(gamer_tag)=lower(nickname) and administrative_status<>'withdrawn') then
      raise exception 'nickname already in use' using errcode='23505';
    end if;
    update public.participants set gamer_tag=nickname,registration_status='NICKNAME_CONFIRMED' where id=participant_row.id;
    next_state := 'NICKNAME_CONFIRMED';
    update public.reception_sessions set protocol_state=next_state,version=version+1 where id=p_session_id returning * into current_session;
    perform public.enqueue_reception_scene(current_session.id,next_state,p_idempotency_key,jsonb_build_object('title','NICKNAME REGISTRADO'));
  elsif p_action in ('photo','avatar') then
    if current_session.protocol_state not in ('PHOTO_REQUEST','PHOTO_COUNTDOWN','WAITING_PHOTO') then raise exception 'photo not expected' using errcode='22023'; end if;
    submitted_photo_path := nullif(p_payload->>'photoPath','');
    photo_allowed := coalesce((p_payload->>'photoAllowed')::boolean,false);
    selected_avatar_key := coalesce(nullif(p_payload->>'avatarKey',''),participant_row.avatar_key,'bolt');
    if p_action='photo' and (submitted_photo_path is null or not photo_allowed) then raise exception 'photo and consent required' using errcode='23514'; end if;
    if p_action='photo' and submitted_photo_path !~ ('^' || current_session.event_id::text || '/participants/[0-9a-fA-F-]{36}[.]jpg$') then raise exception 'invalid private photo path' using errcode='22023'; end if;
    update public.participants set photo_path=case when p_action='photo' then submitted_photo_path else null end,
      avatar_key=selected_avatar_key,registration_status='PHOTO_CONFIRMED' where id=participant_row.id;
    insert into public.participant_consents(participant_id,photo_allowed,guardian_confirmation,created_by)
    values (participant_row.id,p_action='photo',case when p_action='photo' then 'confirmed_at_reception' else null end,caller);
    next_state := 'AVATAR_PROCESSING';
    update public.reception_sessions set protocol_state=next_state,version=version+1 where id=p_session_id returning * into current_session;
    perform public.enqueue_reception_scene(current_session.id,next_state,p_idempotency_key,jsonb_build_object('title','PROCESANDO AVATAR'));
  elsif p_action = 'complete' then
    if current_session.protocol_state <> 'PLAYER_UNLOCKED' then raise exception 'activation not ready' using errcode='22023'; end if;
    update public.participants set registration_status='ACTIVATED',activated_at=coalesce(activated_at,now()),
      administrative_status='active',operational_status='available',arrived_at=coalesce(arrived_at,now()),departed_at=null
    where id=participant_row.id returning * into participant_row;
    insert into public.participant_activity_preferences(participant_id,activity_id,enabled)
    select participant_row.id,id,true from public.activities where event_id=current_session.event_id and enabled
    on conflict (participant_id,activity_id) do update set enabled=excluded.enabled;
    insert into public.xp_transactions(event_id,participant_id,amount,reason_code,reason,idempotency_key,source_type,source_id,created_by)
    values (current_session.event_id,participant_row.id,100,'NEXUS_ACTIVATION','Activación NEXUS-9','nexus-activation:'||participant_row.id,'participant',participant_row.id,caller)
    on conflict (event_id,idempotency_key) do nothing;
    next_state := 'COMPLETED';
    update public.reception_sessions set protocol_state=next_state,status='completed',completed_at=now(),version=version+1 where id=p_session_id returning * into current_session;
    insert into public.audit_logs(event_id,actor_user_id,action,entity_type,entity_id,new_data)
    values (current_session.event_id,caller,'participant.nexus_activated','participant',participant_row.id,jsonb_build_object('session_id',current_session.id));
  elsif p_action = 'advance' then
    if current_session.status <> 'active' then raise exception 'session is not active' using errcode='22023'; end if;
    next_state := case current_session.protocol_state
      when 'DETECTION' then 'SCANNING'
      when 'SCANNING' then 'IDENTITY_REVEAL'
      when 'IDENTITY_REVEAL' then 'NICKNAME_REQUEST'
      when 'NICKNAME_REQUEST' then 'WAITING_NICKNAME'
      when 'NICKNAME_CONFIRMED' then 'PHOTO_REQUEST'
      when 'PHOTO_REQUEST' then 'PHOTO_COUNTDOWN'
      when 'PHOTO_COUNTDOWN' then 'WAITING_PHOTO'
      when 'AVATAR_PROCESSING' then 'GAMER_CALIBRATION'
      when 'GAMER_CALIBRATION' then 'PLAYER_UNLOCKED'
      else null end;
    if next_state is null then raise exception 'manual confirmation required' using errcode='22023'; end if;
    update public.reception_sessions set protocol_state=next_state,version=version+1 where id=p_session_id returning * into current_session;
    update public.participants set registration_status=case
      when next_state='IDENTITY_REVEAL' then 'IDENTITY_CONFIRMED'
      when next_state in ('NICKNAME_REQUEST','WAITING_NICKNAME') then 'NICKNAME_PENDING'
      when next_state in ('PHOTO_REQUEST','PHOTO_COUNTDOWN','WAITING_PHOTO') then 'PHOTO_PENDING'
      when next_state in ('AVATAR_PROCESSING','GAMER_CALIBRATION','PLAYER_UNLOCKED') then 'PROCESSING'
      else registration_status end
    where id=participant_row.id;
    perform public.enqueue_reception_scene(current_session.id,next_state,p_idempotency_key,'{}'::jsonb);
  else
    raise exception 'invalid reception action' using errcode='22023';
  end if;

  insert into public.reception_session_events(session_id,from_state,to_state,action,payload,idempotency_key,created_by)
  values (p_session_id,old_state,next_state,p_action,coalesce(p_payload,'{}'::jsonb),p_idempotency_key,caller)
  on conflict (session_id,idempotency_key) do nothing;
  return current_session;
end;
$$;
revoke all on function public.control_reception_session(uuid,integer,text,jsonb,uuid,text) from public, anon;
grant execute on function public.control_reception_session(uuid,integer,text,jsonb,uuid,text) to authenticated;

