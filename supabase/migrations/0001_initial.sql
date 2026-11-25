-- Santiago Level 9 — initial relational schema
-- PostgreSQL / Supabase. Timestamps are UTC (`timestamptz`).

create extension if not exists pgcrypto;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  subtitle text,
  celebrant_name text not null,
  celebrant_age smallint check (celebrant_age between 1 and 120),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null default 'America/Argentina/Cordoba',
  status text not null default 'draft' check (status in ('draft','ready','live','paused','finished','archived')),
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.event_users (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','operator','checkin','display')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.event_settings (
  event_id uuid primary key references public.events(id) on delete cascade,
  theme jsonb not null default '{}'::jsonb,
  xp_rules jsonb not null default '{}'::jsonb,
  display_mode text not null default 'mixed' check (display_mode in ('automatic','manual','mixed')),
  auto_welcome boolean not null default true,
  show_xp_leaderboard boolean not null default false,
  reduced_motion boolean not null default false,
  media_retention_days integer check (media_retention_days is null or media_retention_days >= 0),
  updated_at timestamptz not null default now()
);

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 80),
  last_name text,
  gamer_tag text,
  player_number integer not null check (player_number > 0),
  avatar_key text,
  photo_path text,
  is_celebrant boolean not null default false,
  administrative_status text not null default 'invited' check (administrative_status in ('invited','active','inactive','withdrawn')),
  operational_status text not null default 'unavailable' check (operational_status in ('available','called','competing','resting','unavailable')),
  arrived_at timestamptz,
  departed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, player_number),
  check (photo_path is null or char_length(photo_path) <= 500)
);

create unique index one_celebrant_per_event on public.participants(event_id) where is_celebrant;
create index participants_event_status_idx on public.participants(event_id, administrative_status, operational_status);

create table public.participant_consents (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  photo_allowed boolean not null,
  guardian_confirmation text,
  consented_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  created_by uuid references auth.users(id),
  check (not photo_allowed or guardian_confirmation is not null)
);

create table public.participant_availability (
  id uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  status text not null check (status in ('available','called','competing','resting','unavailable')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  reason text,
  source_type text,
  source_id uuid,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);
create index availability_open_idx on public.participant_availability(participant_id, starts_at desc) where ends_at is null;

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  slug text not null,
  name text not null,
  activity_type text not null check (activity_type in ('fifa','roblox','foosball','mission','custom')),
  status text not null default 'draft' check (status in ('draft','ready','live','paused','finished','cancelled')),
  enabled boolean not null default true,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, slug)
);

create table public.participant_activity_preferences (
  participant_id uuid not null references public.participants(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  enabled boolean not null default true,
  notes text,
  primary key (participant_id, activity_id)
);

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  station_type text not null check (station_type in ('playstation','pc','foosball','mission','other')),
  capacity smallint not null check (capacity > 0),
  status text not null default 'available' check (status in ('available','reserved','occupied','paused','out_of_service')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code)
);

create table public.station_assignments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete restrict,
  participant_id uuid not null references public.participants(id) on delete restrict,
  context_type text not null check (context_type in ('match','challenge','mission','manual')),
  context_id uuid,
  status text not null default 'reserved' check (status in ('reserved','active','completed','cancelled')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create unique index assignment_participant_open_idx on public.station_assignments(participant_id) where status in ('reserved','active');
create index assignment_station_open_idx on public.station_assignments(station_id, status) where status in ('reserved','active');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  name text not null,
  color text,
  team_type text not null default 'activity' check (team_type in ('activity','mission','foosball','custom')),
  locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  position smallint,
  joined_at timestamptz not null default now(),
  primary key (team_id, participant_id)
);

create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete restrict,
  name text not null,
  format text not null check (format in ('single_elimination','group','group_knockout','free_play')),
  entry_kind text not null default 'participant' check (entry_kind in ('participant','team')),
  status text not null default 'draft' check (status in ('draft','seeding','ready','live','finished','cancelled')),
  rules jsonb not null default '{}'::jsonb,
  champion_entry_id uuid,
  runner_up_entry_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  participant_id uuid references public.participants(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  seed integer,
  status text not null default 'active' check (status in ('active','eliminated','withdrawn','champion')),
  created_at timestamptz not null default now(),
  check ((participant_id is not null)::int + (team_id is not null)::int = 1),
  unique (tournament_id, participant_id),
  unique (tournament_id, team_id)
);

