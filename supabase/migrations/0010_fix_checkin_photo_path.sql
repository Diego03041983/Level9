-- PostgreSQL regular-expression strings do not need the JavaScript-style
-- double escape previously used for the photo extension.  The old expression
-- rejected every valid private participant photo path.

create or replace function public.register_participant_checkin(
  p_event_id uuid,
  p_participant_id uuid,
  p_first_name text,
  p_last_name text,
  p_gamer_tag text,
  p_avatar_key text,
  p_photo_path text,
  p_photo_allowed boolean,
  p_guardian_confirmation text,
  p_auto_welcome boolean,
  p_scene_idempotency_key text,
  p_actor_user_id uuid
) returns public.participants
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  resolved_id uuid := coalesce(p_participant_id, gen_random_uuid());
  next_number integer;
  checked_in public.participants;
  configured_auto_welcome boolean := false;
begin
  if caller is null
     or caller <> p_actor_user_id
     or not public.has_event_role(p_event_id, array['owner','admin','operator','checkin']) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if nullif(btrim(p_first_name), '') is null then
    raise exception 'first name is required' using errcode = '22023';
  end if;
  if p_photo_path is not null and not p_photo_allowed then
    raise exception 'photo path requires photo consent' using errcode = '23514';
  end if;
  if p_photo_allowed and nullif(btrim(p_guardian_confirmation), '') is null then
    raise exception 'guardian confirmation is required for photos' using errcode = '23514';
  end if;
  if p_photo_path is not null and p_photo_path !~
    ('^' || p_event_id::text || '/participants/[0-9a-fA-F-]{36}[.]jpg$') then
    raise exception 'invalid private photo path' using errcode = '22023';
  end if;

  perform 1 from public.events where id = p_event_id for update;
  if not found then raise exception 'event not found' using errcode = 'P0002'; end if;

  select * into checked_in from public.participants
  where id = resolved_id for update;

  if found then
    if checked_in.event_id <> p_event_id then
      raise exception 'participant belongs to another event' using errcode = '42501';
    end if;
    update public.participants
    set first_name = btrim(p_first_name),
        last_name = nullif(btrim(p_last_name), ''),
        gamer_tag = nullif(btrim(p_gamer_tag), ''),
        avatar_key = p_avatar_key,
        photo_path = p_photo_path,
        administrative_status = 'active',
        operational_status = 'available',
        arrived_at = coalesce(arrived_at, now()),
        departed_at = null
    where id = resolved_id
    returning * into checked_in;
  else
    select coalesce(max(player_number), 0) + 1 into next_number
    from public.participants where event_id = p_event_id;
    insert into public.participants(
      id, event_id, first_name, last_name, gamer_tag, player_number,
      avatar_key, photo_path, administrative_status, operational_status,
      arrived_at, is_demo
    )
    select resolved_id, p_event_id, btrim(p_first_name), nullif(btrim(p_last_name), ''),
           nullif(btrim(p_gamer_tag), ''), next_number, p_avatar_key, p_photo_path,
           'active', 'available', now(), e.is_demo
    from public.events e where e.id = p_event_id
    returning * into checked_in;
  end if;

  insert into public.participant_consents(
    participant_id, photo_allowed, guardian_confirmation, created_by
  ) values (
    resolved_id, p_photo_allowed, nullif(btrim(p_guardian_confirmation), ''), caller
  );

  insert into public.participant_activity_preferences(participant_id, activity_id, enabled)
  select resolved_id, id, true from public.activities where event_id = p_event_id and enabled
  on conflict (participant_id, activity_id) do update set enabled = excluded.enabled;

  insert into public.xp_transactions(
    event_id, participant_id, amount, reason_code, reason,
    idempotency_key, source_type, source_id, created_by
  ) values (
    p_event_id, resolved_id, 100, 'CHECKIN', 'Registro de jugador',
    'checkin:' || resolved_id::text, 'participant', resolved_id, caller
  ) on conflict (event_id, idempotency_key) do nothing;

  select auto_welcome into configured_auto_welcome
  from public.event_settings where event_id = p_event_id;
  if coalesce(configured_auto_welcome, false) and p_auto_welcome then
    insert into public.scene_events(
      event_id, scene_type, payload, priority, duration_ms, sound,
      interrupt_policy, idempotency_key, created_by
    ) values (
      p_event_id, 'PLAYER_UNLOCKED',
      jsonb_build_object(
        'participantId', resolved_id,
        'firstName', checked_in.first_name,
        'gamerTag', checked_in.gamer_tag,
        'playerNumber', checked_in.player_number,
        'avatarKey', checked_in.avatar_key,
        'photoPath', checked_in.photo_path
      ),
      70, 9000, jsonb_build_object('asset', 'player-unlocked'),
      'queue', p_scene_idempotency_key, caller
    ) on conflict (event_id, idempotency_key) do nothing;
  end if;

  insert into public.audit_logs(event_id, actor_user_id, action, entity_type, entity_id, new_data)
  values (
    p_event_id, caller, 'participant.checkin', 'participant', resolved_id,
    jsonb_build_object(
      'photo_allowed', p_photo_allowed,
      'player_number', checked_in.player_number,
      'was_update', p_participant_id is not null
    )
  );
  return checked_in;
end;
$$;

revoke all on function public.register_participant_checkin(uuid,uuid,text,text,text,text,text,boolean,text,boolean,text,uuid) from public, anon;
grant execute on function public.register_participant_checkin(uuid,uuid,text,text,text,text,text,boolean,text,boolean,text,uuid) to authenticated;
