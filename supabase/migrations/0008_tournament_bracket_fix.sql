-- Correct the single-elimination source distribution so byes are separated when
-- possible (14 players => six opening matches and two distinct quarterfinal byes).
create or replace function public.create_single_elimination_tournament(
  p_event_id uuid, p_activity_id uuid, p_name text, p_participant_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_tournament uuid; v_round_id uuid; v_match uuid; v_next uuid; v_entry uuid;
  v_entries uuid[] := array[]::uuid[]; v_previous uuid[] := array[]::uuid[]; v_current uuid[] := array[]::uuid[];
  v_n integer; v_size integer := 2; v_byes integer; v_rounds integer := 1;
  v_source_count integer; v_bye_index integer; v_prev_index integer; v_match_count integer;
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
  for entry_index in 1..v_n loop
    insert into public.tournament_entries(tournament_id, participant_id, seed) values(v_tournament, p_participant_ids[entry_index], entry_index) returning id into v_entry;
    v_entries := array_append(v_entries, v_entry);
  end loop;

  insert into public.tournament_rounds(tournament_id, round_number, name) values(v_tournament,1,'Ronda inicial') returning id into v_round_id;
  if v_n - v_byes > 0 then
    for opening_index in 0..((v_n - v_byes) / 2 - 1) loop
      insert into public.matches(tournament_id, round_id, match_number) values(v_tournament,v_round_id,opening_index+1) returning id into v_match;
      insert into public.match_participants(match_id,slot,entry_id) values
        (v_match,1,v_entries[v_byes+opening_index*2+1]),(v_match,2,v_entries[v_byes+opening_index*2+2]);
      v_previous := array_append(v_previous,v_match);
    end loop;
  end if;
  if v_rounds = 1 then return v_tournament; end if;

  for round_index in 2..v_rounds loop
    insert into public.tournament_rounds(tournament_id,round_number,name) values
      (v_tournament,round_index,case when round_index=v_rounds then 'Final' when round_index=v_rounds-1 then 'Semifinal' else 'Ronda '||round_index end)
      returning id into v_round_id;
    v_current := array[]::uuid[];
    if round_index = 2 then
      v_source_count := v_byes + coalesce(array_length(v_previous,1),0);
      v_bye_index := 1; v_prev_index := 1; v_match_count := v_source_count / 2;
      for match_index in 1..v_match_count loop
        insert into public.matches(tournament_id,round_id,match_number) values(v_tournament,v_round_id,match_index) returning id into v_match;
        v_current := array_append(v_current,v_match);
        for slot_index in 1..2 loop
          if v_bye_index <= v_byes and v_prev_index <= coalesce(array_length(v_previous,1),0) then
            if slot_index = 1 then
              insert into public.match_participants(match_id,slot,entry_id) values(v_match,slot_index,v_entries[v_bye_index]); v_bye_index := v_bye_index + 1;
            else
              v_next := v_previous[v_prev_index]; v_prev_index := v_prev_index + 1;
              update public.matches set next_match_id=v_match,next_slot=slot_index where id=v_next;
            end if;
          elsif v_prev_index <= coalesce(array_length(v_previous,1),0) then
            v_next := v_previous[v_prev_index]; v_prev_index := v_prev_index + 1;
            update public.matches set next_match_id=v_match,next_slot=slot_index where id=v_next;
          else
            insert into public.match_participants(match_id,slot,entry_id) values(v_match,slot_index,v_entries[v_bye_index]); v_bye_index := v_bye_index + 1;
          end if;
        end loop;
      end loop;
    else
      v_source_count := array_length(v_previous,1);
      for match_index in 1..(v_source_count/2) loop
        insert into public.matches(tournament_id,round_id,match_number) values(v_tournament,v_round_id,match_index) returning id into v_match;
        v_current := array_append(v_current,v_match);
        for slot_index in 1..2 loop
          v_next := v_previous[(match_index-1)*2+slot_index];
          update public.matches set next_match_id=v_match,next_slot=slot_index where id=v_next;
        end loop;
      end loop;
    end if;
    v_previous := v_current;
  end loop;
  return v_tournament;
end $$;

revoke all on function public.create_single_elimination_tournament(uuid,uuid,text,uuid[]) from public, anon;
grant execute on function public.create_single_elimination_tournament(uuid,uuid,text,uuid[]) to authenticated;

create or replace function public.confirm_draw(p_draw_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_event uuid; v_status text; v_ids uuid[];
begin
  select event_id, status into v_event, v_status from public.draws where id = p_draw_id for update;
  if not found or not public.has_event_role(v_event, array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  if v_status <> 'preview' then raise exception 'draw is not a preview'; end if;
  select array_agg(participant_id order by position) into v_ids from public.draw_results where draw_id = p_draw_id and participant_id is not null;
  if exists (select 1 from public.participants p where p.id = any(v_ids)
    and (p.administrative_status <> 'active' or p.operational_status not in ('available','resting'))) then raise exception 'participant became unavailable'; end if;
  if exists (select 1 from public.station_assignments sa where sa.participant_id = any(v_ids) and sa.status in ('reserved','active')) then raise exception 'participant became occupied'; end if;
  update public.draws set status = 'confirmed', confirmed_at = now() where id = p_draw_id;
end $$;
