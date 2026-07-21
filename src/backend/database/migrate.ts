import dotenv from "dotenv";
import { runPostgresMigrations } from "./migrationRunner.ts";
import { createPostgresPool } from "./postgres.ts";

dotenv.config();

async function runMigrations() {
  const pool = createPostgresPool();
  try {
    await runPostgresMigrations(pool);
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error) => {
  console.error("PostgreSQL migration failed:", error);
  process.exitCode = 1;
});
