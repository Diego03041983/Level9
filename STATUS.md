# Santiago Level 9 — Estado real

Actualizado: 25 de noviembre de 2026.

## Estado general

**Vertical slice local verificado; integración de producción pendiente.** El repositorio estaba vacío al comenzar. No existe despliegue ni credenciales configuradas.

## Verificado

- Brief funcional completo leído (1.429 líneas).
- Repositorio Git existente y sin commits previos.
- Node.js 24.15.0 y npm 11.12.1 disponibles.
- Documentación oficial vigente de Next.js, Supabase SSR, Motion y Playwright consultada.
- Coordinación Ruflo inicializada para el trabajo multiarchivo.
- Next.js 16.4.6 con App Router, React 19.3 y TypeScript estricto.
- Interfaces `/`, `/admin`, `/checkin`, `/tv`, `/mission` y `/login`.
- PRESS START, Web Audio, escenas TV, acciones del dashboard, check-in local y terminal de misión.
- Validación de misión en backend; código demo `2909` sólo cuando el modo demo está habilitado.
- Motor puro de sorteos, llaves, escenas y XP con 10 pruebas unitarias.
- Migración Supabase con 40 tablas, 43 políticas RLS, RPC transaccionales y seed demo de 14 jugadores.
- 17 efectos originales generados en MP3 y WAV con manifiesto.
- `lint`, `typecheck`, 10 tests y build de producción aprobados.
- Revisión manual en navegador: dashboard, pausa de partido, PRESS START/escena TV y desbloqueo de misión.

## En curso

- Conectar los flujos visuales al proyecto Supabase real y a Realtime.
- Completar administración CRUD, carga privada de fotos y operaciones transaccionales.
- Completar torneos/resultados, control audiovisual persistente, misión editable y E2E.

## Pendiente de intervención externa

- Crear o proporcionar proyecto Supabase y variables de entorno.
- Autorizar/configurar repositorio GitHub y proyecto Vercel.
- Probar compatibilidad y control remoto en el Smart TV físico.
- Cargar fotografías reales únicamente con consentimiento.

## Limitaciones actuales

- Aún no hay URL pública.
- La migración SQL no pudo ejecutarse: no hay Supabase CLI/PostgreSQL local ni proyecto remoto autorizado.
- El check-in visual usa estado local; la cámara/subida privada aún debe conectarse a Storage.
- Las escenas y resultados demo todavía no se sincronizan entre dispositivos mediante Realtime.
- No se ejecutaron Playwright ni pruebas en el Smart TV físico.
- El alcance completo de 34 secciones sigue siendo trabajo de varias fases; este corte no se declara producto terminado.
