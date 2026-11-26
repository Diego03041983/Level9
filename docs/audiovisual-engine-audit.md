# Auditoría e integración del motor audiovisual

## Componentes preservados

- `scene_events` continúa siendo la cola persistente y la única fuente de escenas para el Smart TV.
- `/tv/connect` conserva la autenticación por dispositivo, la recuperación después de desconexiones y la firma temporal de recursos privados.
- `useAudioEngine` sigue siendo el reproductor único; ahora también acepta secuencias de fragmentos.
- `reception_sessions`, `reception_media_assignments` y sus RPC no se reemplazan ni reconstruyen.
- Sorteos, torneos, desafíos, misiones, estaciones y resultados siguen utilizando sus entidades existentes.

## Ampliaciones

- Catálogo lógico sobre `media_assets`, sin publicar rutas privadas ni nombres de menores.
- Audios `identity`, `welcome`, `name` y `special_intro` asociados al UUID del participante.
- Plantillas de locución y fragmentos configurables.
- Registro auditable de eventos audiovisuales separado de la escena reproducida.
- Composición secuencial con silencios, volumen por fragmento, cancelación y pausa.
- Centro de evento, Show Control móvil, biblioteca, editor de locuciones, misión y configuración.
- Modo ensayo: reproduce escenas sin modificar resultados, misión, XP ni estados operativos.
- Automatización posterior a la confirmación real de sorteos y resultados.

## Política de faltantes

- Un archivo inexistente nunca se simula.
- La secuencia omite el recurso faltante, marca la reproducción como degradada y mantiene la identificación visual.
- La biblioteca muestra preparación, faltantes y recursos existentes.
- Un audio genérico `player-generic` puede cargarse como alternativa para nombres todavía no grabados.

## Seguridad

- Los archivos permanecen en `event-media`, un bucket privado.
- La TV recibe URLs firmadas de corta duración.
- Las rutas de audio por jugador usan UUID; no incluyen nombres.
- El código de misión se almacena con `crypt()` y sólo se valida en backend.
- Las escenas de ensayo nunca ejecutan mutaciones operativas.

## Operación pendiente del organizador

La biblioteca enumera el catálogo completo de WAV/MP3 solicitado y calcula el porcentaje real de preparación. Los elementos marcados como faltantes deben generarse externamente y cargarse usando su identificador lógico exacto.
