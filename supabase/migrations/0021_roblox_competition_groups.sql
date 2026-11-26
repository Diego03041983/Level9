-- Roblox groups are temporary: each challenge row represents one discipline run.
create or replace function public.start_roblox_group(
  p_event_id uuid,p_activity_id uuid,p_discipline text,p_participant_ids uuid[],p_comparison_key text default 'standard'
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_group uuid; v_player uuid; v_station uuid; v_count integer:=coalesce(array_length(p_participant_ids,1),0);
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  if v_count<1 or v_count>3 or (select count(distinct x) from unnest(p_participant_ids) x)<>v_count then
    raise exception 'choose one to three different players';
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
  if exists(
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

create or replace function public.finish_roblox_group(p_event_id uuid,p_group_id uuid,p_scores jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_group public.challenges%rowtype; v_count integer; v_player uuid; v_score numeric;
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'forbidden'; end if;
  select * into v_group from public.challenges where id=p_group_id and event_id=p_event_id and status='live' for update;
  if not found then raise exception 'group not live'; end if;
  select count(*) into v_count from public.challenge_participants where challenge_id=p_group_id;
  if jsonb_typeof(p_scores)<>'array' or jsonb_array_length(p_scores)<>v_count then raise exception 'one score per player is required'; end if;
  if (select count(distinct x->>'participantId') from jsonb_array_elements(p_scores) x)<>v_count then raise exception 'duplicate score'; end if;
  for v_player,v_score in
    select (x->>'participantId')::uuid,(x->>'score')::numeric from jsonb_array_elements(p_scores) x
  loop
    if v_score<0 or not exists(select 1 from public.challenge_participants where challenge_id=p_group_id and participant_id=v_player) then
      raise exception 'invalid score';
    end if;
    insert into public.challenge_results(challenge_id,participant_id,score,confirmed_by,payload)
    values(p_group_id,v_player,v_score,auth.uid(),jsonb_build_object('comparison_key',v_group.rules->>'comparison_key'));
  end loop;
  update public.challenge_results cr set position=ranked.position from (
    select id,rank() over(order by case when v_group.scoring_method='lowest' then score end asc,
      case when v_group.scoring_method='highest' then score end desc) position
    from public.challenge_results where challenge_id=p_group_id
  ) ranked where cr.id=ranked.id;
  update public.station_assignments set status='completed',ends_at=now()
    where context_type='challenge' and context_id=p_group_id and status in ('reserved','active');
  update public.participants p set operational_status='available' where id in (
    select participant_id from public.challenge_participants where challenge_id=p_group_id)
    and not exists(select 1 from public.station_assignments sa where sa.participant_id=p.id and sa.status in ('reserved','active'));
  update public.stations s set status='available' where id in (
    select station_id from public.challenge_participants where challenge_id=p_group_id)
    and not exists(select 1 from public.station_assignments sa where sa.station_id=s.id and sa.status in ('reserved','active'));
  update public.challenges set status='finished' where id=p_group_id;
end $$;

revoke all on function public.start_roblox_group(uuid,uuid,text,uuid[],text) from public,anon;
revoke all on function public.finish_roblox_group(uuid,uuid,jsonb) from public,anon;
grant execute on function public.start_roblox_group(uuid,uuid,text,uuid[],text) to authenticated;
grant execute on function public.finish_roblox_group(uuid,uuid,jsonb) to authenticated;
