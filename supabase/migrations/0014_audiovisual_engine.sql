-- Dynamic audiovisual announcements and operational show control.
-- This extends scene_events; it deliberately does not replace the reception engine.

alter table public.media_assets
  add column if not exists logical_key text,
  add column if not exists category text not null default 'uncategorized',
  add column if not exists character_name text,
  add column if not exists status text not null default 'active',
  add column if not exists default_volume numeric(4,3) not null default 1,
  add column if not exists updated_at timestamptz not null default now();

alter table public.media_assets
  drop constraint if exists media_assets_category_check,
  add constraint media_assets_category_check check (category in ('event','players','competitions','roblox','mission','sfx','music','videos','images','uncategorized')),
  drop constraint if exists media_assets_status_check,
  add constraint media_assets_status_check check (status in ('active','missing','disabled','archived')),
  drop constraint if exists media_assets_default_volume_check,
  add constraint media_assets_default_volume_check check (default_volume between 0 and 1),
  drop constraint if exists media_assets_logical_key_check,
  add constraint media_assets_logical_key_check check (logical_key is null or logical_key ~ '^[a-z0-9][a-z0-9._-]{1,99}$');

create unique index if not exists media_assets_event_logical_key_idx
  on public.media_assets(event_id, logical_key) where logical_key is not null and status <> 'archived';
create index if not exists media_assets_catalog_idx on public.media_assets(event_id, category, status);
drop trigger if exists media_assets_updated on public.media_assets;
create trigger media_assets_updated before update on public.media_assets
for each row execute function public.set_updated_at();

create table if not exists public.participant_audio_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  audio_role text not null check (audio_role in ('identity','welcome','name','special_intro')),
  media_asset_id uuid not null references public.media_assets(id) on delete cascade,
  status text not null default 'active' check (status in ('active','missing','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (participant_id, audio_role)
);
create index if not exists participant_audio_event_idx on public.participant_audio_assets(event_id, audio_role, status);
drop trigger if exists participant_audio_assets_updated on public.participant_audio_assets;
create trigger participant_audio_assets_updated before update on public.participant_audio_assets
for each row execute function public.set_updated_at();

-- Reuse already-uploaded reception voice resources without copying private files.
insert into public.participant_audio_assets(event_id, participant_id, audio_role, media_asset_id)
select rma.event_id, rma.participant_id,
  case rma.scene_key when 'IDENTITY_REVEAL' then 'identity' when 'PLAYER_UNLOCKED' then 'welcome' else 'special_intro' end,
  rma.media_asset_id
from public.reception_media_assignments rma
where rma.participant_id is not null
  and rma.media_kind = 'audio'
  and rma.scene_key in ('IDENTITY_REVEAL','PLAYER_UNLOCKED','BIRTHDAY_HERO')
on conflict (participant_id, audio_role) do nothing;

create table if not exists public.announcement_templates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  template_key text not null check (template_key ~ '^[A-Z0-9_]{2,80}$'),
  name text not null check (char_length(name) between 2 and 120),
  category text not null check (category in ('event','players','competitions','roblox','mission')),
  character_name text not null default 'Nexus-9',
  trigger_event text,
  scene_type text not null,
  priority smallint not null default 50 check (priority between 0 and 100),
  play_policy text not null default 'queue' check (play_policy in ('queue','interrupt','resume','discard_expired','replace_equivalent','confirm')),
  post_scene_type text,
  enabled boolean not null default true,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, template_key)
);
drop trigger if exists announcement_templates_updated on public.announcement_templates;
create trigger announcement_templates_updated before update on public.announcement_templates
for each row execute function public.set_updated_at();

create table if not exists public.announcement_segments (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.announcement_templates(id) on delete cascade,
  position integer not null check (position > 0),
  segment_type text not null check (segment_type in ('fixed_audio','participant_audio','silence','effect','music')),
  config jsonb not null default '{}'::jsonb,
  optional boolean not null default false,
  volume numeric(4,3) not null default 1 check (volume between 0 and 1),
  created_at timestamptz not null default now(),
  unique (template_id, position)
);

