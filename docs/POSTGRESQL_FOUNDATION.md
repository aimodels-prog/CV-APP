# PostgreSQL Foundation

This is the isolated database foundation created in migration Step 2. The existing frontend remains connected to its current browser-backed API until a later controlled cutover.

## Configuration

Set these server-side environment variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
DATABASE_POOL_MAX=10
```

For local PostgreSQL, leave `DATABASE_SSL` empty. A DigitalOcean connection string normally includes `sslmode=require`. Explicit `DATABASE_SSL` overrides are available when a target environment requires them.

`DATABASE_URL` must never be exposed through Vite or added to a `VITE_*` variable.

## Commands

Apply all pending migrations:

```text
npm.cmd run db:migrate
```

Verify connectivity, migration count, and seeded reference-data counts:

```text
npm.cmd run db:check
```

The migration runner:

- applies `db/migrations/*.sql` in filename order;
- wraps each migration in a transaction;
- uses a PostgreSQL advisory lock to prevent two application instances migrating simultaneously;
- records a SHA-256 checksum and refuses to run if an applied migration was edited.

## Initial schema

The initial PostgreSQL schema includes:

- experts;
- tenders and multiple tender documents;
- matches;
- generated CVs;
- brandings;
- users and preferences;
- activity logs;
- settings;
- ingestion drafts;
- jobs;
- external file metadata;
- reference-data groups and values;
- expert position taxonomy.

Core records retain a `JSONB data` column to preserve all existing nested and unknown fields during browser-data import. Commonly queried values also have relational columns and indexes.

Relationships on imported match/CV records are deliberately indexed but not yet constrained by foreign keys because the current browser store can contain legacy orphan references. This prevents data loss during import. Constraints can be added after reconciliation.

## Reference data

Migration `002_seed_reference_data.sql` seeds the values currently hardcoded in the frontend:

- expert types;
- education levels;
- tender statuses and formats;
- CV generation modes;
- translation languages;
- user roles and statuses;
- application modules;
- page sizes;
- match sorting;
- risk levels;
- current expert-position taxonomy.

Submission types have a database-owned group but no invented defaults. Administrators can populate it when the actual accepted business values are confirmed.

## Validation result

Validated on 2026-07-20 against an isolated PostgreSQL 18.3 database:

- both migrations applied successfully;
- a second migration run correctly skipped both already-applied files;
- 17 public tables were created;
- 13 reference groups were created;
- 52 active reference values were seeded;
- 23 active expert positions were seeded;
- strict TypeScript checking passed;
- the production build passed with the same pre-existing bundle/import warnings recorded in the migration baseline.

The temporary validation database was stopped and removed after testing. The installed local PostgreSQL service was not modified because its password is not stored in this project. Apply the migrations to the permanent database after placing its real connection string in `DATABASE_URL`.
