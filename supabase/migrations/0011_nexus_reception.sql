-- NEXUS-9 reception protocol. Existing participants are preserved and backfilled
-- as activated when they already completed check-in.

alter table public.participants
  add column if not exists registration_status text not null default 'PRELOADED'
    check (registration_status in (
      'PRELOADED','CHECKIN_STARTED','IDENTITY_CONFIRMED','NICKNAME_PENDING',
      'NICKNAME_CONFIRMED','PHOTO_PENDING','PHOTO_CONFIRMED','PROCESSING',
      'ACTIVATED','CANCELLED'
    )),
  add column if not exists activated_at timestamptz;

update public.participants
set registration_status = 'ACTIVATED',
    activated_at = coalesce(activated_at, arrived_at, created_at)
where arrived_at is not null and administrative_status = 'active';

create unique index if not exists participants_event_gamer_tag_unique
  on public.participants(event_id, lower(gamer_tag))
  where gamer_tag is not null and btrim(gamer_tag) <> '' and administrative_status <> 'withdrawn';
create index if not exists participants_registration_idx
  on public.participants(event_id, registration_status, player_number);

create or replace function public.sync_participant_activation_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.arrived_at is not null and new.administrative_status = 'active'
     and new.registration_status in ('PRELOADED','CHECKIN_STARTED','IDENTITY_CONFIRMED','NICKNAME_PENDING','NICKNAME_CONFIRMED','PHOTO_PENDING','PHOTO_CONFIRMED','PROCESSING') then
    new.registration_status := 'ACTIVATED';
    new.activated_at := coalesce(new.activated_at, new.arrived_at, now());
  end if;
  return new;
end;
$$;
drop trigger if exists participants_activation_status on public.participants;
create trigger participants_activation_status
before insert or update on public.participants
for each row execute function public.sync_participant_activation_status();

create table public.reception_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  display_device_id uuid references public.display_devices(id) on delete set null,
  protocol_mode text not null default 'full' check (protocol_mode in ('full','quick','demo')),
  protocol_state text not null default 'DETECTION' check (protocol_state in (
    'STANDBY','DETECTION','SCANNING','IDENTITY_REVEAL','NICKNAME_REQUEST',
    'WAITING_NICKNAME','NICKNAME_CONFIRMED','PHOTO_REQUEST','PHOTO_COUNTDOWN',
    'WAITING_PHOTO','AVATAR_PROCESSING','GAMER_CALIBRATION','PLAYER_UNLOCKED','COMPLETED'
  )),
  status text not null default 'active' check (status in ('queued','active','paused','completed','cancelled')),
  version integer not null default 1 check (version > 0),
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create unique index reception_one_active_participant
  on public.reception_sessions(participant_id) where status in ('active','paused');
create unique index reception_one_active_display
  on public.reception_sessions(display_device_id) where display_device_id is not null and status in ('active','paused');
create index reception_event_status_idx on public.reception_sessions(event_id, status, started_at desc);
create trigger reception_sessions_updated before update on public.reception_sessions
for each row execute function public.set_updated_at();

create table public.reception_session_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.reception_sessions(id) on delete cascade,
  from_state text,
  to_state text,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  idempotency_key text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (session_id, idempotency_key)
);
create index reception_events_session_idx on public.reception_session_events(session_id, created_at);

create table public.reception_media_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete cascade,
  scene_key text not null check (char_length(scene_key) between 2 and 80),
  media_kind text not null check (media_kind in ('video','audio')),
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  cue_ms integer not null default 0 check (cue_ms between 0 and 600000),
  loop boolean not null default false,
  volume numeric(4,3) not null default 1 check (volume between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (event_id, participant_id, scene_key, media_kind)
);
create index reception_media_lookup_idx on public.reception_media_assignments(event_id, scene_key, participant_id);
create trigger reception_media_updated before update on public.reception_media_assignments
for each row execute function public.set_updated_at();

alter table public.reception_sessions enable row level security;
alter table public.reception_session_events enable row level security;
alter table public.reception_media_assignments enable row level security;

