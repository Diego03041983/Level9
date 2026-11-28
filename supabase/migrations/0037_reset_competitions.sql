-- Reset one event's competition runs without touching players, media or mission state.
create or replace function public.reset_event_competitions(p_event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_player_ids uuid[];
  v_station_ids uuid[];
  v_tournament_count integer;
  v_group_count integer;
  v_keys text[] := array[
    'DRAW_STARTED','DRAW_CONFIRMED','MATCH_CALLED','METEGOL_NEXT_MATCH',
    'MATCH_STARTED','MATCH_FINISHED','WINNER_CONFIRMED','SEMIFINAL_ANNOUNCED',
    'FINAL_ANNOUNCED','CHAMPION_CONFIRMED','ROBLOX_CHALLENGE_CREATED',
    'ROBLOX_PLAYERS_CALLED','ROBLOX_CHALLENGE_STARTED','ROBLOX_TIME_WARNING',
    'ROBLOX_CHALLENGE_FINISHED','ROBLOX_WINNER_CONFIRMED','ROBLOX_ROTATION'
  ];
  v_device record;
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform 1 from public.events where id = p_event_id for update;
  if not found then raise exception 'event not found' using errcode = '22023'; end if;

  select count(*) into v_tournament_count from public.tournaments where event_id = p_event_id;
  select count(*) into v_group_count from public.challenges c
    join public.activities a on a.id = c.activity_id
    where c.event_id = p_event_id and a.activity_type = 'roblox'
      and c.rules->>'discipline' is not null;

  -- Capture only reservations owned by these competition runs. Manual and mission
  -- reservations must keep their players and resources occupied.
  select array_agg(distinct sa.participant_id), array_agg(distinct sa.station_id)
    into v_player_ids, v_station_ids
    from public.station_assignments sa
    where sa.event_id = p_event_id and sa.status in ('reserved','active')
      and (sa.context_type = 'match' and exists (
        select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id
        where m.id = sa.context_id and t.event_id = p_event_id
      ) or sa.context_type = 'challenge' and exists (
        select 1 from public.challenges c join public.activities a on a.id = c.activity_id
        where c.id = sa.context_id and c.event_id = p_event_id
          and a.activity_type = 'roblox' and c.rules->>'discipline' is not null
      ));

  delete from public.station_assignments sa where sa.event_id = p_event_id
    and (sa.context_type = 'match' and exists (
      select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id
      where m.id = sa.context_id and t.event_id = p_event_id
    ) or sa.context_type = 'challenge' and exists (
      select 1 from public.challenges c join public.activities a on a.id = c.activity_id
      where c.id = sa.context_id and c.event_id = p_event_id
        and a.activity_type = 'roblox' and c.rules->>'discipline' is not null
    ));

  update public.participants p set operational_status = 'available'
    where p.event_id = p_event_id and p.id = any(coalesce(v_player_ids,'{}'::uuid[]))
      and p.operational_status in ('called','competing')
      and not exists(select 1 from public.station_assignments sa
        where sa.participant_id = p.id and sa.status in ('reserved','active'));
  update public.stations s set status = 'available'
    where s.event_id = p_event_id and s.id = any(coalesce(v_station_ids,'{}'::uuid[]))
      and s.status in ('reserved','occupied')
      and not exists(select 1 from public.station_assignments sa
        where sa.station_id = s.id and sa.status in ('reserved','active'));

  -- Remove announcements before their scenes. Already delivered announcements
  -- must not return to the TV after the reset.
  delete from public.audiovisual_events
    where event_id = p_event_id and event_key = any(v_keys);
  delete from public.scene_events
    where event_id = p_event_id and (
      payload->>'eventKey' = any(v_keys)
      or (scene_type = 'TOURNAMENT_BRACKET' and idempotency_key like 'draw:%')
    );

  delete from public.challenges c where c.event_id = p_event_id
    and exists(select 1 from public.activities a where a.id = c.activity_id
      and a.activity_type = 'roblox') and c.rules->>'discipline' is not null;
  delete from public.draws where event_id = p_event_id;

  -- Explicit order avoids the bracket's circular references to champion entries
  -- and matches that point to their next match.
  delete from public.match_results r where exists (
    select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = r.match_id and t.event_id = p_event_id);
  delete from public.match_participants mp where exists (
    select 1 from public.matches m join public.tournaments t on t.id = m.tournament_id
    where m.id = mp.match_id and t.event_id = p_event_id);
  update public.matches m set next_match_id = null where exists (
    select 1 from public.tournaments t where t.id = m.tournament_id and t.event_id = p_event_id);
  delete from public.matches m where exists (
    select 1 from public.tournaments t where t.id = m.tournament_id and t.event_id = p_event_id);
  update public.tournaments set champion_entry_id = null, runner_up_entry_id = null
    where event_id = p_event_id;
  delete from public.tournament_entries te where exists (
    select 1 from public.tournaments t where t.id = te.tournament_id and t.event_id = p_event_id);
  delete from public.tournament_rounds tr where exists (
    select 1 from public.tournaments t where t.id = tr.tournament_id and t.event_id = p_event_id);
  delete from public.tournaments where event_id = p_event_id;
  delete from public.teams t where t.event_id = p_event_id and t.team_type = 'foosball'
    and not exists(select 1 from public.mission_teams mt where mt.team_id = t.id)
    and not exists(select 1 from public.mission_digit_slots ds where ds.team_id = t.id);
  delete from public.competition_rosters where event_id = p_event_id;

  -- Only clear competition scenes already held in an online TV's local queue.
  for v_device in select id from public.display_devices
    where event_id = p_event_id and revoked_at is null
      and last_seen_at >= clock_timestamp() - interval '60 seconds' loop
    insert into public.scene_events(event_id,scene_type,payload,priority,duration_ms,
      sound,animation,interrupt_policy,status,target_device_id,idempotency_key)
    values(p_event_id,'DISPLAY_COMMAND','{"action":"clear_competitions"}'::jsonb,
      100,2000,'{}'::jsonb,'{}'::jsonb,'force','queued',v_device.id,
      'competition-reset:'||p_event_id||':'||v_device.id||':'||gen_random_uuid());
  end loop;

  insert into public.audit_logs(event_id,actor_user_id,action,entity_type,entity_id,old_data)
    values(p_event_id,auth.uid(),'competition_reset','event',p_event_id,
      jsonb_build_object('tournaments',v_tournament_count,'roblox_groups',v_group_count));
end; $$;

revoke all on function public.reset_event_competitions(uuid) from public, anon;
grant execute on function public.reset_event_competitions(uuid) to authenticated;
