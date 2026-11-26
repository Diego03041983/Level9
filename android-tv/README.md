# Level 9 TV para Android TV

Aplicación para televisores Android TV 6.0 o superior. La versión 1.1 reproduce los MP4 con Media3 sobre una superficie nativa; la web conserva las órdenes, vinculación y locuciones por jugador. El archivo publicado se actualiza en `/app`.

## Uso en el televisor

1. Instalá `level9-tv.apk`.
2. Abrí **Level 9 TV**.
3. En la computadora, abrí Administración y presioná **Vincular Smart TV**.
4. Escribí en la app el código de 10 caracteres que aparece en Administración.
5. Presioná **Habilitar audio e iniciar** una vez.

Instalá la actualización sobre la versión anterior, sin desinstalarla, para conservar la vinculación.

La tecla **Menú** (o **Atrás → Opciones**) permite recargar, vincular o activar **Modo compatible (pantalla verde)**. Este último prioriza decodificadores por software y se aplica al siguiente video. No hay precargas simultáneas de MP4. Las órdenes se recuperan a los 750 ms de terminar la consulta anterior; la latencia total depende de la red y del servidor.

## Compilación

```bash
./gradlew :app:assembleRelease
```

El APK se genera en `app/build/outputs/apk/release/app-release.apk`. La compilación local usa la clave Android existente en `~/.android/debug.keystore` para conservar la misma firma entre actualizaciones instaladas desde esta computadora.

## Verificación

`./gradlew :app:connectedDebugAndroidTest` prueba reproducción del MP4 publicado, avance, pausa, continuación, cambio de escena, descarte de eventos anteriores y decodificación por software. Requiere emulador o dispositivo Android conectado. La prueba no crea escenas ni jugadores en producción.

`PLAYWRIGHT_PATH=/ruta/a/playwright node scripts/verify-tv-playback.mjs` desde la raíz prueba el TV web en `localhost:3100` con API simulada: audio bloqueado no debe impedir el video, transición entre etapas y ausencia de un segundo decodificador cuando se usa el puente Android.
