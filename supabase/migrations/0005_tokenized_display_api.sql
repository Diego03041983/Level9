-- Token-authenticated TV API. These are the only RPCs intentionally executable
-- by `anon`; every call validates the one-time display session token server-side.

create or replace function public.valid_display_session(
  p_device_id uuid,
  p_session_token text
) returns table (event_id uuid, session_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select d.event_id, s.id
  from public.display_devices d
  join public.display_sessions s on s.device_id = d.id
  where d.id = p_device_id
    and d.revoked_at is null
    and s.revoked_at is null
    and s.expires_at > now()
    and char_length(p_session_token) between 32 and 512
    and s.token_hash = encode(extensions.digest(p_session_token, 'sha256'), 'hex')
  limit 1;
$$;

-- Deliberately private helper: callers use the scoped RPCs below.
revoke all on function public.valid_display_session(uuid,text) from public, anon, authenticated;

create or replace function public.fetch_display_state(
  p_device_id uuid,
  p_session_token text,
  p_event_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized_event uuid;
  authorized_session uuid;
  result jsonb;
begin
  select v.event_id, v.session_id into authorized_event, authorized_session
  from public.valid_display_session(p_device_id, p_session_token) v;
  if authorized_event is null or authorized_event <> p_event_id then
    raise exception 'invalid display session' using errcode = '42501';
  end if;

  update public.display_devices set last_seen_at = now() where id = p_device_id;
  update public.display_sessions set last_seen_at = now() where id = authorized_session;

  select jsonb_build_object(
    'eventId', authorized_event,
    'deviceId', p_device_id,
    'serverTime', now(),
    'scenes', coalesce(jsonb_agg(to_jsonb(q) order by q.priority desc, q.scheduled_at asc), '[]'::jsonb)
  ) into result
  from (
    select s.id, s.event_id, s.scene_type, s.payload, s.priority,
           s.duration_ms, s.scheduled_at, s.sound, s.animation,
           s.interrupt_policy, s.status, s.target_device_id, s.created_at
    from public.scene_events s
    where s.event_id = authorized_event
      and s.status in ('queued','delivered','playing')
      and s.created_at >= now() - interval '1 hour'
      and s.scheduled_at <= now() + interval '30 seconds'
      and (s.target_device_id is null or s.target_device_id = p_device_id)
    order by s.priority desc, s.scheduled_at asc
    limit 30
  ) q;
  return result;
end;
$$;

create or replace function public.heartbeat_display_session(
  p_device_id uuid,
  p_session_token text,
  p_audio_enabled boolean default false,
  p_metadata jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized_event uuid;
  authorized_session uuid;
  heartbeat_at timestamptz := now();
begin
  select v.event_id, v.session_id into authorized_event, authorized_session
  from public.valid_display_session(p_device_id, p_session_token) v;
  if authorized_event is null then
    raise exception 'invalid display session' using errcode = '42501';
  end if;
  -- Only operational metadata is accepted; cap its serialized size.
  if octet_length(coalesce(p_metadata, '{}'::jsonb)::text) > 4096 then
    raise exception 'display metadata is too large' using errcode = '22023';
  end if;
  update public.display_devices
  set last_seen_at = heartbeat_at,
      audio_enabled = p_audio_enabled,
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb)
  where id = p_device_id;
  update public.display_sessions set last_seen_at = heartbeat_at where id = authorized_session;
  return jsonb_build_object(
    'ok', true,
    'eventId', authorized_event,
    'deviceId', p_device_id,
    'serverTime', heartbeat_at
  );
end;
$$;

create or replace function public.ack_display_scene(
  p_device_id uuid,
  p_session_token text,
  p_scene_id uuid,
  p_status text,
  p_error_message text default null
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized_event uuid;
  authorized_session uuid;
begin
  if p_status not in ('received','started','completed','failed','skipped') then
    raise exception 'invalid playback status' using errcode = '22023';
  end if;
  select v.event_id, v.session_id into authorized_event, authorized_session
  from public.valid_display_session(p_device_id, p_session_token) v;
  if authorized_event is null then
    raise exception 'invalid display session' using errcode = '42501';
  end if;
  perform 1 from public.scene_events s
  where s.id = p_scene_id
    and s.event_id = authorized_event
    and (s.target_device_id is null or s.target_device_id = p_device_id)
  for update;
  if not found then
    raise exception 'scene not found for display' using errcode = 'P0002';
  end if;

  insert into public.scene_playback_logs(scene_event_id, device_id, status, error_message)
  values (p_scene_id, p_device_id, p_status, left(p_error_message, 1000))
  on conflict on constraint scene_playback_logs_scene_event_id_device_id_status_key do update
    set occurred_at = excluded.occurred_at,
        error_message = excluded.error_message;

  update public.scene_events set status = case p_status
    when 'received' then case when status = 'queued' then 'delivered' else status end
    when 'started' then 'playing'
    when 'completed' then 'played'
    when 'failed' then 'failed'
    when 'skipped' then 'skipped'
  end where id = p_scene_id;
  update public.display_devices set last_seen_at = now() where id = p_device_id;
  update public.display_sessions set last_seen_at = now() where id = authorized_session;
  return true;
end;
$$;

revoke all on function public.fetch_display_state(uuid,text,uuid) from public;
revoke all on function public.heartbeat_display_session(uuid,text,boolean,jsonb) from public;
revoke all on function public.ack_display_scene(uuid,text,uuid,text,text) from public;

grant execute on function public.fetch_display_state(uuid,text,uuid) to anon, authenticated;
grant execute on function public.heartbeat_display_session(uuid,text,boolean,jsonb) to anon, authenticated;
grant execute on function public.ack_display_scene(uuid,text,uuid,text,text) to anon, authenticated;