alter table public.tournaments
  add constraint tournaments_champion_fk foreign key (champion_entry_id) references public.tournament_entries(id),
  add constraint tournaments_runner_up_fk foreign key (runner_up_entry_id) references public.tournament_entries(id);

create table public.tournament_rounds (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  name text not null,
  status text not null default 'pending' check (status in ('pending','live','complete')),
  unique (tournament_id, round_number)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_id uuid not null references public.tournament_rounds(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  match_number integer not null,
  status text not null default 'pending' check (status in ('pending','called','live','complete','cancelled','walkover')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  next_match_id uuid references public.matches(id),
  next_slot smallint check (next_slot in (1,2)),
  version integer not null default 1,
  unique (tournament_id, round_id, match_number)
);

create table public.match_participants (
  match_id uuid not null references public.matches(id) on delete cascade,
  slot smallint not null check (slot in (1,2)),
  entry_id uuid references public.tournament_entries(id) on delete restrict,
  is_bye boolean not null default false,
  primary key (match_id, slot),
  check ((entry_id is not null) <> is_bye)
);

create table public.match_results (
  match_id uuid primary key references public.matches(id) on delete cascade,
  winner_entry_id uuid not null references public.tournament_entries(id) on delete restrict,
  score jsonb not null,
  decided_by text not null default 'score' check (decided_by in ('score','penalties','walkover','abandonment','admin')),
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now(),
  correction_reason text,
  version integer not null default 1
);

create table public.draws (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  activity_id uuid references public.activities(id) on delete cascade,
  draw_type text not null check (draw_type in ('individual','opponents','pairs','teams','order','positions','bracket','challenge','custom')),
  status text not null default 'preview' check (status in ('preview','confirmed','cancelled')),
  algorithm text not null default 'random',
  constraints jsonb not null default '{}'::jsonb,
  seed text not null,
  created_by uuid references auth.users(id),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.draw_results (
  id uuid primary key default gen_random_uuid(),
  draw_id uuid not null references public.draws(id) on delete cascade,
  position integer not null,
  participant_id uuid references public.participants(id) on delete restrict,
  team_id uuid references public.teams(id) on delete restrict,
  group_key text,
  payload jsonb not null default '{}'::jsonb,
  unique (draw_id, position),
  check ((participant_id is not null)::int + (team_id is not null)::int <= 1)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  activity_id uuid not null references public.activities(id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '{}'::jsonb,
  scoring_method text not null default 'points',
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  status text not null default 'draft' check (status in ('draft','ready','live','paused','finished','cancelled')),
  starts_at timestamptz,
  paused_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  station_id uuid references public.stations(id) on delete set null,
  position integer,
  primary key (challenge_id, participant_id)
);

create table public.challenge_results (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  score numeric,
  position integer,
  payload jsonb not null default '{}'::jsonb,
  confirmed_by uuid references auth.users(id),
  confirmed_at timestamptz not null default now(),
  unique (challenge_id, participant_id)
);

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  story text,
  secret_code_hash text not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds > 0),
  status text not null default 'draft' check (status in ('draft','ready','live','paused','unlocked','finished')),
  started_at timestamptz,
  paused_at timestamptz,
  unlocked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.mission_teams (
  mission_id uuid not null references public.missions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  code_fragments text[] not null default '{}',
  primary key (mission_id, team_id)
);

create table public.mission_tasks (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  title text not null,
  description text,
  position integer not null,
  rules jsonb not null default '{}'::jsonb,
  unique (mission_id, position)
);

create table public.mission_clues (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.mission_tasks(id) on delete cascade,
  content text not null,
  media_asset_id uuid,
  unlock_rule jsonb not null default '{}'::jsonb,
  position integer not null,
  unique (task_id, position)
);

create table public.mission_progress (
  mission_id uuid not null references public.missions(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  task_id uuid not null references public.mission_tasks(id) on delete cascade,
  status text not null default 'locked' check (status in ('locked','available','complete','skipped')),
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  primary key (mission_id, team_id, task_id)
);

create table public.mission_attempts (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  display_device_id uuid,
  success boolean not null,
  attempted_at timestamptz not null default now(),
  -- Never persist the plaintext submitted code.
  metadata jsonb not null default '{}'::jsonb
);

create table public.xp_transactions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason_code text not null,
  reason text,
  idempotency_key text not null,
  source_type text,
  source_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (event_id, idempotency_key)
);
create index xp_participant_idx on public.xp_transactions(participant_id, created_at);

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  description text,
  icon_key text,
  unique (event_id, code)
);

create table public.participant_achievements (
  participant_id uuid not null references public.participants(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  awarded_at timestamptz not null default now(),
  awarded_by uuid references auth.users(id),
  primary key (participant_id, achievement_id)
);

create table public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  position integer not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','paused','finished','cancelled')),
  activity_id uuid references public.activities(id) on delete set null,
  scene_type text,
  check (ends_at is null or ends_at > starts_at),
  unique (event_id, position)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 500),
  priority smallint not null default 50 check (priority between 0 and 100),
  scheduled_at timestamptz,
  status text not null default 'draft' check (status in ('draft','queued','played','cancelled')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id) on delete cascade,
  name text not null,
  asset_type text not null check (asset_type in ('image','audio','video','avatar','document')),
  storage_path text not null,
  mime_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  license text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (event_id, storage_path)
);

alter table public.mission_clues add constraint mission_clues_media_fk
  foreign key (media_asset_id) references public.media_assets(id) on delete set null;

create table public.display_devices (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  name text not null,
  pairing_code_hash text,
  pairing_expires_at timestamptz,
  linked_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz,
  audio_enabled boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.display_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.display_devices(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mission_attempts add constraint mission_attempts_display_fk
  foreign key (display_device_id) references public.display_devices(id) on delete set null;

create table public.scene_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  scene_type text not null,
  payload jsonb not null default '{}'::jsonb,
  priority smallint not null default 50 check (priority between 0 and 100),
  duration_ms integer check (duration_ms is null or duration_ms between 1000 and 600000),
  scheduled_at timestamptz not null default now(),
  sound jsonb not null default '{}'::jsonb,
  animation jsonb not null default '{}'::jsonb,
  interrupt_policy text not null default 'queue' check (interrupt_policy in ('queue','interrupt_lower','force','overlay')),
  status text not null default 'queued' check (status in ('queued','delivered','playing','played','skipped','expired','failed','cancelled')),
  target_device_id uuid references public.display_devices(id) on delete cascade,
  idempotency_key text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (event_id, idempotency_key)
);
create index scene_queue_idx on public.scene_events(event_id, status, priority desc, scheduled_at) where status = 'queued';

create table public.scene_playback_logs (
  id uuid primary key default gen_random_uuid(),
  scene_event_id uuid not null references public.scene_events(id) on delete cascade,
  device_id uuid not null references public.display_devices(id) on delete cascade,
  status text not null check (status in ('received','started','completed','failed','skipped')),
  occurred_at timestamptz not null default now(),
  error_message text,
  unique (scene_event_id, device_id, status)
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid references public.events(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_event_created_idx on public.audit_logs(event_id, created_at desc);

-- Common updated_at trigger.
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_updated before update on public.events for each row execute function public.set_updated_at();
create trigger participants_updated before update on public.participants for each row execute function public.set_updated_at();
create trigger activities_updated before update on public.activities for each row execute function public.set_updated_at();
create trigger stations_updated before update on public.stations for each row execute function public.set_updated_at();
create trigger tournaments_updated before update on public.tournaments for each row execute function public.set_updated_at();
create trigger settings_updated before update on public.event_settings for each row execute function public.set_updated_at();

-- Authorization helpers. SECURITY DEFINER functions deliberately expose only booleans.
create or replace function public.has_event_role(target_event uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.event_users eu
    where eu.event_id = target_event
      and eu.user_id = (select auth.uid())
      and eu.role = any(allowed_roles)
  );
$$;

revoke all on function public.has_event_role(uuid,text[]) from public;
grant execute on function public.has_event_role(uuid,text[]) to authenticated;

create or replace function public.participant_event(participant uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select event_id from public.participants where id = participant;
$$;
revoke all on function public.participant_event(uuid) from public;
grant execute on function public.participant_event(uuid) to authenticated;

-- Atomic reservation: locks the station and participants, then checks all active conflicts.
create or replace function public.reserve_station(
  target_event uuid,
  target_station uuid,
  participant_ids uuid[],
  assignment_context_type text,
  assignment_context_id uuid default null
) returns setof public.station_assignments
language plpgsql security invoker set search_path = '' as $$
declare
  station_capacity integer;
  p_id uuid;
  inserted public.station_assignments;
begin
  if not public.has_event_role(target_event, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if coalesce(array_length(participant_ids, 1), 0) = 0 then
    raise exception 'at least one participant is required';
  end if;

  select capacity into station_capacity from public.stations
  where id = target_station and event_id = target_event and status not in ('paused','out_of_service')
  for update;
  if station_capacity is null then raise exception 'station unavailable'; end if;
  if array_length(participant_ids, 1) > station_capacity then raise exception 'station capacity exceeded'; end if;

  perform 1 from public.participants p
  where p.id = any(participant_ids) and p.event_id = target_event
  order by p.id for update;

  if (select count(*) from public.participants p
      where p.id = any(participant_ids) and p.event_id = target_event
        and p.administrative_status = 'active'
        and p.operational_status in ('available','called')) <> array_length(participant_ids, 1) then
    raise exception 'one or more participants are unavailable';
  end if;
  if exists (select 1 from public.station_assignments sa
             where sa.participant_id = any(participant_ids) and sa.status in ('reserved','active')) then
    raise exception 'participant already assigned';
  end if;
  if (select count(*) from public.station_assignments sa
      where sa.station_id = target_station and sa.status in ('reserved','active')) + array_length(participant_ids, 1) > station_capacity then
    raise exception 'station capacity exceeded';
  end if;

  foreach p_id in array participant_ids loop
    insert into public.station_assignments(event_id, station_id, participant_id, context_type, context_id, created_by)
    values (target_event, target_station, p_id, assignment_context_type, assignment_context_id, auth.uid())
    returning * into inserted;
    return next inserted;
  end loop;
  update public.participants set operational_status = 'called' where id = any(participant_ids);
  update public.stations set status = 'reserved' where id = target_station;
end;
$$;

-- Mission codes are salted hashes; plaintext is never selected or logged.
create or replace function public.validate_mission_code(target_mission uuid, submitted_code text, target_device uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  code_hash text;
  mission_event uuid;
  accepted boolean := false;
begin
  select secret_code_hash, event_id into code_hash, mission_event
  from public.missions where id = target_mission for update;
  if code_hash is null then return false; end if;
  if not public.has_event_role(mission_event, array['owner','admin','operator','display']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  accepted := crypt(submitted_code, code_hash) = code_hash;
  insert into public.mission_attempts(mission_id, display_device_id, success)
  values (target_mission, target_device, accepted);
  if accepted then
    update public.missions set status = 'unlocked', unlocked_at = coalesce(unlocked_at, now()) where id = target_mission;
  end if;
  return accepted;
end;
$$;
revoke all on function public.validate_mission_code(uuid,text,uuid) from public, anon;
grant execute on function public.validate_mission_code(uuid,text,uuid) to authenticated;

-- RLS: membership gates all event data. Child-table policies resolve through parents.
alter table public.events enable row level security;
alter table public.event_users enable row level security;
alter table public.event_settings enable row level security;
alter table public.participants enable row level security;
alter table public.participant_consents enable row level security;
alter table public.participant_availability enable row level security;
alter table public.activities enable row level security;
alter table public.participant_activity_preferences enable row level security;
alter table public.stations enable row level security;
alter table public.station_assignments enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_entries enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.match_results enable row level security;
alter table public.draws enable row level security;
alter table public.draw_results enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_results enable row level security;
alter table public.missions enable row level security;
alter table public.mission_teams enable row level security;
alter table public.mission_tasks enable row level security;
alter table public.mission_clues enable row level security;
alter table public.mission_progress enable row level security;
alter table public.mission_attempts enable row level security;
alter table public.xp_transactions enable row level security;
alter table public.achievements enable row level security;
alter table public.participant_achievements enable row level security;
alter table public.schedule_items enable row level security;
alter table public.announcements enable row level security;
alter table public.media_assets enable row level security;
alter table public.display_devices enable row level security;
alter table public.display_sessions enable row level security;
alter table public.scene_events enable row level security;
alter table public.scene_playback_logs enable row level security;
alter table public.audit_logs enable row level security;

create policy events_member_select on public.events for select to authenticated
using (public.has_event_role(id, array['owner','admin','operator','checkin','display']));
create policy events_admin_write on public.events for all to authenticated
using (public.has_event_role(id, array['owner','admin'])) with check (public.has_event_role(id, array['owner','admin']));

create policy event_users_self_select on public.event_users for select to authenticated
using (user_id = (select auth.uid()) or public.has_event_role(event_id, array['owner','admin']));
create policy event_users_admin_write on public.event_users for all to authenticated
using (public.has_event_role(event_id, array['owner'])) with check (public.has_event_role(event_id, array['owner']));

-- Direct event_id tables.
create policy settings_member_select on public.event_settings for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy settings_admin_write on public.event_settings for all to authenticated using (public.has_event_role(event_id, array['owner','admin'])) with check (public.has_event_role(event_id, array['owner','admin']));
create policy participants_member_select on public.participants for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','checkin','display']));
create policy participants_operator_write on public.participants for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','checkin'])) with check (public.has_event_role(event_id, array['owner','admin','operator','checkin']));

-- Generic direct-event policies for operational tables (display can only read presentation-safe tables).
create policy activities_member on public.activities for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','checkin','display']));
create policy activities_write on public.activities for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy stations_member on public.stations for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy stations_write on public.stations for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy assignments_member on public.station_assignments for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy assignments_write on public.station_assignments for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy teams_member on public.teams for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy teams_write on public.teams for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy tournaments_member on public.tournaments for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy tournaments_write on public.tournaments for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy draws_member on public.draws for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy draws_write on public.draws for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy challenges_member on public.challenges for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy challenges_write on public.challenges for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy missions_member on public.missions for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator']));
create policy missions_write on public.missions for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy xp_member on public.xp_transactions for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy xp_write on public.xp_transactions for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy achievements_member on public.achievements for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy achievements_write on public.achievements for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy schedule_member on public.schedule_items for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy schedule_write on public.schedule_items for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy announcements_member on public.announcements for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy announcements_write on public.announcements for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy media_admin on public.media_assets for all to authenticated using (event_id is not null and public.has_event_role(event_id, array['owner','admin','operator'])) with check (event_id is not null and public.has_event_role(event_id, array['owner','admin','operator']));
create policy devices_admin on public.display_devices for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy scenes_member on public.scene_events for select to authenticated using (public.has_event_role(event_id, array['owner','admin','operator','display']));
create policy scenes_write on public.scene_events for all to authenticated using (public.has_event_role(event_id, array['owner','admin','operator'])) with check (public.has_event_role(event_id, array['owner','admin','operator']));
create policy audit_admin on public.audit_logs for select to authenticated using (event_id is not null and public.has_event_role(event_id, array['owner','admin']));

-- Sensitive child data.
create policy consents_privileged on public.participant_consents for all to authenticated
using (public.has_event_role(public.participant_event(participant_id), array['owner','admin','operator','checkin']))
with check (public.has_event_role(public.participant_event(participant_id), array['owner','admin','operator','checkin']));
create policy availability_member on public.participant_availability for all to authenticated
using (public.has_event_role(public.participant_event(participant_id), array['owner','admin','operator']))
with check (public.has_event_role(public.participant_event(participant_id), array['owner','admin','operator']));

-- Remaining child tables are intentionally service-role-only in this first migration.
-- Server actions/RPCs may access them after verifying event membership. This prevents
-- accidental broad client access until each read model has a purpose-built policy.

-- Private media bucket. Object names must begin with the event UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-private', 'event-private', false, 10485760, array['image/jpeg','image/png','image/webp','audio/mpeg','audio/wav','video/mp4'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy event_private_read on storage.objects for select to authenticated
using (bucket_id = 'event-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator','checkin','display']));
create policy event_private_write on storage.objects for insert to authenticated
with check (bucket_id = 'event-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator','checkin']));
create policy event_private_update on storage.objects for update to authenticated
using (bucket_id = 'event-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator','checkin']))
with check (bucket_id = 'event-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin','operator','checkin']));
create policy event_private_delete on storage.objects for delete to authenticated
using (bucket_id = 'event-private'
  and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and public.has_event_role(((storage.foldername(name))[1])::uuid, array['owner','admin']));

