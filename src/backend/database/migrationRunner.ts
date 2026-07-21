import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";

const MIGRATION_LOCK_ID = 8_614_207_026;

function checksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export async function runPostgresMigrations(pool: Pool): Promise<void> {
  const migrationsDirectory = path.join(process.cwd(), "db", "migrations");
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((filename) => /^\d+_.+\.sql$/.test(filename))
    .sort((a, b) => a.localeCompare(b));

  if (migrationFiles.length === 0) {
    throw new Error(`No SQL migrations found in ${migrationsDirectory}`);
  }

  const client = await pool.connect();

  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version TEXT PRIMARY KEY,
        checksum TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const filename of migrationFiles) {
      const filePath = path.join(migrationsDirectory, filename);
      const sql = await readFile(filePath, "utf8");
      const fileChecksum = checksum(sql);
      const existing = await client.query<{
        version: string;
        checksum: string;
      }>(
        "SELECT version, checksum FROM schema_migrations WHERE version = $1",
        [filename],
      );

      if (existing.rowCount) {
        if (existing.rows[0].checksum !== fileChecksum) {
          throw new Error(
            `Migration ${filename} was modified after it was applied. Create a new migration instead.`,
          );
        }
        console.log(`Already applied: ${filename}`);
        continue;
      }

      console.log(`Applying: ${filename}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
          [filename, fileChecksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("PostgreSQL migrations are up to date.");
  } finally {
    await client
      .query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
      .catch(() => undefined);
    client.release();
  }
}
