# Santiago Level 9 — Plan de implementación

Actualizado: 25 de noviembre de 2026.

## Principios

- Mantener el proyecto ejecutable en cada fase.
- Resolver reglas sensibles en backend y base de datos.
- Separar estrictamente datos demo y reales.
- Priorizar el flujo operativo del evento y el Smart TV.
- Marcar como pendiente toda integración que requiera credenciales o hardware real.

## Fases

### Fase 1 — Infraestructura

- [x] Inicializar Next.js App Router, TypeScript estricto y Tailwind.
- [x] Configurar Supabase SSR, Auth y variables de entorno.
- [x] Crear esquema relacional, RLS, funciones transaccionales y seed demo.
- [x] Crear shell visual y navegación de las cuatro interfaces.
- [ ] Conectar la configuración del evento a una instancia Supabase real.

### Fase 2 — Operación

- [ ] Implementar check-in con foto/avatar y consentimiento.
- [ ] Implementar administración y disponibilidad de participantes.
- [ ] Implementar estaciones y prevención de conflictos.
- [x] Implementar núcleo puro y probado del motor de sorteos.
- [ ] Conectar confirmación, historial y bloqueo transaccional a Supabase.

### Fase 3 — Competencias

- [x] Implementar y probar generador de llaves FIFA (14 jugadores) y metegol (7 parejas).
- [ ] Conectar llaves, resultados y dependencias a la interfaz y Supabase.
- [ ] Roblox por estaciones y desafíos.
- [ ] XP por libro de movimientos y logros.

### Fase 4 — Experiencia audiovisual

- [x] Smart TV demo con PRESS START y modo pantalla completa opcional.
- [x] Núcleo probado de cola de escenas idempotente.
- [x] Generar 17 sonidos sintetizados reales en MP3/WAV.
- [ ] Persistir y sincronizar Scene/Audio Engine con Supabase Realtime.
- [ ] Consola móvil de control audiovisual.

### Fase 5 — Misión Robux

- [ ] Editor de historia, equipos, tareas y pistas.
- [ ] Terminal con cronómetro y validación de código en servidor.
- [ ] Desbloqueo y celebración final.

### Fase 6 — Producción

- [ ] Pruebas unitarias, integración, E2E y RLS.
- [ ] Auditoría de seguridad, accesibilidad y rendimiento.
- [ ] Build de producción y documentación operativa.
- [ ] Configuración de Supabase/Vercel y prueba física en Smart TV.

## Gates de calidad

Cada entrega ejecutará, cuando aplique: lint, typecheck, tests y build.

