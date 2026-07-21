import dotenv from "dotenv";
import { createPostgresPool } from "./postgres.ts";

dotenv.config();

async function checkDatabase() {
  const pool = createPostgresPool();

  try {
    const database = await pool.query<{
      database_name: string;
      postgres_version: string;
    }>(`
      SELECT
        current_database() AS database_name,
        current_setting('server_version') AS postgres_version
    `);
    const migrations = await pool.query<{ count: string }>(
      "SELECT COUNT(*)::TEXT AS count FROM schema_migrations",
    );
    const referenceData = await pool.query<{
      groups: string;
      active_values: string;
      active_positions: string;
    }>(`
      SELECT
        (SELECT COUNT(*) FROM reference_groups)::TEXT AS groups,
        (SELECT COUNT(*) FROM reference_values WHERE is_active)::TEXT AS active_values,
        (SELECT COUNT(*) FROM position_taxonomy WHERE is_active)::TEXT AS active_positions
    `);

    console.log({
      ok: true,
      database: database.rows[0].database_name,
      postgresVersion: database.rows[0].postgres_version,
      appliedMigrations: Number(migrations.rows[0].count),
      referenceGroups: Number(referenceData.rows[0].groups),
      activeReferenceValues: Number(referenceData.rows[0].active_values),
      activePositions: Number(referenceData.rows[0].active_positions),
    });
  } finally {
    await pool.end();
  }
}

checkDatabase().catch((error) => {
  console.error("PostgreSQL check failed:", error);
  process.exitCode = 1;
});
