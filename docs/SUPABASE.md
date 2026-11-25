# Configuración de Supabase

## Alcance actual

La migración `0001_initial.sql` crea el modelo relacional inicial, índices, controles de integridad, RLS, el bucket privado `event-private`, la reserva transaccional de estaciones y la validación del código de misión mediante hash. El seed agrega un evento **demo**, 14 participantes ficticios, actividades, estaciones y agenda. No crea usuarios reales ni mezcla datos del evento real.

## Desarrollo local

1. Instalar Supabase CLI.
2. Ejecutar `supabase start`.
3. Ejecutar `supabase db reset`; esto aplica migraciones y `supabase/seed.sql`.
4. Copiar las claves locales a `.env.local` usando `.env.example`.
5. Crear un usuario con Supabase Auth y asociarlo al evento mediante `event_users`.

Ejemplo de asociación inicial, ejecutado desde SQL Editor con un UUID de usuario real:

```sql
insert into public.event_users(event_id, user_id, role)
values ('10000000-0000-4000-8000-000000000001', '<auth-user-uuid>', 'owner');
```

## Producción

1. Crear un proyecto Supabase en la región apropiada.
2. Vincular la CLI: `supabase link --project-ref <ref>`.
3. Revisar el SQL y ejecutar `supabase db push`.
4. No ejecutar `seed.sql` en producción salvo que se quiera cargar el modo demo.
5. Configurar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel. La service-role nunca se expone al cliente.

## Fotografías y privacidad

- `event-private` es privado y limita tipos MIME y tamaño (10 MB antes de compresión).
- Los objetos deben guardarse bajo `<event_uuid>/participants/<participant_uuid>/...`.
- La aplicación debe emitir URLs firmadas breves desde servidor.
- Las sesiones con rol `display` pueden leer objetos del evento para presentar fotos, pero no enumerar tablas de consentimiento.
- Retirar consentimiento requiere borrar el objeto, limpiar `participants.photo_path` y crear un nuevo registro de consentimiento con `withdrawn_at`.

## Decisiones de seguridad

- RLS está habilitado en todas las tablas.
- Las tablas operativas principales tienen políticas por membresía y rol.
- Tablas hijas que aún no tienen un read model público quedan deliberadamente accesibles sólo con service-role/RPC verificada; no se otorgó acceso amplio por comodidad.
- `validate_mission_code` compara `crypt()` contra un hash bcrypt y nunca persiste el código ingresado.
- `reserve_station` bloquea estación y participantes, valida capacidad/estado y evita asignaciones activas duplicadas dentro de una transacción.
- `display_sessions.token_hash` y `display_devices.pairing_code_hash` deben guardar hashes, nunca tokens o códigos en claro.

## Realtime

Supabase Realtime requiere agregar explícitamente las tablas necesarias a `supabase_realtime` en el proyecto. Comenzar con `participants`, `stations`, `station_assignments`, `matches`, `scene_events`, `display_devices`, `mission_progress` y `xp_transactions`. Publicar sólo las tablas realmente consumidas y mantener RLS.

## Limitaciones pendientes

- La migración debe ejecutarse contra un proyecto Supabase real para verificar compatibilidad exacta de la versión de PostgreSQL y Storage instalada.
- Las tablas hijas service-role-only necesitan políticas/RPC específicas a medida que se implementen sus pantallas.
- La vinculación TV requiere Route Handlers que creen/validen tokens hash y una prueba de revocación end-to-end.
- No se han probado todavía concurrencia real ni políticas con múltiples usuarios; deben cubrirse con pruebas de integración en CI.
