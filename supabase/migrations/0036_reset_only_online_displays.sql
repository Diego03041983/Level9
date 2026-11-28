-- Keep rehearsal resets from leaving stale TV home commands.
create or replace function public.reset_level9_mission_run(p_event_id uuid, p_mission_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_mission public.missions%rowtype;
  v_device record;
begin
  if not public.has_event_role(p_event_id, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_mission from public.missions
    where id = p_mission_id and event_id = p_event_id for update;
  if not found then raise exception 'mission not found' using errcode = '22023'; end if;

  -- Retire every scene from this mission run, including the fixed finale key.
  -- Deleting scenes also removes their playback logs and prevents stale TV acks
  -- from starting the clock or restoring Nexus after the reset.
  delete from public.audiovisual_events
    where event_id = p_event_id and created_at >= v_mission.created_at
      and (event_key like 'MISSION_%' or event_key = 'NEXUS_RESTORED');
  delete from public.scene_events
    where event_id = p_event_id and created_at >= v_mission.created_at
      and (
        (scene_type = 'GLITCH_DEFEATED' and payload->>'missionId' = p_mission_id::text)
        or payload->>'eventKey' like 'MISSION_%'
        or payload->>'eventKey' = 'NEXUS_RESTORED'
      );

  delete from public.scene_events where event_id = p_event_id
    and idempotency_key like 'mission-reset:'||p_mission_id||':%'
    and status in ('queued','delivered','playing');

  delete from public.mission_challenge_states where mission_id = p_mission_id;
  delete from public.mission_progress where mission_id = p_mission_id;
  delete from public.mission_attempts where mission_id = p_mission_id;
  update public.mission_teams set code_fragments = '{}'::text[] where mission_id = p_mission_id;
  update public.mission_digit_slots set digit = null, revealed_at = null where mission_id = p_mission_id;
  update public.missions set status = 'ready', started_at = null, paused_at = null,
    paused_seconds = 0, extension_seconds = 0, warnings_sent = '{}'::jsonb,
    unlocked_at = null, completed_at = null, challenge_run_id = gen_random_uuid()
    where id = p_mission_id;

  -- Stop scenes on displays currently online; offline TVs receive no stale command.
  for v_device in select id from public.display_devices
    where event_id = p_event_id and revoked_at is null
      and last_seen_at >= clock_timestamp() - interval '60 seconds' loop
    insert into public.scene_events(event_id,scene_type,payload,priority,duration_ms,
      sound,animation,interrupt_policy,status,target_device_id,idempotency_key)
    values(p_event_id,'DISPLAY_COMMAND','{"action":"home","title":"Pantalla general"}'::jsonb,
      100,2000,'{}'::jsonb,'{}'::jsonb,'force','queued',v_device.id,
      'mission-reset:'||p_mission_id||':'||v_device.id||':'||gen_random_uuid());
  end loop;
end; $$;
revoke all on function public.reset_level9_mission_run(uuid,uuid) from public, anon;
grant execute on function public.reset_level9_mission_run(uuid,uuid) to authenticated;
