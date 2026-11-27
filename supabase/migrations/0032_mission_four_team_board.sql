create table if not exists public.mission_digit_slots (
  mission_id uuid not null references public.missions(id) on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  team_id uuid references public.teams(id) on delete set null,
  digit text check (digit ~ '^[0-9]$'),
  revealed_at timestamptz,
  primary key (mission_id, slot),
  unique (mission_id, team_id)
);
alter table public.mission_digit_slots enable row level security;
create policy mission_digit_slots_read on public.mission_digit_slots for select to authenticated
using (exists (select 1 from public.missions m where m.id=mission_id and public.has_event_role(m.event_id,array['owner','admin','operator'])));

create or replace function public.assign_mission_team(p_event_id uuid,p_mission_id uuid,p_slot smallint,p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path='' as $$
declare v_name text;v_color text;v_team uuid;
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_slot not between 1 and 4 or coalesce(array_length(p_member_ids,1),0)>20 then raise exception 'invalid team' using errcode='22023'; end if;
  if not exists(select 1 from public.missions where id=p_mission_id and event_id=p_event_id and status in ('ready','draft')) then raise exception 'mission already active' using errcode='22023'; end if;
  if (select count(distinct x) from unnest(p_member_ids) x)<>coalesce(array_length(p_member_ids,1),0) then raise exception 'duplicate player' using errcode='22023'; end if;
  if exists(select 1 from unnest(p_member_ids) x where not exists(select 1 from public.participants p where p.id=x and p.event_id=p_event_id)) then raise exception 'invalid player' using errcode='22023'; end if;
  if exists(select 1 from public.team_members tm join public.mission_digit_slots s on s.team_id=tm.team_id where s.mission_id=p_mission_id and s.slot<>p_slot and tm.participant_id=any(p_member_ids)) then raise exception 'player already in another mission team' using errcode='22023'; end if;
  v_name:=(array['Equipo Fuego','Equipo Agua','Equipo Viento','Equipo Tierra'])[p_slot];
  v_color:=(array['#ff424b','#28bfff','#c17bff','#9de04b'])[p_slot];
  select team_id into v_team from public.mission_digit_slots where mission_id=p_mission_id and slot=p_slot for update;
  if v_team is null then insert into public.teams(event_id,name,color,team_type) values(p_event_id,v_name,v_color,'mission') returning id into v_team;
  else update public.teams set name=v_name,color=v_color where id=v_team; end if;
  delete from public.team_members where team_id=v_team;
  insert into public.team_members(team_id,participant_id,position) select v_team,x,row_number() over() from unnest(p_member_ids) x;
  insert into public.mission_digit_slots(mission_id,slot,team_id) values(p_mission_id,p_slot,v_team)
    on conflict(mission_id,slot) do update set team_id=excluded.team_id;
  return v_team;
end;$$;
revoke all on function public.assign_mission_team(uuid,uuid,smallint,uuid[]) from public,anon;
grant execute on function public.assign_mission_team(uuid,uuid,smallint,uuid[]) to authenticated;

create or replace function public.reveal_mission_digit(p_event_id uuid,p_mission_id uuid,p_slot smallint,p_digit text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_mission public.missions%rowtype;v_count integer;v_code text;
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'not authorized' using errcode='42501'; end if;
  if p_slot not between 1 and 4 or p_digit !~ '^[0-9]$' then raise exception 'invalid digit' using errcode='22023'; end if;
  select * into v_mission from public.missions where id=p_mission_id and event_id=p_event_id for update;
  if v_mission.status not in ('live','paused') then raise exception 'mission not running' using errcode='22023'; end if;
  if not exists(select 1 from public.mission_digit_slots where mission_id=p_mission_id and slot=p_slot and team_id is not null) then raise exception 'team not assigned' using errcode='22023'; end if;
  if exists(select 1 from public.mission_digit_slots where mission_id=p_mission_id and slot=p_slot and digit is not null) then raise exception 'digit already revealed' using errcode='22023'; end if;
  select count(*) into v_count from public.mission_digit_slots where mission_id=p_mission_id and digit is not null;
  if v_count=3 then
    select string_agg(case when slot=p_slot then p_digit else digit end,' ' order by slot) into v_code from public.mission_digit_slots where mission_id=p_mission_id;
    if replace(v_code,' ','') <> '' and extensions.crypt(replace(v_code,' ',''),v_mission.secret_code_hash)<>v_mission.secret_code_hash then
      raise exception 'digits do not match mission code' using errcode='22023';
    end if;
  end if;
  update public.mission_digit_slots set digit=p_digit,revealed_at=now() where mission_id=p_mission_id and slot=p_slot;
  if v_count=3 then
    update public.missions set status='unlocked',unlocked_at=now(),completed_at=now(),paused_at=null where id=p_mission_id;
    return true;
  end if;
  return false;
end;$$;
revoke all on function public.reveal_mission_digit(uuid,uuid,smallint,text) from public,anon;
grant execute on function public.reveal_mission_digit(uuid,uuid,smallint,text) to authenticated;