create table if not exists public.audiovisual_events (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  event_key text not null check (event_key ~ '^[A-Z0-9_]{2,100}$'),
  payload jsonb not null default '{}'::jsonb,
  priority smallint not null check (priority between 0 and 100),
  play_policy text not null check (play_policy in ('queue','interrupt','resume','discard_expired','replace_equivalent','confirm')),
  status text not null default 'pending' check (status in ('pending','queued','playing','played','skipped','failed','cancelled','awaiting_confirmation')),
  rehearsal boolean not null default false,
  idempotency_key text not null,
  scene_event_id uuid references public.scene_events(id) on delete set null,
  expires_at timestamptz,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, idempotency_key)
);
create index if not exists audiovisual_events_queue_idx on public.audiovisual_events(event_id, status, priority desc, created_at);
drop trigger if exists audiovisual_events_updated on public.audiovisual_events;
create trigger audiovisual_events_updated before update on public.audiovisual_events
for each row execute function public.set_updated_at();

alter table public.event_settings add column if not exists audiovisual jsonb not null default jsonb_build_object(
  'priorities', jsonb_build_object('mission',100,'cake_closing',90,'awards_finals',80,'reception',70,'competition',60,'calls',50,'information',40,'idle',10),
  'defaultGapMs', 160,
  'ducking', true,
  'automaticWarnings', true
);

alter table public.missions
  add column if not exists paused_seconds integer not null default 0 check (paused_seconds >= 0),
  add column if not exists extension_seconds integer not null default 0,
  add column if not exists warnings_sent jsonb not null default '{}'::jsonb,
  add column if not exists completed_at timestamptz;

alter table public.participant_audio_assets enable row level security;
alter table public.announcement_templates enable row level security;
alter table public.announcement_segments enable row level security;
alter table public.audiovisual_events enable row level security;

create policy participant_audio_admin on public.participant_audio_assets for all to authenticated
using (public.has_event_role(event_id, array['owner','admin','operator']))
with check (public.has_event_role(event_id, array['owner','admin','operator']));

create policy announcement_templates_admin on public.announcement_templates for all to authenticated
using (public.has_event_role(event_id, array['owner','admin','operator']))
with check (public.has_event_role(event_id, array['owner','admin','operator']));

create policy announcement_segments_admin on public.announcement_segments for all to authenticated
using (exists (
  select 1 from public.announcement_templates t
  where t.id = template_id and public.has_event_role(t.event_id, array['owner','admin','operator'])
))
with check (exists (
  select 1 from public.announcement_templates t
  where t.id = template_id and public.has_event_role(t.event_id, array['owner','admin','operator'])
));

create policy audiovisual_events_admin on public.audiovisual_events for all to authenticated
using (public.has_event_role(event_id, array['owner','admin','operator']))
with check (public.has_event_role(event_id, array['owner','admin','operator']));

grant select, insert, update, delete on public.participant_audio_assets to authenticated;
grant select, insert, update, delete on public.announcement_templates to authenticated;
grant select, insert, update, delete on public.announcement_segments to authenticated;
grant select, insert, update, delete on public.audiovisual_events to authenticated;

alter table public.participant_audio_assets replica identity full;
alter table public.announcement_templates replica identity full;
alter table public.announcement_segments replica identity full;
alter table public.audiovisual_events replica identity full;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='audiovisual_events') then
    alter publication supabase_realtime add table public.audiovisual_events;
  end if;
end $$;

create or replace function public.configure_level9_mission(
  p_event_id uuid,
  p_name text,
  p_story text,
  p_secret_code text,
  p_duration_seconds integer
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare mission_id uuid;
begin
  if not public.has_event_role(p_event_id, array['owner','admin','operator']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_secret_code !~ '^\d{4,8}$' or p_duration_seconds not between 300 and 10800 then
    raise exception 'invalid mission configuration' using errcode = '22023';
  end if;
  select id into mission_id from public.missions where event_id = p_event_id and status <> 'finished' order by created_at desc limit 1;
  if mission_id is null then
    insert into public.missions(event_id,name,story,secret_code_hash,duration_seconds,status)
    values (p_event_id,left(p_name,120),left(p_story,2000),extensions.crypt(p_secret_code,extensions.gen_salt('bf')),p_duration_seconds,'ready')
    returning id into mission_id;
  else
    update public.missions set name=left(p_name,120),story=left(p_story,2000),secret_code_hash=extensions.crypt(p_secret_code,extensions.gen_salt('bf')),duration_seconds=p_duration_seconds,status='ready',started_at=null,paused_at=null,paused_seconds=0,extension_seconds=0,warnings_sent='{}'::jsonb,unlocked_at=null,completed_at=null where id=mission_id;
  end if;
  return mission_id;
end;
$$;
revoke all on function public.configure_level9_mission(uuid,text,text,text,integer) from public,anon;
grant execute on function public.configure_level9_mission(uuid,text,text,text,integer) to authenticated;
