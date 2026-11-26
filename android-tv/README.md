# Level 9 TV para Android TV

Aplicación nativa liviana para televisores Android TV 6.0 o superior. Abre el reproductor de producción en pantalla completa, conserva la vinculación y permite que los videos y audios se reproduzcan desde la web publicada.

## Uso en el televisor

1. Instalá `level9-tv.apk`.
2. Abrí **Level 9 TV**.
3. En la computadora, abrí Administración y presioná **Vincular Smart TV**.
4. Escribí en la app el código de 10 caracteres que aparece en Administración.
5. Presioná **Habilitar audio e iniciar** una vez.

La tecla **Menú** del control remoto vuelve a abrir la carga del código de vinculación.

## Compilación

```bash
./gradlew :app:assembleRelease
```

El APK se genera en `app/build/outputs/apk/release/app-release.apk`. La compilación local usa la clave Android existente en `~/.android/debug.keystore` para conservar la misma firma entre actualizaciones instaladas desde esta computadora.