create policy reception_sessions_admin on public.reception_sessions for all to authenticated
using (public.has_event_role(event_id, array['owner','admin','operator','checkin']))
with check (public.has_event_role(event_id, array['owner','admin','operator','checkin']));
create policy reception_events_admin on public.reception_session_events for all to authenticated
using (exists (
  select 1 from public.reception_sessions rs where rs.id = session_id
  and public.has_event_role(rs.event_id, array['owner','admin','operator','checkin'])
))
with check (exists (
  select 1 from public.reception_sessions rs where rs.id = session_id
  and public.has_event_role(rs.event_id, array['owner','admin','operator','checkin'])
));
create policy reception_media_admin on public.reception_media_assignments for all to authenticated
using (public.has_event_role(event_id, array['owner','admin','operator']))
with check (public.has_event_role(event_id, array['owner','admin','operator']));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-media', 'event-media', false, 104857600, array['video/mp4','audio/wav','audio/x-wav','audio/mpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy event_media_member_read on storage.objects for select to authenticated
using (
  bucket_id = 'event-media'
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator','checkin'])
    else false end
);
create policy event_media_admin_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-media'
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator'])
    else false end
);
create policy event_media_admin_update on storage.objects for update to authenticated
using (
  bucket_id = 'event-media'
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator'])
    else false end
)
with check (
  bucket_id = 'event-media'
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator'])
    else false end
);
create policy event_media_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'event-media'
  and case when (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin'])
    else false end
);

