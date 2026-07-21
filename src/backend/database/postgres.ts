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

function useLibpqSslCompatibility(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

    if (sslMode === "require" && !url.searchParams.has("uselibpqcompat")) {
      url.searchParams.set("uselibpqcompat", "true");
      return url.toString();
    }
  } catch {
    // Let node-postgres report malformed connection strings consistently.
  }

  return connectionString;
}

export function createPostgresPool(): pg.Pool {
  const rawConnectionString = requireDatabaseUrl();
  const sslOverride = process.env.DATABASE_SSL?.trim().toLowerCase();
  const caCertificate = process.env.DATABASE_CA_CERT
    ?.replace(/\\n/g, "\n")
    .trim();
  const rejectUnauthorized =
    process.env.DATABASE_SSL_REJECT_UNAUTHORIZED?.trim().toLowerCase() !==
    "false";

  const connectionString = caCertificate
    ? rawConnectionString
    : useLibpqSslCompatibility(rawConnectionString);

  const ssl = caCertificate
    ? { ca: caCertificate, rejectUnauthorized }
    : sslOverride === "false"
      ? false
      : undefined;

  return new Pool({
    connectionString,
    max: parsePositiveInteger(process.env.DATABASE_POOL_MAX, 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...(ssl === undefined ? {} : { ssl }),
  });
}
