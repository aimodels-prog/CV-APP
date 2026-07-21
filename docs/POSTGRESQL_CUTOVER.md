# Stage 6: PostgreSQL-only runtime

The application now has one persistence engine: PostgreSQL through the Express `/api/v2` API.

## Required configuration

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DATABASE
DATABASE_POOL_MAX=10
DATABASE_SSL_REJECT_UNAUTHORIZED=true
DATABASE_CA_CERT=<optional managed database CA certificate>
VITE_POSTGRES_API_BASE=/api/v2
```

`DATABASE_URL` is mandatory. Server startup fails when it is missing or PostgreSQL is unreachable. There is no browser-storage or SQLite fallback and no frontend engine switch.

## Start locally

1. Create the PostgreSQL database.
2. Copy `.env.example` to `.env` and set `DATABASE_URL`.
3. Run `npm.cmd run db:migrate`.
4. Run `npm.cmd run db:check`.
5. Run `npm.cmd run dev`.

## Data ownership

- Experts, tenders, matches, generated CVs, brandings, users and activity logs use normalized PostgreSQL tables plus JSONB payloads.
- Dropdown/reference values and the position taxonomy come from PostgreSQL reference tables.
- Application settings, profile preferences, module visibility, notification/deadline state and pending ingestion drafts use PostgreSQL settings.
- Uploaded document binaries require durable object storage for DigitalOcean deployment; the database stores their metadata/storage keys.

## Production safety

The server applies pending, checksum-verified migrations under a PostgreSQL advisory lock before it accepts requests. The standalone `npm run db:migrate` command remains available for controlled deployment workflows. On DigitalOcean App Platform, bind `DATABASE_URL` to `${database-component.DATABASE_PRIVATE_URL}`. The connector uses libpq-compatible `sslmode=require` when no CA is supplied. For full certificate verification on supported managed clusters, also bind `DATABASE_CA_CERT` to `${database-component.CA_CERT}`. Pages and APIs are protected by VIA Portal SSO; do not expose `PORTAL_SSO_SECRET` or the optional `API_ADMIN_TOKEN` in frontend Vite variables.

PostgreSQL backups must be managed server-side using DigitalOcean managed-database backups or `pg_dump`. Browser backup/import controls were removed from the runtime application.
