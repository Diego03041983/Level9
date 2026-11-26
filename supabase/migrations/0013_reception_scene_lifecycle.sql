-- Keep only the current NEXUS scene recoverable and close scenes with their session.

create or replace function public.expire_prior_nexus_scene()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scene_type like 'NEXUS_%' and nullif(new.payload->>'sessionId','') is not null then
    update public.scene_events
    set status = 'expired'
    where event_id = new.event_id
      and payload->>'sessionId' = new.payload->>'sessionId'
      and status in ('queued','delivered','playing');
  end if;
  return new;
end;
$$;

drop trigger if exists expire_prior_nexus_scene_before_insert on public.scene_events;
create trigger expire_prior_nexus_scene_before_insert
before insert on public.scene_events
for each row execute function public.expire_prior_nexus_scene();

create or replace function public.expire_reception_scenes_on_close()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('cancelled','completed') and new.status is distinct from old.status then
    update public.scene_events
    set status = case when new.status = 'cancelled' then 'cancelled' else 'expired' end
    where event_id = new.event_id
      and payload->>'sessionId' = new.id::text
      and status in ('queued','delivered','playing');
  end if;
  return new;
end;
$$;

drop trigger if exists reception_session_close_scenes on public.reception_sessions;
create trigger reception_session_close_scenes
after update of status on public.reception_sessions
for each row execute function public.expire_reception_scenes_on_close();

-- Repair outstanding scenes left by sessions that were already closed.
update public.scene_events scene
set status = case when session.status = 'cancelled' then 'cancelled' else 'expired' end
from public.reception_sessions session
where scene.event_id = session.event_id
  and scene.payload->>'sessionId' = session.id::text
  and session.status in ('cancelled','completed')
  and scene.status in ('queued','delivered','playing');

-- For a live session, only its most recently requested scene may be recovered.
with ranked as (
  select scene.id,
    row_number() over (partition by scene.payload->>'sessionId' order by scene.created_at desc, scene.id desc) as position
  from public.scene_events scene
  join public.reception_sessions session on scene.payload->>'sessionId' = session.id::text
  where session.status in ('active','paused')
    and scene.scene_type like 'NEXUS_%'
    and scene.status in ('queued','delivered','playing')
)
update public.scene_events scene
set status = 'expired'
from ranked
where scene.id = ranked.id and ranked.position > 1;

