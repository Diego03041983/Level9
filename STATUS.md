# Santiago Level 9 — Estado real

Actualizado: 25 de noviembre de 2026.

## Implementado y verificado

- Supabase de producción con migraciones versionadas, Auth, RLS, Realtime y Storage privado.
- Alta segura de la primera cuenta y creación del evento real, actividades, estaciones, agenda y logros.
- `/admin` conectado a datos reales, estado de TV, cola audiovisual, anuncios y versus.
- `/admin/players`, `/admin/activities`, `/admin/teams`, `/admin/draws`, `/admin/tournaments`, `/admin/schedule` y `/admin/display` con operaciones persistentes.
- `/checkin` con foto comprimida, consentimiento, avatar alternativo, XP y escena automática.
- `/tv` con pairing revocable, polling seguro, heartbeat, ACK, cola, escenas, MP3 reales, mute y volumen.
- `/mission` valida el código exclusivamente mediante RPC de Supabase y encola la celebración.
- Motor de sorteos y torneo eliminatorio con pases directos; resultados confirmados avanzan al ganador.
- 17 efectos originales MP3/WAV y manifiesto reproducible.
- Pruebas, lint, TypeScript estricto y build de producción ejecutados antes del despliegue.

## Separación y privacidad

- Producción no contiene el seed demo.
- Fotografías en bucket privado; el TV recibe únicamente URLs firmadas de corta duración.
- Clave service-role configurada sólo como secreto de Vercel.
- Acceso administrativo y de check-in protegido por Auth y roles del evento.

## Validación física pendiente

- Probar control remoto, audio y navegador en el modelo exacto de Smart TV.
- Registrar invitados y fotografías reales únicamente con autorización del responsable.

## URL

- Producción: https://level9-nu.vercel.app
