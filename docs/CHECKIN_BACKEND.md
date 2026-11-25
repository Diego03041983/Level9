# Contrato backend de check-in

La UI y el Route Handler utilizan una sesión Supabase autenticada con un rol de evento `owner`, `admin`, `operator` o `checkin`. Nunca se entrega la service role al navegador y las fotos se guardan en el bucket privado `event-private`, bajo la ruta `<event_uuid>/participants/<uuid>.jpg`.

## RPC transaccional requerida

La operación de datos invoca `public.register_participant_checkin` con:

- `p_event_id uuid`
- `p_participant_id uuid` nullable (actualización de invitado existente)
- `p_first_name text`, `p_last_name text`, `p_gamer_tag text`
- `p_avatar_key text`, `p_photo_path text`
- `p_photo_allowed boolean`, `p_guardian_confirmation text`
- `p_auto_welcome boolean`
- `p_scene_idempotency_key text`
- `p_actor_user_id uuid`

La función debe validar `auth.uid()` y `has_event_role`, bloquear el evento y la numeración de jugadores, y realizar en una sola transacción:

1. crear o actualizar `participants` como activo/disponible y registrar `arrived_at`;
2. cerrar el consentimiento vigente y crear `participant_consents`;
3. registrar disponibilidad y preferencias de actividades habilitadas;
4. acreditar los XP de registro con una clave idempotente;
5. insertar `PLAYER_UNLOCKED` en `scene_events` cuando `p_auto_welcome` sea verdadero;
6. insertar el `audit_log` correspondiente;
7. devolver al menos `id`, `first_name`, `gamer_tag` y `player_number`.

Hasta que esa RPC se instale, el endpoint responde `503 RPC_UNAVAILABLE` y la UI no declara el registro como realizado. Si ya se había subido una foto, el servidor intenta eliminarla con la credencial privada; cualquier huérfano restante sigue siendo privado y debe ser recogido por la política de retención.
