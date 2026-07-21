# Express PostgreSQL API

Step 3 adds a PostgreSQL-backed Express API under `/api/v2`. The existing React data adapter is intentionally not connected to it yet.

## Activation

The API is mounted when `DATABASE_URL` is configured. Without it, `/api/v2/*` returns HTTP 503 with `DATABASE_NOT_CONFIGURED`. The server honors `PORT` and defaults to `3000`.

Production write requests require:

```text
x-admin-token: <API_ADMIN_TOKEN>
```

If `API_ADMIN_TOKEN` is missing in production, writes are disabled. Read endpoints remain available. This temporary token boundary will eventually be replaced or supplemented by the application authentication/authorization layer.

## Reference and system endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/v2/health` | Database and migration health |
| GET | `/api/v2/bootstrap` | All active reference data and position taxonomy in one startup payload |
| GET | `/api/v2/reference-data` | Reference groups and values |
| GET | `/api/v2/reference-data/:groupCode` | One reference group |
| POST/PATCH/DELETE | `/api/v2/reference-data/:groupCode/values/...` | Create, edit, or soft-disable an option |
| GET/POST/PATCH/DELETE | `/api/v2/taxonomy/...` | Manage expert-position taxonomy |
| GET | `/api/v2/stats` | Dashboard totals and average match rate |

Reference values can be submitted using either their stable code or displayed label. Education aliases such as `Bachelor's Degree` and `Master's Degree` resolve to the canonical database values without creating duplicate dropdown entries.

## Application data endpoints

| Resource | Supported operations |
| --- | --- |
| Experts | list, get, bulk save/update, update, delete |
| Tenders | list, get, create, update, delete |
| Tender documents | list, attach metadata, delete; multiple documents per tender |
| Matches | list/filter, transactional bulk save, update, delete |
| Generated CVs | list, create, update, delete |
| Branding profiles | list, create, update, delete |
| Users | list, create, update, delete |
| Activity logs | list |
| Settings | get and upsert |
| User preferences | get and upsert |
| Jobs | create and get |

The API maps PostgreSQL records back to the existing frontend object shapes while retaining full nested data in `JSONB`.

## Validation and errors

- Write bodies are type-checked at the HTTP boundary.
- Reference codes are validated against active database values.
- Bulk expert and match writes use transactions.
- Duplicate unique records return HTTP 409.
- Missing records return HTTP 404.
- API errors use a stable `{ "error": { "code", "message" } }` envelope.
- Secret settings are never returned directly; reads report only that a value is configured.

## File boundary

Tender-document endpoints currently store file metadata and external storage keys. They do not place binary files in PostgreSQL. The existing `/api/upload` disk route has not been changed in Step 3. Before DigitalOcean deployment, binary uploads will be moved to object storage so the application has no dependency on ephemeral local disk.

## Verification

Validated on 2026-07-20 using PostgreSQL 18.3:

- health and bootstrap through the real Express server mount;
- production write authorization (403 without the token, success with it);
- expert create/read;
- tender create/read;
- two documents attached to one tender;
- match create/read;
- generated CV create/read;
- branding create/read;
- user create/read;
- settings and preferences round-trips;
- dashboard statistics;
- strict TypeScript check and production build.

Run the integration suite against a migrated non-production database:

```text
npm.cmd run db:test-api
```

The suite writes test records and must not be pointed at production.
