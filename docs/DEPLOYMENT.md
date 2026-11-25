# Despliegue

1. Crear Supabase y aplicar las migraciones; usar el seed sólo en demo.
2. Importar el repositorio en Vercel sin habilitar servicios pagos.
3. Configurar `.env.example`, con `NEXT_PUBLIC_DEMO_MODE=false`.
4. Registrar la URL HTTPS de producción en Supabase Auth.
5. Ejecutar `npm run verify` y probar RLS antes de promover.

No se creó ningún servicio externo ni URL pública porque no se proporcionaron credenciales.

