-- Operational support for /admin/activities and /admin/teams.

create policy activity_preferences_admin_select
on public.participant_activity_preferences for select to authenticated
using (
  exists (
    select 1 from public.participants p
    join public.activities a on a.id = participant_activity_preferences.activity_id
    where p.id = participant_activity_preferences.participant_id
      and p.event_id = a.event_id
      and public.has_event_role(p.event_id, array['owner','admin','operator'])
  )
);

create policy activity_preferences_admin_write
on public.participant_activity_preferences for all to authenticated
using (
  exists (
    select 1 from public.participants p
    join public.activities a on a.id = participant_activity_preferences.activity_id
    where p.id = participant_activity_preferences.participant_id
      and p.event_id = a.event_id
      and public.has_event_role(p.event_id, array['owner','admin','operator'])
  )
)
with check (
  exists (
    select 1 from public.participants p
    join public.activities a on a.id = participant_activity_preferences.activity_id
    where p.id = participant_activity_preferences.participant_id
      and p.event_id = a.event_id
      and public.has_event_role(p.event_id, array['owner','admin','operator'])
  )
);

create policy team_members_event_select
on public.team_members for select to authenticated
using (
  exists (
    select 1 from public.teams t
    where t.id = team_members.team_id
      and public.has_event_role(t.event_id, array['owner','admin','operator','display'])
  )
);

create or replace function public.save_team_with_members(
  p_event_id uuid,
  p_team_id uuid,
  p_activity_id uuid,
  p_name text,
  p_color text,
  p_team_type text,
  p_member_ids uuid[]
) returns public.teams
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  resolved_team_id uuid := coalesce(p_team_id, gen_random_uuid());
  saved_team public.teams;
  unique_count integer;
begin
  if caller is null or not public.has_event_role(p_event_id, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(btrim(p_name), '') is null or p_team_type not in ('activity','mission','foosball','custom') then
    raise exception 'invalid team data' using errcode = '22023';
  end if;
  if p_activity_id is not null and not exists (
    select 1 from public.activities where id = p_activity_id and event_id = p_event_id
  ) then
    raise exception 'activity does not belong to event' using errcode = '42501';
  end if;
  select count(distinct member_id) into unique_count from unnest(coalesce(p_member_ids, '{}'::uuid[])) member_id;
  if unique_count <> coalesce(array_length(p_member_ids, 1), 0) then
    raise exception 'duplicate team members' using errcode = '23505';
  end if;
  if p_team_type = 'foosball' and unique_count > 2 then
    raise exception 'foosball teams support at most two members' using errcode = '23514';
  end if;

  perform 1 from public.participants p
  where p.id = any(coalesce(p_member_ids, '{}'::uuid[]))
  order by p.id for update;
  if unique_count <> (
    select count(*) from public.participants p
    where p.id = any(coalesce(p_member_ids, '{}'::uuid[]))
      and p.event_id = p_event_id
      and p.administrative_status = 'active'
  ) then
    raise exception 'one or more members are unavailable or belong to another event' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    where tm.participant_id = any(coalesce(p_member_ids, '{}'::uuid[]))
      and t.event_id = p_event_id
      and t.id <> resolved_team_id
      and t.team_type = p_team_type
      and t.activity_id is not distinct from p_activity_id
  ) then
    raise exception 'a participant already belongs to another team in this activity' using errcode = '23505';
  end if;

  if p_team_id is null then
    insert into public.teams(id, event_id, activity_id, name, color, team_type)
    values (resolved_team_id, p_event_id, p_activity_id, btrim(p_name), nullif(btrim(p_color), ''), p_team_type)
    returning * into saved_team;
  else
    update public.teams
    set activity_id = p_activity_id,
        name = btrim(p_name),
        color = nullif(btrim(p_color), ''),
        team_type = p_team_type
    where id = p_team_id and event_id = p_event_id and not locked
    returning * into saved_team;
    if saved_team.id is null then
      raise exception 'team not found or locked' using errcode = 'P0002';
    end if;
  end if;

  delete from public.team_members where team_id = resolved_team_id;
  insert into public.team_members(team_id, participant_id, position)
  select resolved_team_id, member_id, row_number() over ()::smallint
  from unnest(coalesce(p_member_ids, '{}'::uuid[])) member_id;

  insert into public.audit_logs(event_id, actor_user_id, action, entity_type, entity_id, new_data)
  values (
    p_event_id, caller, case when p_team_id is null then 'team.created' else 'team.updated' end,
    'team', resolved_team_id,
    jsonb_build_object('name', saved_team.name, 'member_count', unique_count, 'team_type', p_team_type)
  );
  return saved_team;
end;
$$;

revoke all on function public.save_team_with_members(uuid,uuid,uuid,text,text,text,uuid[]) from public, anon;
grant execute on function public.save_team_with_members(uuid,uuid,uuid,text,text,text,uuid[]) to authenticated;

create or replace function public.release_station_reservation(
  p_event_id uuid,
  p_station_id uuid,
  p_assignment_status text default 'completed'
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  affected_participants uuid[];
  released integer := 0;
begin
  if caller is null or not public.has_event_role(p_event_id, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_assignment_status not in ('completed','cancelled') then
    raise exception 'invalid assignment resolution' using errcode = '22023';
  end if;
  perform 1 from public.stations
  where id = p_station_id and event_id = p_event_id for update;
  if not found then raise exception 'station not found' using errcode = 'P0002'; end if;

  select array_agg(participant_id) into affected_participants
  from public.station_assignments
  where station_id = p_station_id and event_id = p_event_id
    and status in ('reserved','active');

  update public.station_assignments
  set status = p_assignment_status, ends_at = now()
  where station_id = p_station_id and event_id = p_event_id
    and status in ('reserved','active');
  get diagnostics released = row_count;

  if affected_participants is not null then
    update public.participants p set operational_status = 'available'
    where p.id = any(affected_participants)
      and not exists (
        select 1 from public.station_assignments sa
        where sa.participant_id = p.id and sa.status in ('reserved','active')
      );
  end if;
  update public.stations set status = 'available' where id = p_station_id;
  return released;
end;
$$;

revoke all on function public.release_station_reservation(uuid,uuid,text) from public, anon;
grant execute on function public.release_station_reservation(uuid,uuid,text) to authenticated;

