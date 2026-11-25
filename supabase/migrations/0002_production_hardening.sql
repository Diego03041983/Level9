-- Production hardening and operational RPCs.
-- This migration intentionally does not rewrite 0001: deployed environments keep
-- a linear, auditable history.

-- -----------------------------------------------------------------------------
-- Explicit API grants
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke execute on all functions in schema public from public, anon, authenticated;

-- RLS remains the authorization boundary for authenticated table access. Tables
-- without a policy remain inaccessible even though the schema grant exists.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;

grant execute on function public.has_event_role(uuid, text[]) to authenticated;
grant execute on function public.participant_event(uuid) to authenticated;
grant execute on function public.reserve_station(uuid, uuid, uuid[], text, uuid) to authenticated;
grant execute on function public.validate_mission_code(uuid, text, uuid) to authenticated;

-- Check-in users can see the roster but all mutation now goes through guarded
-- RPCs. Owner/admin/operator retain direct CRUD for operational administration.
drop policy if exists participants_operator_write on public.participants;

create policy participants_admin_insert on public.participants for insert to authenticated
with check (public.has_event_role(event_id, array['owner','admin','operator']));

create policy participants_admin_update on public.participants for update to authenticated
using (public.has_event_role(event_id, array['owner','admin','operator']))
with check (public.has_event_role(event_id, array['owner','admin','operator']));

create policy participants_admin_delete on public.participants for delete to authenticated
using (public.has_event_role(event_id, array['owner','admin']));

drop policy if exists consents_privileged on public.participant_consents;

create policy consents_operator_select on public.participant_consents for select to authenticated
using (public.has_event_role(public.participant_event(participant_id), array['owner','admin','operator','checkin']));

create policy consents_admin_write on public.participant_consents for all to authenticated
using (public.has_event_role(public.participant_event(participant_id), array['owner','admin','operator']))
with check (public.has_event_role(public.participant_event(participant_id), array['owner','admin','operator']));

-- Displays receive short-lived signed media URLs from server code. They must not
-- be able to list the whole private bucket. Check-in can upload, but cannot list.
drop policy if exists event_private_read on storage.objects;
drop policy if exists event_private_write on storage.objects;
drop policy if exists event_private_update on storage.objects;
drop policy if exists event_private_delete on storage.objects;

create policy event_private_operator_read on storage.objects for select to authenticated
using (
  bucket_id = 'event-private'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator'])
    else false
  end
);

create policy event_private_checkin_upload on storage.objects for insert to authenticated
with check (
  bucket_id = 'event-private'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator','checkin'])
    else false
  end
);

create policy event_private_operator_update on storage.objects for update to authenticated
using (
  bucket_id = 'event-private'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator'])
    else false
  end
)
with check (
  bucket_id = 'event-private'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator'])
    else false
  end
);

create policy event_private_admin_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'event-private'
  and case
    when (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin'])
    else false
  end
);

-- -----------------------------------------------------------------------------
-- Safe bootstrap
-- -----------------------------------------------------------------------------

create or replace function public.bootstrap_event(
  event_name text,
  celebrant_name text,
  celebrant_age smallint,
  starts_at timestamptz,
  ends_at timestamptz,
  event_timezone text default 'America/Argentina/Cordoba',
  event_subtitle text default 'Gamer Party',
  demo boolean default false
) returns public.events
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  created_event public.events;
begin
  if caller is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if nullif(btrim(event_name), '') is null or nullif(btrim(celebrant_name), '') is null then
    raise exception 'event and celebrant names are required' using errcode = '22023';
  end if;
  if ends_at <= starts_at then
    raise exception 'event end must be after start' using errcode = '22023';
  end if;
  if exists (select 1 from public.event_users where user_id = caller and role = 'owner') then
    raise exception 'this account already owns an event' using errcode = '23505';
  end if;

  insert into public.events(name, subtitle, celebrant_name, celebrant_age, starts_at, ends_at, timezone, status, is_demo)
  values (btrim(event_name), nullif(btrim(event_subtitle), ''), btrim(celebrant_name), celebrant_age,
          starts_at, ends_at, event_timezone, 'draft', demo)
  returning * into created_event;

  insert into public.event_users(event_id, user_id, role)
  values (created_event.id, caller, 'owner');
  insert into public.event_settings(event_id) values (created_event.id);

  insert into public.audit_logs(event_id, actor_user_id, action, entity_type, entity_id, new_data)
  values (created_event.id, caller, 'event.bootstrap', 'event', created_event.id,
          jsonb_build_object('name', created_event.name, 'is_demo', created_event.is_demo));
  return created_event;
end;
$$;

