-- Two or three players are required for every Roblox competition group.
create or replace function public.start_roblox_group(
  p_event_id uuid,p_activity_id uuid,p_discipline text,p_participant_ids uuid[],p_comparison_key text,p_allow_repeat boolean
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_player uuid; v_station uuid; v_count integer:=coalesce(array_length(p_participant_ids,1),0);
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  if v_count<2 or v_count>3 or (select count(distinct x) from unnest(p_participant_ids) x)<>v_count then
    raise exception 'Elegí dos o tres jugadores distintos para competir';
  end if;
  if p_discipline not in ('epic-minigames','natural-disaster-survival','speed-run-4','super-golf') then raise exception 'invalid discipline'; end if;
  if not exists(select 1 from public.activities where id=p_activity_id and event_id=p_event_id and activity_type='roblox' and enabled) then
    raise exception 'roblox unavailable';
  end if;
  if exists(select 1 from unnest(p_participant_ids) x where not exists(
    select 1 from public.competition_rosters r where r.event_id=p_event_id and r.activity_id=p_activity_id
    and r.discipline=p_discipline and r.participant_id=x)) then raise exception 'player not selected for this discipline'; end if;
  if exists(select 1 from public.participants p where p.id=any(p_participant_ids) and
    (p.operational_status not in ('available','resting') or p.administrative_status<>'active')) then
    raise exception 'player occupied';
  end if;
  if exists(select 1 from public.station_assignments sa where sa.participant_id=any(p_participant_ids)
    and sa.status in ('reserved','active')) then raise exception 'player already assigned'; end if;
  if not p_allow_repeat and exists(
    select 1 from public.challenge_results cr join public.challenges c on c.id=cr.challenge_id
    where cr.participant_id=any(p_participant_ids) and c.event_id=p_event_id and c.activity_id=p_activity_id
      and c.rules->>'discipline'=p_discipline
  ) and exists(
    select 1 from public.competition_rosters r where r.event_id=p_event_id and r.activity_id=p_activity_id
      and r.discipline=p_discipline
      and not exists(select 1 from public.challenge_results cr join public.challenges c on c.id=cr.challenge_id
        where cr.participant_id=r.participant_id and c.event_id=p_event_id and c.activity_id=p_activity_id
          and c.rules->>'discipline'=p_discipline)
  ) then raise exception 'players still waiting for their first turn'; end if;
  insert into public.challenges(event_id,activity_id,name,scoring_method,status,starts_at,rules)
  values(p_event_id,p_activity_id,p_discipline,
    case when p_discipline='super-golf' then 'lowest' else 'highest' end,
    'live',now(),jsonb_build_object('discipline',p_discipline,'comparison_key',left(coalesce(nullif(trim(p_comparison_key),''),'standard'),80)))
  returning id into v_group;
  foreach v_player in array p_participant_ids loop
    select s.id into v_station from public.stations s where s.event_id=p_event_id
      and s.station_type='pc' and s.status='available'
      and not exists(select 1 from public.station_assignments sa where sa.station_id=s.id and sa.status in ('reserved','active'))
      order by random() limit 1 for update skip locked;
    if v_station is null then raise exception 'not enough free computers'; end if;
    perform public.reserve_station(p_event_id,v_station,array[v_player],'challenge',v_group);
    insert into public.challenge_participants(challenge_id,participant_id,station_id)
    values(v_group,v_player,v_station);
    update public.station_assignments set status='active',starts_at=now()
      where context_type='challenge' and context_id=v_group and participant_id=v_player;
    update public.participants set operational_status='competing' where id=v_player;
    update public.stations set status='occupied' where id=v_station;
  end loop;
  return v_group;
end $$;


revoke all on function public.start_roblox_group(uuid,uuid,text,uuid[],text,boolean) from public,anon;
grant execute on function public.start_roblox_group(uuid,uuid,text,uuid[],text,boolean) to authenticated;

-- Keep the older five-argument RPC safe for any existing callers.
create or replace function public.start_roblox_group(
  p_event_id uuid,p_activity_id uuid,p_discipline text,p_participant_ids uuid[],p_comparison_key text default 'standard'
) returns uuid language sql security definer set search_path = '' as $$
  select public.start_roblox_group(p_event_id,p_activity_id,p_discipline,p_participant_ids,p_comparison_key,false);
$$;
revoke all on function public.start_roblox_group(uuid,uuid,text,uuid[],text) from public,anon;
grant execute on function public.start_roblox_group(uuid,uuid,text,uuid[],text) to authenticated;