create or replace function public.enqueue_reception_scene(
  p_session_id uuid,
  p_scene_key text,
  p_idempotency_key text,
  p_extra_payload jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  session_row public.reception_sessions%rowtype;
  participant_row public.participants%rowtype;
  video_path text;
  video_loop boolean := false;
  video_duration integer := 0;
  audio_path text;
  audio_volume numeric := 1;
  audio_cue integer := 0;
  audio_duration integer := 0;
  queued_id uuid;
  scene_duration integer := 12000;
  media_scene_key text;
begin
  select * into session_row from public.reception_sessions where id = p_session_id;
  if not found then raise exception 'reception session not found' using errcode = 'P0002'; end if;
  select * into participant_row from public.participants where id = session_row.participant_id;
  media_scene_key := case when participant_row.is_celebrant and p_scene_key = 'PLAYER_UNLOCKED' then 'BIRTHDAY_HERO' else p_scene_key end;

  select ma.storage_path, rma.loop, coalesce((ma.metadata->>'durationMs')::integer,0) into video_path, video_loop, video_duration
  from public.reception_media_assignments rma
  join public.media_assets ma on ma.id = rma.media_asset_id
  where rma.event_id = session_row.event_id and rma.scene_key = media_scene_key
    and rma.media_kind = 'video' and (rma.participant_id = session_row.participant_id or rma.participant_id is null)
  order by (rma.participant_id is not null) desc limit 1;

  select ma.storage_path, rma.volume, rma.cue_ms, coalesce((ma.metadata->>'durationMs')::integer,0) into audio_path, audio_volume, audio_cue, audio_duration
  from public.reception_media_assignments rma
  join public.media_assets ma on ma.id = rma.media_asset_id
  where rma.event_id = session_row.event_id and rma.scene_key = media_scene_key
    and rma.media_kind = 'audio' and (rma.participant_id = session_row.participant_id or rma.participant_id is null)
  order by (rma.participant_id is not null) desc limit 1;

  scene_duration := least(600000, greatest(scene_duration, video_duration + 1000, audio_cue + audio_duration + 1000));
  if p_scene_key in ('WAITING_NICKNAME','WAITING_PHOTO','STANDBY') then scene_duration := 600000; end if;

  update public.scene_events
  set status = 'expired'
  where event_id = session_row.event_id
    and payload->>'sessionId' = session_row.id::text
    and status in ('queued','delivered','playing');

  insert into public.scene_events(
    event_id, scene_type, payload, priority, duration_ms, sound, animation,
    interrupt_policy, target_device_id, idempotency_key, created_by
  ) values (
    session_row.event_id,
    'NEXUS_' || p_scene_key,
    jsonb_strip_nulls(jsonb_build_object(
      'sessionId', session_row.id,
      'participantId', participant_row.id,
      'firstName', participant_row.first_name,
      'lastName', participant_row.last_name,
      'gamerTag', participant_row.gamer_tag,
      'playerNumber', participant_row.player_number,
      'avatarKey', participant_row.avatar_key,
      'photoPath', participant_row.photo_path,
      'isCelebrant', participant_row.is_celebrant,
      'state', p_scene_key,
      'videoPath', video_path,
      'videoLoop', coalesce(video_loop, false)
    )) || coalesce(p_extra_payload, '{}'::jsonb),
    case when p_scene_key in ('PLAYER_UNLOCKED','IDENTITY_REVEAL') then 95 else 88 end,
    scene_duration,
    jsonb_strip_nulls(jsonb_build_object('path', audio_path, 'volume', audio_volume, 'cueMs', audio_cue)),
    jsonb_build_object('preset', 'nexus', 'reducedMotionSafe', true),
    'force', session_row.display_device_id, p_idempotency_key, session_row.created_by
  )
  on conflict (event_id, idempotency_key) do update set idempotency_key = excluded.idempotency_key
  returning id into queued_id;
  return queued_id;
end;
$$;
revoke all on function public.enqueue_reception_scene(uuid,text,text,jsonb) from public, anon, authenticated;

create or replace function public.import_reception_guests(
  p_event_id uuid,
  p_guests jsonb,
  p_actor_user_id uuid
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  guest jsonb;
  next_number integer;
  inserted_count integer := 0;
  new_participant uuid;
begin
  if caller is null or caller <> p_actor_user_id
     or not public.has_event_role(p_event_id, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if jsonb_typeof(p_guests) <> 'array' or jsonb_array_length(p_guests) < 1 or jsonb_array_length(p_guests) > 200 then
    raise exception 'guest list must contain 1 to 200 rows' using errcode = '22023';
  end if;
  perform 1 from public.events where id = p_event_id for update;
  select coalesce(max(player_number), 0) + 1 into next_number from public.participants where event_id = p_event_id;
  for guest in select value from jsonb_array_elements(p_guests) loop
    if nullif(btrim(guest->>'firstName'), '') is null or char_length(btrim(guest->>'firstName')) > 80 then
      raise exception 'invalid guest first name' using errcode = '22023';
    end if;
    new_participant := gen_random_uuid();
    insert into public.participants(
      id,event_id,first_name,last_name,gamer_tag,player_number,avatar_key,is_celebrant,
      administrative_status,operational_status,registration_status,is_demo
    ) select
      new_participant,p_event_id,btrim(guest->>'firstName'),nullif(btrim(guest->>'lastName'),''),null,
      next_number,coalesce(nullif(guest->>'avatarKey',''),'bolt'),coalesce((guest->>'isCelebrant')::boolean,false),
      'invited','unavailable','PRELOADED',e.is_demo
    from public.events e where e.id = p_event_id;
    insert into public.audit_logs(event_id,actor_user_id,action,entity_type,entity_id,new_data)
    values (p_event_id,caller,'participant.preloaded','participant',new_participant,
      jsonb_build_object('source','reception_import','player_number',next_number));
    next_number := next_number + 1;
    inserted_count := inserted_count + 1;
  end loop;
  return inserted_count;
end;
$$;
revoke all on function public.import_reception_guests(uuid,jsonb,uuid) from public, anon;
grant execute on function public.import_reception_guests(uuid,jsonb,uuid) to authenticated;

create or replace function public.start_reception_session(
  p_event_id uuid,
  p_participant_id uuid,
  p_display_device_id uuid,
  p_mode text,
  p_actor_user_id uuid,
  p_idempotency_key text
) returns public.reception_sessions
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := auth.uid();
  created_session public.reception_sessions;
begin
  if caller is null or caller <> p_actor_user_id
     or not public.has_event_role(p_event_id, array['owner','admin','operator','checkin']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_mode not in ('full','quick','demo') then raise exception 'invalid protocol mode' using errcode = '22023'; end if;
  perform 1 from public.participants where id = p_participant_id and event_id = p_event_id for update;
  if not found then raise exception 'participant not found' using errcode = 'P0002'; end if;
  if p_display_device_id is not null and not exists (
    select 1 from public.display_devices where id = p_display_device_id and event_id = p_event_id and revoked_at is null
  ) then raise exception 'display not found' using errcode = 'P0002'; end if;

  insert into public.reception_sessions(event_id,participant_id,display_device_id,protocol_mode,protocol_state,status,created_by)
  values (p_event_id,p_participant_id,p_display_device_id,p_mode,'DETECTION','active',caller)
  returning * into created_session;
  update public.participants set registration_status = 'CHECKIN_STARTED' where id = p_participant_id;
  insert into public.reception_session_events(session_id,from_state,to_state,action,idempotency_key,created_by)
  values (created_session.id,null,'DETECTION','start',p_idempotency_key,caller);
  perform public.enqueue_reception_scene(created_session.id,'DETECTION',p_idempotency_key,jsonb_build_object('title','JUGADOR DETECTADO'));
  return created_session;
end;
$$;
revoke all on function public.start_reception_session(uuid,uuid,uuid,text,uuid,text) from public, anon;
grant execute on function public.start_reception_session(uuid,uuid,uuid,text,uuid,text) to authenticated;

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

alter table public.reception_sessions replica identity full;
alter table public.reception_media_assignments replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reception_sessions') then
    alter publication supabase_realtime add table public.reception_sessions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reception_media_assignments') then
    alter publication supabase_realtime add table public.reception_media_assignments;
  end if;
end $$;
