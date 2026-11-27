-- Persistent, server-owned state for the four existing mission teams.
create table public.mission_challenge_states (
  mission_id uuid not null references public.missions(id) on delete cascade,
  slot smallint not null check (slot between 1 and 4),
  sequence_step smallint not null default 0 check (sequence_step between 0 and 4),
  memory_cards smallint[],
  memory_matches smallint[] not null default '{}',
  memory_first smallint,
  memory_second smallint,
  memory_reveal_until timestamptz,
  memory_attempts integer not null default 0,
  completed_at timestamptz,
  primary key (mission_id, slot)
);
alter table public.mission_challenge_states enable row level security;
revoke all on public.mission_challenge_states from public, anon, authenticated;

create or replace function public.run_mission_challenge(
  p_mission_id uuid, p_slot smallint, p_action text,
  p_answer text default null, p_index integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_mission public.missions%rowtype;
  v_slot public.mission_digit_slots%rowtype;
  v_state public.mission_challenge_states%rowtype;
  v_cards smallint[];
  v_i integer;
  v_j integer;
  v_swap smallint;
  v_first_symbol smallint;
  v_second_symbol smallint;
  v_digit text;
  v_code text;
  v_count integer;
  v_correct boolean := false;
  v_cards_json jsonb;
begin
  if p_slot not between 1 and 4 or p_action not in ('open','state','sequence','flip') then
    raise exception 'invalid challenge action' using errcode = '22023';
  end if;
  select * into v_mission from public.missions where id = p_mission_id for update;
  if not found or v_mission.status not in ('live','paused','unlocked') then
    raise exception 'mission not active' using errcode = '22023';
  end if;
  select * into v_slot from public.mission_digit_slots
    where mission_id = p_mission_id and slot = p_slot and team_id is not null;
  if not found then raise exception 'team not assigned' using errcode = '22023'; end if;

  insert into public.mission_challenge_states(mission_id, slot)
    values (p_mission_id, p_slot) on conflict do nothing;
  select * into v_state from public.mission_challenge_states
    where mission_id = p_mission_id and slot = p_slot for update;

  if p_slot = 3 and v_state.memory_cards is null and p_action = 'open' then
    -- Fisher-Yates on the server: 24 symbols, exactly two of each.
    select array_agg(((i - 1) % 24 + 1)::smallint order by i)
      into v_cards from generate_series(1, 48) i;
    for v_i in reverse 48..2 loop
      v_j := floor(random() * v_i)::integer + 1;
      v_swap := v_cards[v_i];
      v_cards[v_i] := v_cards[v_j];
      v_cards[v_j] := v_swap;
    end loop;
    v_state.memory_cards := v_cards;
  end if;

  if v_state.memory_reveal_until is not null and v_state.memory_reveal_until <= clock_timestamp() then
    v_state.memory_first := null;
    v_state.memory_second := null;
    v_state.memory_reveal_until := null;
  end if;

  if v_slot.digit is null and v_mission.status in ('live','paused') then
    if p_action = 'open' and p_slot in (1, 4) then
      v_correct := true;
    elsif p_action = 'sequence' and p_slot = 2 and v_state.sequence_step < 4 then
      if p_answer = (array['10','25','C','16'])[v_state.sequence_step + 1] then
        v_state.sequence_step := v_state.sequence_step + 1;
        v_correct := true;
      end if;
    elsif p_action = 'flip' and p_slot = 3 and v_state.memory_cards is not null then
      if p_index is null or p_index not between 0 and 47 then
        raise exception 'invalid card' using errcode = '22023';
      end if;
      if v_state.memory_reveal_until is not null and v_state.memory_reveal_until > clock_timestamp() then
        null; -- A mismatch is still visible; do not accept another selection.
      elsif v_state.memory_cards[p_index + 1] = any(v_state.memory_matches) then
        null;
      elsif v_state.memory_first is null then
        v_state.memory_first := p_index;
        v_correct := true;
      elsif v_state.memory_first <> p_index then
        v_state.memory_second := p_index;
        v_state.memory_attempts := v_state.memory_attempts + 1;
        v_first_symbol := v_state.memory_cards[v_state.memory_first + 1];
        v_second_symbol := v_state.memory_cards[p_index + 1];
        if v_first_symbol = v_second_symbol then
          v_state.memory_matches := array_append(v_state.memory_matches, v_first_symbol);
          v_state.memory_first := null;
          v_state.memory_second := null;
          v_correct := true;
        else
          v_state.memory_reveal_until := clock_timestamp() + interval '1200 milliseconds';
        end if;
      end if;
    end if;

    if (p_slot in (1, 4) and p_action = 'open')
      or (p_slot = 2 and v_state.sequence_step = 4)
      or (p_slot = 3 and coalesce(array_length(v_state.memory_matches, 1), 0) = 24) then
      v_digit := (array['2','9','1','1'])[p_slot];
      select count(*) into v_count from public.mission_digit_slots
        where mission_id = p_mission_id and digit is not null;
      if v_count = 3 then
        select string_agg(case when slot = p_slot then v_digit else digit end, '' order by slot)
          into v_code from public.mission_digit_slots where mission_id = p_mission_id;
        if extensions.crypt(v_code, v_mission.secret_code_hash) <> v_mission.secret_code_hash then
          raise exception 'mission final code differs from challenge fragments' using errcode = '22023';
        end if;
      end if;
      update public.mission_digit_slots set digit = v_digit, revealed_at = clock_timestamp()
        where mission_id = p_mission_id and slot = p_slot and digit is null;
      v_slot.digit := v_digit;
      v_state.completed_at := coalesce(v_state.completed_at, clock_timestamp());
      if v_count = 3 then
        update public.missions set status = 'unlocked', unlocked_at = clock_timestamp(),
          completed_at = clock_timestamp(), paused_at = null where id = p_mission_id;
      end if;
    end if;
  end if;

  update public.mission_challenge_states set
    sequence_step = v_state.sequence_step,
    memory_cards = v_state.memory_cards,
    memory_matches = v_state.memory_matches,
    memory_first = v_state.memory_first,
    memory_second = v_state.memory_second,
    memory_reveal_until = v_state.memory_reveal_until,
    memory_attempts = v_state.memory_attempts,
    completed_at = v_state.completed_at
    where mission_id = p_mission_id and slot = p_slot;

  if p_slot = 3 and v_state.memory_cards is not null then
    select jsonb_agg(jsonb_build_object(
      'index', i,
      'symbol', case when v_state.memory_cards[i + 1] = any(v_state.memory_matches)
        or i = v_state.memory_first or i = v_state.memory_second
        then v_state.memory_cards[i + 1] else null end,
      'matched', v_state.memory_cards[i + 1] = any(v_state.memory_matches)
    ) order by i) into v_cards_json from generate_series(0, 47) i;
  end if;
  return jsonb_build_object(
    'slot', p_slot, 'complete', v_slot.digit is not null,
    'digit', v_slot.digit, 'correct', v_correct,
    'sequenceStep', v_state.sequence_step,
    'cards', v_cards_json,
    'memoryAttempts', v_state.memory_attempts,
    'memoryMatched', coalesce(array_length(v_state.memory_matches, 1), 0),
    'memoryLockedUntil', v_state.memory_reveal_until
  );
end; $$;
revoke all on function public.run_mission_challenge(uuid,smallint,text,text,integer) from public, anon, authenticated;
grant execute on function public.run_mission_challenge(uuid,smallint,text,text,integer) to service_role;
