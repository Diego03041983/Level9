-- Delete an unused player atomically; existing tournament brackets remain valid.
create or replace function public.delete_event_player(p_event_id uuid,p_participant_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.has_event_role(p_event_id,array['owner','admin']) then raise exception 'No tenés permiso para eliminar jugadores'; end if;
  perform 1 from public.participants where id=p_participant_id and event_id=p_event_id for update;
  if not found then raise exception 'Jugador inexistente'; end if;
  if exists(select 1 from public.station_assignments where participant_id=p_participant_id and status in ('reserved','active'))
     or exists(select 1 from public.reception_sessions where participant_id=p_participant_id and status in ('active','paused')) then
    raise exception 'Terminá o cancelá la actividad del jugador antes de eliminarlo';
  end if;
  if exists(select 1 from public.tournament_entries te where te.participant_id=p_participant_id or te.team_id in (select team_id from public.team_members where participant_id=p_participant_id)) then
    raise exception 'El jugador pertenece a un torneo. Resolvé su participación antes de eliminarlo';
  end if;
  delete from public.station_assignments where participant_id=p_participant_id;
  delete from public.draw_results where participant_id=p_participant_id;
  delete from public.participants where id=p_participant_id and event_id=p_event_id;
end $$;
revoke all on function public.delete_event_player(uuid,uuid) from public;
grant execute on function public.delete_event_player(uuid,uuid) to authenticated;

create or replace function public.delete_event_display(p_event_id uuid,p_device_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.has_event_role(p_event_id,array['owner','admin','operator']) then raise exception 'No tenés permiso para eliminar pantallas'; end if;
  delete from public.display_devices where id=p_device_id and event_id=p_event_id;
end $$;
revoke all on function public.delete_event_display(uuid,uuid) from public;
grant execute on function public.delete_event_display(uuid,uuid) to authenticated;
alter table public.display_devices add constraint display_name_required check(char_length(btrim(name)) between 1 and 80);
