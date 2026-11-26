-- One optional roster per game (and per Roblox discipline).
create table public.competition_rosters (
  event_id uuid not null references public.events(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  discipline text not null default 'main',
  participant_id uuid not null references public.participants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (activity_id, discipline, participant_id),
  check (discipline in ('main','epic-minigames','natural-disaster-survival','speed-run-4','super-golf'))
);
create index competition_rosters_event_idx on public.competition_rosters(event_id, activity_id, discipline);
alter table public.competition_rosters enable row level security;
create policy competition_rosters_read on public.competition_rosters for select to authenticated
using (public.has_event_role(event_id,array['owner','admin','operator','display']));
create policy competition_rosters_write on public.competition_rosters for all to authenticated
using (public.has_event_role(event_id,array['owner','admin','operator']))
with check (public.has_event_role(event_id,array['owner','admin','operator']));

create or replace function public.set_competition_roster(
  p_event_id uuid, p_activity_id uuid, p_discipline text, p_participant_ids uuid[]
) returns void language plpgsql security definer set search_path = '' as $$
declare v_type text; v_count integer := coalesce(array_length(p_participant_ids,1),0);
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  select activity_type into v_type from public.activities where id=p_activity_id and event_id=p_event_id and enabled;
  if v_type is null then raise exception 'activity unavailable'; end if;
  if (v_type='roblox') <> (p_discipline<>'main') then raise exception 'invalid discipline'; end if;
  if p_discipline not in ('main','epic-minigames','natural-disaster-survival','speed-run-4','super-golf') then raise exception 'invalid discipline'; end if;
  if (select count(distinct x) from unnest(p_participant_ids) x) <> v_count then raise exception 'duplicate players'; end if;
  if (select count(*) from public.participants p where p.id=any(p_participant_ids) and p.event_id=p_event_id
    and p.administrative_status='active' and p.registration_status='ACTIVATED') <> v_count then
    raise exception 'only activated players may participate';
  end if;
  delete from public.competition_rosters where activity_id=p_activity_id and discipline=p_discipline and event_id=p_event_id;
  insert into public.competition_rosters(event_id,activity_id,discipline,participant_id)
  select p_event_id,p_activity_id,p_discipline,x from unnest(p_participant_ids) x;
end $$;

-- A draw fixes bracket positions, but does not occupy the players until their match is called.
create or replace function public.create_competition_tournament(
  p_event_id uuid, p_activity_id uuid, p_name text, p_ordered_ids uuid[]
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_type text; v_tournament uuid; v_draw uuid; v_pairs_draw uuid; v_round_id uuid;
  v_match uuid; v_next uuid; v_entry uuid; v_team uuid;
  v_entries uuid[] := array[]::uuid[]; v_previous uuid[] := array[]::uuid[]; v_current uuid[] := array[]::uuid[];
  v_players integer := coalesce(array_length(p_ordered_ids,1),0); v_n integer; v_size integer := 2;
  v_byes integer; v_rounds integer := 1; v_source_count integer; v_bye_index integer; v_prev_index integer;
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  select activity_type into v_type from public.activities where id=p_activity_id and event_id=p_event_id and enabled;
  if v_type not in ('fifa','foosball') or v_type is null then raise exception 'not a tournament activity'; end if;
  if (select count(distinct x) from unnest(p_ordered_ids) x) <> v_players then raise exception 'duplicate players'; end if;
  if (select count(*) from public.competition_rosters r where r.activity_id=p_activity_id and r.discipline='main') <> v_players
     or exists(select 1 from unnest(p_ordered_ids) x where not exists(
       select 1 from public.competition_rosters r where r.activity_id=p_activity_id and r.discipline='main' and r.participant_id=x))
  then raise exception 'selected roster changed'; end if;
  if (select count(*) from public.participants p where p.id=any(p_ordered_ids) and p.event_id=p_event_id
    and p.administrative_status='active' and p.registration_status='ACTIVATED') <> v_players then
    raise exception 'player no longer eligible';
  end if;
  if v_type='foosball' and (v_players<4 or v_players%2<>0) then raise exception 'metegol needs an even number of at least four'; end if;
  if v_type='fifa' and v_players<2 then raise exception 'fifa needs two players'; end if;
  v_n := case when v_type='foosball' then v_players/2 else v_players end;
  if v_n>64 then raise exception 'too many entries'; end if;
  if exists(select 1 from public.tournaments where activity_id=p_activity_id and status not in ('finished','cancelled')) then
    raise exception 'active tournament already exists';
  end if;
  insert into public.draws(event_id,activity_id,draw_type,algorithm,seed,confirmed_at,status,constraints)
  values(p_event_id,p_activity_id,'bracket','random',gen_random_uuid()::text,now(),'confirmed',
    jsonb_build_object('participants',v_players,'entry_kind',case when v_type='foosball' then 'team' else 'participant' end))
  returning id into v_draw;
  for i in 1..v_players loop
    insert into public.draw_results(draw_id,position,participant_id) values(v_draw,i,p_ordered_ids[i]);
  end loop;
  if v_type='foosball' then
    insert into public.draws(event_id,activity_id,draw_type,algorithm,seed,confirmed_at,status,constraints)
    values(p_event_id,p_activity_id,'pairs','random',gen_random_uuid()::text,now(),'confirmed',jsonb_build_object('participants',v_players))
    returning id into v_pairs_draw;
    for i in 1..v_players loop
      insert into public.draw_results(draw_id,position,participant_id,group_key)
      values(v_pairs_draw,i,p_ordered_ids[i],((i+1)/2)::text);
    end loop;
  end if;
  while v_size<v_n loop v_size:=v_size*2; v_rounds:=v_rounds+1; end loop;
  v_byes:=v_size-v_n;
  insert into public.tournaments(event_id,activity_id,name,format,entry_kind,status,rules)
  values(p_event_id,p_activity_id,p_name,'single_elimination',
    case when v_type='foosball' then 'team' else 'participant' end,'ready',
    jsonb_build_object('bracket_size',v_size,'byes',v_byes,'draw_id',v_draw))
  returning id into v_tournament;
  for i in 1..v_n loop
    if v_type='foosball' then
      insert into public.teams(event_id,activity_id,name,team_type,locked)
      values(p_event_id,p_activity_id,'Dúo '||i,'foosball',true) returning id into v_team;
      insert into public.team_members(team_id,participant_id,position)
      values(v_team,p_ordered_ids[i*2-1],1),(v_team,p_ordered_ids[i*2],2);
      insert into public.tournament_entries(tournament_id,team_id,seed)
      values(v_tournament,v_team,i) returning id into v_entry;
    else
      insert into public.tournament_entries(tournament_id,participant_id,seed)
      values(v_tournament,p_ordered_ids[i],i) returning id into v_entry;
    end if;
    v_entries:=array_append(v_entries,v_entry);
  end loop;
  insert into public.tournament_rounds(tournament_id,round_number,name)
  values(v_tournament,1,'Ronda inicial') returning id into v_round_id;
  if v_n-v_byes>0 then
    for i in 0..((v_n-v_byes)/2-1) loop
      insert into public.matches(tournament_id,round_id,match_number)
      values(v_tournament,v_round_id,i+1) returning id into v_match;
      insert into public.match_participants(match_id,slot,entry_id)
      values(v_match,1,v_entries[v_byes+i*2+1]),(v_match,2,v_entries[v_byes+i*2+2]);
      v_previous:=array_append(v_previous,v_match);
    end loop;
  end if;
  if v_rounds=1 then return v_tournament; end if;
  for round_index in 2..v_rounds loop
    insert into public.tournament_rounds(tournament_id,round_number,name)
    values(v_tournament,round_index,case when round_index=v_rounds then 'Final'
      when round_index=v_rounds-1 then 'Semifinal' else 'Ronda '||round_index end)
    returning id into v_round_id;
    v_current:=array[]::uuid[];
    if round_index=2 then
      v_source_count:=v_byes+coalesce(array_length(v_previous,1),0);
      v_bye_index:=1; v_prev_index:=1;
      for match_index in 1..(v_source_count/2) loop
        insert into public.matches(tournament_id,round_id,match_number)
        values(v_tournament,v_round_id,match_index) returning id into v_match;
        v_current:=array_append(v_current,v_match);
        for slot_index in 1..2 loop
          if v_bye_index<=v_byes and v_prev_index<=coalesce(array_length(v_previous,1),0) then
            if slot_index=1 then
              insert into public.match_participants(match_id,slot,entry_id) values(v_match,slot_index,v_entries[v_bye_index]);
              v_bye_index:=v_bye_index+1;
            else
              v_next:=v_previous[v_prev_index];v_prev_index:=v_prev_index+1;
              update public.matches set next_match_id=v_match,next_slot=slot_index where id=v_next;
            end if;
          elsif v_prev_index<=coalesce(array_length(v_previous,1),0) then
            v_next:=v_previous[v_prev_index];v_prev_index:=v_prev_index+1;
            update public.matches set next_match_id=v_match,next_slot=slot_index where id=v_next;
          else
            insert into public.match_participants(match_id,slot,entry_id) values(v_match,slot_index,v_entries[v_bye_index]);
            v_bye_index:=v_bye_index+1;
          end if;
        end loop;
      end loop;
    else
      for match_index in 1..(array_length(v_previous,1)/2) loop
        insert into public.matches(tournament_id,round_id,match_number)
        values(v_tournament,v_round_id,match_index) returning id into v_match;
        v_current:=array_append(v_current,v_match);
        for slot_index in 1..2 loop
          v_next:=v_previous[(match_index-1)*2+slot_index];
          update public.matches set next_match_id=v_match,next_slot=slot_index where id=v_next;
        end loop;
      end loop;
    end if;
    v_previous:=v_current;
  end loop;
  return v_tournament;
end $$;

create or replace function public.call_competition_match(p_event_id uuid,p_match_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_match public.matches%rowtype; v_type text; v_station uuid; v_ids uuid[]; v_expected integer;
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  select m.* into v_match from public.matches m join public.tournaments t on t.id=m.tournament_id
    where m.id=p_match_id and t.event_id=p_event_id for update of m;
  if not found or v_match.status not in ('pending','called') then raise exception 'match unavailable'; end if;
  if v_match.station_id is not null then raise exception 'match already called'; end if;
  select a.activity_type into v_type from public.tournaments t join public.activities a on a.id=t.activity_id
    where t.id=v_match.tournament_id;
  v_expected:=case when v_type='foosball' then 4 else 2 end;
  select array_agg(id order by id) into v_ids from (
    select coalesce(te.participant_id,tm.participant_id) id
    from public.match_participants mp join public.tournament_entries te on te.id=mp.entry_id
    left join public.team_members tm on tm.team_id=te.team_id
    where mp.match_id=p_match_id
  ) x;
  if coalesce(array_length(v_ids,1),0)<>v_expected then
    raise exception 'match entrants incomplete';
  end if;
  select s.id into v_station from public.stations s where s.event_id=p_event_id
    and s.station_type=case when v_type='foosball' then 'foosball' else 'playstation' end
    and s.status='available' and s.capacity>=array_length(v_ids,1)
    and not exists(select 1 from public.station_assignments sa where sa.station_id=s.id and sa.status in ('reserved','active'))
    order by s.code limit 1 for update skip locked;
  if v_station is null then raise exception 'resource occupied'; end if;
  perform public.reserve_station(p_event_id,v_station,v_ids,'match',p_match_id);
  update public.matches set station_id=v_station,status='called',version=version+1 where id=p_match_id;
  return v_station;
end $$;

create or replace function public.start_competition_match(p_event_id uuid,p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_station uuid; v_ids uuid[];
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  select m.station_id into v_station from public.matches m join public.tournaments t on t.id=m.tournament_id
  where m.id=p_match_id and t.event_id=p_event_id and m.status='called' for update of m;
  if v_station is null then raise exception 'match not called'; end if;
  select array_agg(participant_id) into v_ids from public.station_assignments
  where event_id=p_event_id and context_type='match' and context_id=p_match_id and status='reserved';
  if v_ids is null then raise exception 'players not reserved'; end if;
  update public.station_assignments set status='active',starts_at=now() where context_type='match' and context_id=p_match_id and status='reserved';
  update public.participants set operational_status='competing' where id=any(v_ids);
  update public.stations set status='occupied' where id=v_station;
  update public.matches set status='live',started_at=now(),version=version+1 where id=p_match_id;
  update public.tournaments set status='live' where id=(select tournament_id from public.matches where id=p_match_id) and status='ready';
end $$;

create or replace function public.finish_competition_match(
  p_event_id uuid,p_match_id uuid,p_winner_entry_id uuid,p_home_score integer,p_away_score integer,p_expected_version integer
) returns void language plpgsql security definer set search_path = '' as $$
declare v_station uuid; v_ids uuid[];
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  select m.station_id into v_station from public.matches m join public.tournaments t on t.id=m.tournament_id
  where m.id=p_match_id and t.event_id=p_event_id and m.status='live' for update of m;
  if v_station is null then raise exception 'match not live'; end if;
  perform public.confirm_match_result(p_match_id,p_winner_entry_id,
    jsonb_build_object('home',p_home_score,'away',p_away_score),'score',p_expected_version);
  select array_agg(participant_id) into v_ids from public.station_assignments
    where context_type='match' and context_id=p_match_id and status in ('reserved','active');
  update public.station_assignments set status='completed',ends_at=now()
    where context_type='match' and context_id=p_match_id and status in ('reserved','active');
  if v_ids is not null then update public.participants set operational_status='available' where id=any(v_ids); end if;
  update public.stations set status='available' where id=v_station;
end $$;

revoke all on function public.set_competition_roster(uuid,uuid,text,uuid[]) from public,anon;
revoke all on function public.create_competition_tournament(uuid,uuid,text,uuid[]) from public,anon;
revoke all on function public.call_competition_match(uuid,uuid) from public,anon;
revoke all on function public.start_competition_match(uuid,uuid) from public,anon;
revoke all on function public.finish_competition_match(uuid,uuid,uuid,integer,integer,integer) from public,anon;
grant execute on function public.set_competition_roster(uuid,uuid,text,uuid[]) to authenticated;
grant execute on function public.create_competition_tournament(uuid,uuid,text,uuid[]) to authenticated;
grant execute on function public.call_competition_match(uuid,uuid) to authenticated;
grant execute on function public.start_competition_match(uuid,uuid) to authenticated;
grant execute on function public.finish_competition_match(uuid,uuid,uuid,integer,integer,integer) to authenticated;
