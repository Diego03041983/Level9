# Santiago Level 9 — Game Center

Centro de operaciones gamer para el cumpleaños de Santiago: check-in, competencias, misión secreta y presentación audiovisual para Smart TV.

Demo pública: [level9-nu.vercel.app](https://level9-nu.vercel.app)

## Inicio local

Requisitos: Node.js 20.9+, npm y Python 3. FFmpeg es opcional para regenerar MP3.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Con `NEXT_PUBLIC_DEMO_MODE=true` las interfaces pueden recorrerse sin credenciales. Para persistencia real, completá Supabase y aplicá las migraciones.

- `/admin`: consola operativa privada.
- `/checkin`: registro de jugadores.
- `/tv`: presentación audiovisual y activación de audio.
- `/mission`: terminal de código secreto.
- `/login`: acceso mediante Supabase Auth.

## Calidad y recursos

Ejecutá `npm run verify`. Para regenerar los 17 efectos originales: `npm run audio:generate`.

No se versionan claves privadas. `SUPABASE_SERVICE_ROLE_KEY` sólo puede utilizarse en servidor.

## Documentación

- [Plan](./PLAN.md)
- [Estado real](./STATUS.md)
- [Configuración Supabase](./docs/SUPABASE.md)
- [Despliegue](./docs/DEPLOYMENT.md)
- [Operación](./docs/OPERATIONS.md)
