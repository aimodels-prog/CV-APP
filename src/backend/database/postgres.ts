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
  const caCertificate = process.env.DATABASE_CA_CERT
    ?.replace(/\\n/g, "\n")
    .trim();
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !==
    "false";

  const ssl = caCertificate
    ? { ca: caCertificate, rejectUnauthorized }
    : sslOverride === "true"
      ? { rejectUnauthorized }
      : sslOverride === "false"
        ? false
        : undefined;

  return new Pool({
    connectionString: requireDatabaseUrl(),
    max: parsePositiveInteger(process.env.DATABASE_POOL_MAX, 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(ssl === undefined ? {} : { ssl }),
  });
}
