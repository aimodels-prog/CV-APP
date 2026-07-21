import pg from "pg";

const { Pool } = pg;

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required. Copy .env.example to .env and set a PostgreSQL connection string.",
    );
  }
  return connectionString;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function createPostgresPool(): pg.Pool {
  const sslOverride = process.env.DATABASE_SSL?.trim().toLowerCase();
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !==
    "false";

  return new Pool({
    connectionString: requireDatabaseUrl(),
    max: parsePositiveInteger(process.env.DATABASE_POOL_MAX, 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(sslOverride === "true"
      ? { ssl: { rejectUnauthorized } }
      : sslOverride === "false"
        ? { ssl: false }
        : {}),
  });
}
