# Goal: Migrar esquema SQLite a PostgreSQL y actualizar la conexión en server.js

## User Review Required
> [!IMPORTANT]
> Se necesita confirmar que la aplicación usa directamente `pg` para consultas o que existen módulos que ya usan `sqlite3`. El plan asume que sólo hay que crear una pool de PostgreSQL en `server.js` y que los controladores usarán `pool.query`.

## Proposed Changes
---
### [MODIFY] schema.sql
- Adaptar tipos a PostgreSQL (`SERIAL`, `TIMESTAMP`, `BOOLEAN`, `NUMERIC`)
- Eliminar `AUTOINCREMENT` y usar `SERIAL PRIMARY KEY`
- Cambiar `DATETIME` a `TIMESTAMP`
- Cambiar `DECIMAL` a `NUMERIC`
- Mantener la estructura y constraints.

### [MODIFY] server.js
- Añadir dependencia `pg` y crear `Pool` usando `process.env.DATABASE_URL`.
- Exportar `pool` para que los controladores lo importen.
- Mantener los middlewares y rutas existentes.
- Eliminar cualquier referencia a archivos `.sqlite` (no presente en este archivo).

## Open Questions
- ¿Los controladores (`entidadesController.js`, etc.) ya están preparados para usar `pool.query` o necesitan ajustes adicionales?
- ¿Se requiere instalar la dependencia `pg` ahora (`npm install pg`)?

## Verification Plan
### Automated Tests
- Ejecutar `npm run lint` para asegurar que no haya errores de sintaxis.
- Probar conexión a la base con `node -e "require('./backend/server')"`.

### Manual Verification
- Verificar que la aplicación arranca sin errores y que la variable `DATABASE_URL` es leída correctamente.
- Probar una ruta API que haga una consulta simple a la base.
