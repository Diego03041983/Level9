-- Return registered players to reception without deleting their guest records or audio assignments.
create or replace function public.reset_event_player_activations(p_event_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if not public.has_event_role(p_event_id, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (select 1 from public.reception_sessions
    where event_id = p_event_id and status in ('active','paused')) then
    raise exception 'Terminá o cancelá el alta que está en curso antes de reiniciar jugadores' using errcode = '22023';
  end if;
  if exists (select 1 from public.missions
    where event_id = p_event_id and status in ('live','paused')) then
    raise exception 'Reiniciá o terminá la misión en curso antes de reiniciar jugadores' using errcode = '22023';
  end if;

  select array_agg(id) into v_ids from (
    select id from public.participants
    where event_id = p_event_id
      and (registration_status = 'ACTIVATED' or administrative_status = 'active')
    for update
  ) players;
  if v_ids is null then return 0; end if;

  if exists (select 1 from public.station_assignments
    where participant_id = any(v_ids) and status in ('reserved','active'))
    or exists (select 1 from public.participants
      where id = any(v_ids) and operational_status in ('called','competing')) then
    raise exception 'Hay jugadores convocados o jugando. Terminá sus partidas antes de reiniciar el alta' using errcode = '22023';
  end if;

  update public.participant_availability
    set ends_at = greatest(v_now, starts_at + interval '1 millisecond')
    where participant_id = any(v_ids) and ends_at is null;

  update public.participants set
    registration_status = 'PRELOADED', administrative_status = 'invited',
    operational_status = 'unavailable', arrived_at = null, departed_at = null,
    activated_at = null, gamer_tag = null, avatar_key = null, photo_path = null
    where event_id = p_event_id and id = any(v_ids);
  get diagnostics v_count = row_count;

  insert into public.participant_availability(participant_id,status,starts_at,reason,source_type)
    select unnest(v_ids),'unavailable',v_now,'admin:reset_activation','admin';

  insert into public.audit_logs(event_id,actor_user_id,action,entity_type,entity_id,new_data)
    values(p_event_id,auth.uid(),'participants.bulk_reset_activation','event',p_event_id,
      jsonb_build_object('count',v_count));
  return v_count;
end; $$;
revoke all on function public.reset_event_player_activations(uuid) from public, anon;
grant execute on function public.reset_event_player_activations(uuid) to authenticated;
