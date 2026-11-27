create or replace function public.enqueue_mission_defeat()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='unlocked' and old.status is distinct from 'unlocked' then
    insert into public.scene_events(event_id,scene_type,payload,priority,duration_ms,sound,animation,interrupt_policy,status,idempotency_key,created_by)
    values(new.event_id,'GLITCH_DEFEATED',jsonb_build_object('missionId',new.id,'title','GLITCH DERROTADO'),100,6500,'{}'::jsonb,'{"preset":"glitch-defeat"}'::jsonb,'force','queued','mission:'||new.id||':glitch-defeated',auth.uid());
  end if;
  return new;
end;$$;
drop trigger if exists mission_defeat_on_unlock on public.missions;
create trigger mission_defeat_on_unlock after update of status on public.missions
for each row execute function public.enqueue_mission_defeat();
