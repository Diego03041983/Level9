-- Fix issues found by `supabase db lint --remote` after the first production push.

create or replace function public.validate_mission_code(target_mission uuid, submitted_code text, target_device uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  code_hash text;
  mission_event uuid;
  accepted boolean := false;
begin
  select secret_code_hash, event_id into code_hash, mission_event
  from public.missions where id = target_mission for update;
  if code_hash is null then return false; end if;
  if not public.has_event_role(mission_event, array['owner','admin','operator','display']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  accepted := extensions.crypt(submitted_code, code_hash) = code_hash;
  insert into public.mission_attempts(mission_id, display_device_id, success)
  values (target_mission, target_device, accepted);
  if accepted then
    update public.missions set status = 'unlocked', unlocked_at = coalesce(unlocked_at, now()) where id = target_mission;
  end if;
  return accepted;
end;
$$;

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
  on conflict on constraint scene_events_event_id_idempotency_key_key do update
    set idempotency_key = excluded.idempotency_key
  returning * into queued;
  return queued;
end;
$$;

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
  found_scene_id uuid;
  found_event_id uuid;
  caller uuid := auth.uid();
  logged public.scene_playback_logs;
begin
  if playback_status not in ('received','started','completed','failed','skipped') then
    raise exception 'invalid playback status' using errcode = '22023';
  end if;
  select s.id, s.event_id into found_scene_id, found_event_id
  from public.scene_events s
  join public.display_devices d on d.id = target_device and d.event_id = s.event_id
  where s.id = target_scene and d.revoked_at is null
    and (s.target_device_id is null or s.target_device_id = target_device)
  for update of s;
  if found_scene_id is null then raise exception 'scene or display not found' using errcode = 'P0002'; end if;
  if caller is null or not public.has_event_role(found_event_id, array['owner','admin','operator','display']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.scene_playback_logs(scene_event_id, device_id, status, error_message)
  values (target_scene, target_device, playback_status, left(ack_scene_playback.error_message, 1000))
  on conflict on constraint scene_playback_logs_scene_event_id_device_id_status_key do update
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

-- CREATE OR REPLACE keeps prior ACLs, but state the intended grants explicitly.
revoke all on function public.validate_mission_code(uuid,text,uuid) from public, anon;
revoke all on function public.enqueue_scene(uuid,text,jsonb,text,smallint,integer,jsonb,jsonb,text,uuid,timestamptz) from public, anon;
revoke all on function public.ack_scene_playback(uuid,uuid,text,text) from public, anon;
grant execute on function public.validate_mission_code(uuid,text,uuid) to authenticated;
grant execute on function public.enqueue_scene(uuid,text,jsonb,text,smallint,integer,jsonb,jsonb,text,uuid,timestamptz) to authenticated;
grant execute on function public.ack_scene_playback(uuid,uuid,text,text) to authenticated;