revoke all on function public.bootstrap_event(text,text,smallint,timestamptz,timestamptz,text,text,boolean) from public, anon;
grant execute on function public.bootstrap_event(text,text,smallint,timestamptz,timestamptz,text,text,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Atomic player check-in with consent, XP and optional welcome scene
-- -----------------------------------------------------------------------------

create or replace function public.checkin_participant(
  target_event uuid,
  participant_first_name text,
  photo_allowed boolean,
  participant_id uuid default null,
  participant_last_name text default null,
  gamer_tag text default null,
  avatar_key text default null,
  photo_path text default null,
  guardian_confirmation text default null,
  is_celebrant boolean default false
) returns public.participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  new_id uuid := coalesce(participant_id, gen_random_uuid());
  next_number integer;
  checked_in public.participants;
  should_welcome boolean := false;
begin
  if caller is null or not public.has_event_role(target_event, array['owner','admin','operator','checkin']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(btrim(participant_first_name), '') is null then
    raise exception 'first name is required' using errcode = '22023';
  end if;
  if photo_path is not null and not photo_allowed then
    raise exception 'photo path requires photo consent' using errcode = '23514';
  end if;
  if photo_allowed and nullif(btrim(guardian_confirmation), '') is null then
    raise exception 'guardian confirmation is required for photos' using errcode = '23514';
  end if;
  if photo_path is not null and photo_path not like target_event::text || '/participants/' || new_id::text || '/%' then
    raise exception 'invalid private photo path' using errcode = '22023';
  end if;

  -- Lock the event row so concurrent check-ins cannot select the same number.
  perform 1 from public.events where id = target_event for update;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;
  select coalesce(max(player_number), 0) + 1 into next_number
  from public.participants where event_id = target_event;

  insert into public.participants(
    id, event_id, first_name, last_name, gamer_tag, player_number,
    avatar_key, photo_path, is_celebrant, administrative_status,
    operational_status, arrived_at, is_demo
  )
  select new_id, target_event, btrim(participant_first_name), nullif(btrim(participant_last_name), ''),
         nullif(btrim(gamer_tag), ''), next_number, avatar_key, photo_path, is_celebrant,
         'active', 'available', now(), e.is_demo
  from public.events e where e.id = target_event
  returning * into checked_in;

  insert into public.participant_consents(participant_id, photo_allowed, guardian_confirmation, created_by)
  values (new_id, photo_allowed, nullif(btrim(guardian_confirmation), ''), caller);

  insert into public.participant_activity_preferences(participant_id, activity_id, enabled)
  select new_id, id, true from public.activities where event_id = target_event and enabled;

  insert into public.xp_transactions(event_id, participant_id, amount, reason_code, reason, idempotency_key, source_type, source_id, created_by)
  values (target_event, new_id, 100, 'CHECKIN', 'Registro de jugador', 'checkin:' || new_id::text, 'participant', new_id, caller);

  select auto_welcome into should_welcome from public.event_settings where event_id = target_event;
  if coalesce(should_welcome, false) then
    insert into public.scene_events(
      event_id, scene_type, payload, priority, duration_ms, sound,
      interrupt_policy, idempotency_key, created_by
    ) values (
      target_event, 'PLAYER_UNLOCKED',
      jsonb_build_object(
        'participantId', new_id,
        'firstName', checked_in.first_name,
        'gamerTag', checked_in.gamer_tag,
        'playerNumber', checked_in.player_number,
        'avatarKey', checked_in.avatar_key,
        'photoPath', checked_in.photo_path
      ),
      70, 9000, jsonb_build_object('asset', 'player-unlocked'),
      'queue', 'checkin-welcome:' || new_id::text, caller
    );
  end if;

  insert into public.audit_logs(event_id, actor_user_id, action, entity_type, entity_id, new_data)
  values (target_event, caller, 'participant.checkin', 'participant', new_id,
          jsonb_build_object('photo_allowed', photo_allowed, 'player_number', next_number));
  return checked_in;
end;
$$;

revoke all on function public.checkin_participant(uuid,text,boolean,uuid,text,text,text,text,text,boolean) from public, anon;
grant execute on function public.checkin_participant(uuid,text,boolean,uuid,text,text,text,text,text,boolean) to authenticated;

-- -----------------------------------------------------------------------------
-- Scene queue and playback acknowledgement
-- -----------------------------------------------------------------------------

create or replace function public.enqueue_scene(
  target_event uuid,
  scene_type text,
  scene_payload jsonb,
  idempotency_key text,
  priority smallint default 50,
  duration_ms integer default 8000,
  sound jsonb default '{}'::jsonb,
  animation jsonb default '{}'::jsonb,
  interrupt_policy text default 'queue',
  target_device uuid default null,
  scheduled_at timestamptz default now()
) returns public.scene_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  queued public.scene_events;
begin
  if caller is null or not public.has_event_role(target_event, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if target_device is not null and not exists (
    select 1 from public.display_devices d
    where d.id = target_device and d.event_id = target_event and d.revoked_at is null
  ) then
    raise exception 'invalid display target' using errcode = '22023';
  end if;
  insert into public.scene_events(
    event_id, scene_type, payload, priority, duration_ms, scheduled_at,
    sound, animation, interrupt_policy, target_device_id, idempotency_key, created_by
  ) values (
    target_event, scene_type, coalesce(scene_payload, '{}'::jsonb), priority,
    duration_ms, scheduled_at, coalesce(sound, '{}'::jsonb),
    coalesce(animation, '{}'::jsonb), interrupt_policy, target_device,
    idempotency_key, caller
  )
  on conflict (event_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning * into queued;
  return queued;
end;
$$;

revoke all on function public.enqueue_scene(uuid,text,jsonb,text,smallint,integer,jsonb,jsonb,text,uuid,timestamptz) from public, anon;
grant execute on function public.enqueue_scene(uuid,text,jsonb,text,smallint,integer,jsonb,jsonb,text,uuid,timestamptz) to authenticated;

create or replace function public.ack_scene_playback(
  target_scene uuid,
  target_device uuid,
  playback_status text,
  error_message text default null
) returns public.scene_playback_logs
language plpgsql
security definer
set search_path = ''
as $$
declare
  scene_event_id uuid;
  scene_event_event uuid;
  caller uuid := auth.uid();
  logged public.scene_playback_logs;
begin
  if playback_status not in ('received','started','completed','failed','skipped') then
    raise exception 'invalid playback status' using errcode = '22023';
  end if;
  select s.id, s.event_id into scene_event_id, scene_event_event
  from public.scene_events s
  join public.display_devices d on d.id = target_device and d.event_id = s.event_id
  where s.id = target_scene and d.revoked_at is null
    and (s.target_device_id is null or s.target_device_id = target_device)
  for update of s;
  if scene_event_id is null then raise exception 'scene or display not found' using errcode = 'P0002'; end if;
  if caller is null or not public.has_event_role(scene_event_event, array['owner','admin','operator','display']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.scene_playback_logs(scene_event_id, device_id, status, error_message)
  values (target_scene, target_device, playback_status, left(error_message, 1000))
  on conflict (scene_event_id, device_id, status) do update
    set occurred_at = excluded.occurred_at,
        error_message = excluded.error_message
  returning * into logged;

  update public.scene_events set status = case playback_status
    when 'received' then case when status = 'queued' then 'delivered' else status end
    when 'started' then 'playing'
    when 'completed' then 'played'
    when 'failed' then 'failed'
    when 'skipped' then 'skipped'
  end where id = target_scene;
  return logged;
end;
$$;

revoke all on function public.ack_scene_playback(uuid,uuid,text,text) from public, anon;
grant execute on function public.ack_scene_playback(uuid,uuid,text,text) to authenticated;

create or replace function public.display_heartbeat(
  target_device uuid,
  audio_enabled boolean,
  device_metadata jsonb default '{}'::jsonb
) returns public.display_devices
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  device_event uuid;
  heartbeat public.display_devices;
begin
  select event_id into device_event from public.display_devices
  where id = target_device and revoked_at is null for update;
  if device_event is null then raise exception 'display not found or revoked' using errcode = 'P0002'; end if;
  if caller is null or not public.has_event_role(device_event, array['owner','admin','operator','display']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.display_devices
  set last_seen_at = now(),
      audio_enabled = display_heartbeat.audio_enabled,
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(device_metadata, '{}'::jsonb)
  where id = target_device
  returning * into heartbeat;
  return heartbeat;
end;
$$;

revoke all on function public.display_heartbeat(uuid,boolean,jsonb) from public, anon;
grant execute on function public.display_heartbeat(uuid,boolean,jsonb) to authenticated;

-- Displays may read their playback records; only the guarded RPC writes them.
create policy playback_logs_member_select on public.scene_playback_logs for select to authenticated
using (
  exists (
    select 1
    from public.scene_events s
    where s.id = scene_event_id
      and public.has_event_role(s.event_id, array['owner','admin','operator','display'])
  )
);

-- -----------------------------------------------------------------------------
-- Realtime publication and complete update payloads
-- -----------------------------------------------------------------------------

alter table public.participants replica identity full;
alter table public.stations replica identity full;
alter table public.station_assignments replica identity full;
alter table public.matches replica identity full;
alter table public.match_results replica identity full;
alter table public.scene_events replica identity full;
alter table public.scene_playback_logs replica identity full;
alter table public.display_devices replica identity full;
alter table public.mission_progress replica identity full;
alter table public.xp_transactions replica identity full;
alter table public.schedule_items replica identity full;
alter table public.announcements replica identity full;

do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'participants', 'stations', 'station_assignments', 'matches',
    'match_results', 'scene_events', 'scene_playback_logs', 'display_devices',
    'mission_progress', 'xp_transactions', 'schedule_items', 'announcements'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = relation_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', relation_name);
    end if;
  end loop;
end;
$$;

