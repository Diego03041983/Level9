-- Transactional draws and single-elimination tournaments (migration 0007).
-- Versioned locally; applying to a remote Supabase project remains an explicit deployment step.

create or replace function public.persist_draw_preview(
  p_event_id uuid, p_activity_id uuid, p_draw_type text, p_algorithm text,
  p_seed text, p_selected_ids uuid[], p_constraints jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_draw uuid; v_id uuid; v_position integer := 0;
begin
  if not public.has_event_role(p_event_id, array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  if coalesce(array_length(p_selected_ids, 1), 0) < 1 then raise exception 'empty draw'; end if;
  if (select count(distinct x) from unnest(p_selected_ids) x) <> array_length(p_selected_ids, 1) then raise exception 'duplicate participants'; end if;
  perform 1 from public.activities where id = p_activity_id and event_id = p_event_id and enabled for share;
  if not found then raise exception 'activity unavailable'; end if;
  if (select count(*) from public.participants p where p.id = any(p_selected_ids) and p.event_id = p_event_id
      and p.administrative_status = 'active' and p.operational_status in ('available','resting')) <> array_length(p_selected_ids, 1) then
    raise exception 'one or more participants are unavailable';
  end if;
  if exists (select 1 from public.station_assignments sa where sa.participant_id = any(p_selected_ids) and sa.status in ('reserved','active')) then
    raise exception 'one or more participants are occupied';
  end if;
  if exists (select 1 from unnest(p_selected_ids) x where not exists (
    select 1 from public.participant_activity_preferences pap where pap.participant_id = x and pap.activity_id = p_activity_id and pap.enabled
  )) then raise exception 'activity disabled for participant'; end if;
  insert into public.draws(event_id, activity_id, draw_type, algorithm, constraints, seed, created_by)
    values(p_event_id, p_activity_id, p_draw_type, p_algorithm, p_constraints, p_seed, (select auth.uid())) returning id into v_draw;
  foreach v_id in array p_selected_ids loop
    v_position := v_position + 1;
    insert into public.draw_results(draw_id, position, participant_id) values(v_draw, v_position, v_id);
  end loop;
  return v_draw;
end $$;

create or replace function public.confirm_draw(p_draw_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_activity uuid; v_status text; v_ids uuid[];
begin
  select event_id, activity_id, status into v_event, v_activity, v_status from public.draws where id = p_draw_id for update;
  if not found or not public.has_event_role(v_event, array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  if v_status <> 'preview' then raise exception 'draw is not a preview'; end if;
  select array_agg(participant_id order by position) into v_ids from public.draw_results where draw_id = p_draw_id and participant_id is not null;
  if exists (select 1 from public.participants p where p.id = any(v_ids)
    and (p.administrative_status <> 'active' or p.operational_status not in ('available','resting'))) then raise exception 'participant became unavailable'; end if;
  if exists (select 1 from public.station_assignments sa where sa.participant_id = any(v_ids) and sa.status in ('reserved','active')) then raise exception 'participant became occupied'; end if;
  update public.draws set status = 'confirmed', confirmed_at = now() where id = p_draw_id;
end $$;

create or replace function public.create_single_elimination_tournament(
  p_event_id uuid, p_activity_id uuid, p_name text, p_participant_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tournament uuid; v_round_id uuid; v_match uuid; v_next uuid; v_entry uuid;
  v_entries uuid[] := '{}'; v_previous uuid[] := '{}'; v_current uuid[] := '{}';
  v_n integer; v_size integer := 2; v_byes integer; v_rounds integer := 1;
  v_round integer; v_i integer; v_source_count integer; v_slot integer;
begin
  if not public.has_event_role(p_event_id, array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  v_n := coalesce(array_length(p_participant_ids, 1), 0);
  if v_n < 2 or v_n > 64 then raise exception 'participant count must be between 2 and 64'; end if;
  if (select count(distinct x) from unnest(p_participant_ids) x) <> v_n then raise exception 'duplicate participants'; end if;
  if (select count(*) from public.participants p where p.id = any(p_participant_ids) and p.event_id = p_event_id
    and p.administrative_status = 'active' and p.operational_status in ('available','resting')) <> v_n then raise exception 'participant unavailable'; end if;
  if not exists(select 1 from public.activities where id=p_activity_id and event_id=p_event_id and activity_type='fifa' and enabled) then raise exception 'FIFA activity unavailable'; end if;
  if exists(select 1 from unnest(p_participant_ids) x where not exists(
    select 1 from public.participant_activity_preferences pap where pap.participant_id=x and pap.activity_id=p_activity_id and pap.enabled
  )) then raise exception 'activity disabled for participant'; end if;
  if exists (select 1 from public.station_assignments sa where sa.participant_id = any(p_participant_ids) and sa.status in ('reserved','active')) then raise exception 'participant occupied'; end if;
  while v_size < v_n loop v_size := v_size * 2; v_rounds := v_rounds + 1; end loop;
  v_byes := v_size - v_n;
  insert into public.tournaments(event_id, activity_id, name, format, entry_kind, status, rules)
    values(p_event_id, p_activity_id, p_name, 'single_elimination', 'participant', 'ready', jsonb_build_object('bracket_size',v_size,'byes',v_byes)) returning id into v_tournament;
  for v_i in 1..v_n loop
    insert into public.tournament_entries(tournament_id, participant_id, seed) values(v_tournament, p_participant_ids[v_i], v_i) returning id into v_entry;
    v_entries := array_append(v_entries, v_entry);
  end loop;
  insert into public.tournament_rounds(tournament_id, round_number, name) values(v_tournament,1,'Ronda inicial') returning id into v_round_id;
  if v_n - v_byes > 0 then
    for v_i in 0..((v_n - v_byes) / 2 - 1) loop
      insert into public.matches(tournament_id, round_id, match_number) values(v_tournament,v_round_id,v_i+1) returning id into v_match;
      insert into public.match_participants(match_id,slot,entry_id) values
        (v_match,1,v_entries[v_byes+v_i*2+1]),(v_match,2,v_entries[v_byes+v_i*2+2]);
      v_previous := array_append(v_previous,v_match);
    end loop;
  end if;
  if v_rounds = 1 then return v_tournament; end if;
  for v_round in 2..v_rounds loop
    insert into public.tournament_rounds(tournament_id,round_number,name) values
      (v_tournament,v_round,case when v_round=v_rounds then 'Final' when v_round=v_rounds-1 then 'Semifinal' else 'Ronda '||v_round end)
      returning id into v_round_id;
    v_current := '{}';
    if v_round = 2 then v_source_count := v_byes + coalesce(array_length(v_previous,1),0); else v_source_count := array_length(v_previous,1); end if;
    for v_i in 0..(v_source_count/2-1) loop
      insert into public.matches(tournament_id,round_id,match_number) values(v_tournament,v_round_id,v_i+1) returning id into v_match;
      v_current := array_append(v_current,v_match);
      for v_slot in 1..2 loop
        if v_round = 2 and (v_i*2+v_slot) <= v_byes then
          insert into public.match_participants(match_id,slot,entry_id) values(v_match,v_slot,v_entries[v_i*2+v_slot]);
        else
          if v_round = 2 then v_next := v_previous[v_i*2+v_slot-v_byes]; else v_next := v_previous[v_i*2+v_slot]; end if;
          update public.matches set next_match_id=v_match,next_slot=v_slot where id=v_next;
        end if;
      end loop;
    end loop;
    v_previous := v_current;
  end loop;
  return v_tournament;
end $$;

create or replace function public.confirm_match_result(
  p_match_id uuid, p_winner_entry_id uuid, p_score jsonb, p_decided_by text, p_expected_version integer
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_event uuid; v_loser uuid; v_count integer; v_next_count integer;
begin
  select * into v_match from public.matches where id=p_match_id for update;
  select event_id into v_event from public.tournaments where id=v_match.tournament_id;
  if not found or not public.has_event_role(v_event,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  if v_match.status in ('complete','walkover','cancelled') or v_match.version <> p_expected_version then raise exception 'stale or completed match'; end if;
  select count(*) into v_count from public.match_participants where match_id=p_match_id and entry_id is not null;
  select entry_id into v_loser from public.match_participants
    where match_id=p_match_id and entry_id is not null and entry_id<>p_winner_entry_id limit 1;
  if v_count <> 2 or not exists(select 1 from public.match_participants where match_id=p_match_id and entry_id=p_winner_entry_id) then raise exception 'invalid winner'; end if;
  insert into public.match_results(match_id,winner_entry_id,score,decided_by,confirmed_by) values
    (p_match_id,p_winner_entry_id,p_score,p_decided_by,(select auth.uid()));
  update public.matches set status='complete',ended_at=now(),version=version+1 where id=p_match_id;
  update public.tournament_entries set status='eliminated' where id=v_loser;
  if v_match.next_match_id is not null then
    if exists(select 1 from public.match_participants where match_id=v_match.next_match_id and slot=v_match.next_slot) then raise exception 'dependent slot already occupied'; end if;
    insert into public.match_participants(match_id,slot,entry_id) values(v_match.next_match_id,v_match.next_slot,p_winner_entry_id);
    select count(*) into v_next_count from public.match_participants where match_id=v_match.next_match_id and entry_id is not null;
    if v_next_count=2 then update public.matches set status='called' where id=v_match.next_match_id and status='pending'; end if;
  else
    update public.tournament_entries set status='champion' where id=p_winner_entry_id;
    update public.tournaments set status='finished',champion_entry_id=p_winner_entry_id,runner_up_entry_id=v_loser where id=v_match.tournament_id;
  end if;
end $$;

revoke all on function public.persist_draw_preview(uuid,uuid,text,text,text,uuid[],jsonb) from public;
revoke all on function public.confirm_draw(uuid) from public;
revoke all on function public.create_single_elimination_tournament(uuid,uuid,text,uuid[]) from public;
revoke all on function public.confirm_match_result(uuid,uuid,jsonb,text,integer) from public;
grant execute on function public.persist_draw_preview(uuid,uuid,text,text,text,uuid[],jsonb) to authenticated;
grant execute on function public.confirm_draw(uuid) to authenticated;
grant execute on function public.create_single_elimination_tournament(uuid,uuid,text,uuid[]) to authenticated;
grant execute on function public.confirm_match_result(uuid,uuid,jsonb,text,integer) to authenticated;

create or replace function public.tournament_event(p_tournament uuid) returns uuid language sql stable security definer set search_path='' as $$
  select event_id from public.tournaments where id=p_tournament;
$$;
create or replace function public.match_event(p_match uuid) returns uuid language sql stable security definer set search_path='' as $$
  select t.event_id from public.matches m join public.tournaments t on t.id=m.tournament_id where m.id=p_match;
$$;
create policy tournament_entries_member_select on public.tournament_entries for select to authenticated
using(public.has_event_role(public.tournament_event(tournament_id),array['owner','admin','operator','display']));
create policy tournament_rounds_member_select on public.tournament_rounds for select to authenticated
using(public.has_event_role(public.tournament_event(tournament_id),array['owner','admin','operator','display']));
create policy matches_member_select on public.matches for select to authenticated
using(public.has_event_role(public.tournament_event(tournament_id),array['owner','admin','operator','display']));
create policy match_participants_member_select on public.match_participants for select to authenticated
using(public.has_event_role(public.match_event(match_id),array['owner','admin','operator','display']));
create policy match_results_member_select on public.match_results for select to authenticated
using(public.has_event_role(public.match_event(match_id),array['owner','admin','operator','display']));
create policy draw_results_member_select on public.draw_results for select to authenticated
using(exists(select 1 from public.draws d where d.id=draw_id and public.has_event_role(d.event_id,array['owner','admin','operator','display'])));
