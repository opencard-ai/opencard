/**
 * Apply db/migrations/*.sql to V1_DATABASE_URL (any Postgres). Idempotent; tracks applied files.
 * Usage: V1_DATABASE_URL=postgres://... npx tsx scripts/v1-migrate.ts
 * Never prints the connection string.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.V1_DATABASE_URL;
  if (!url) {
    console.error("V1_DATABASE_URL is not set");
    process.exit(1);
  }
  const dir = path.join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS v1_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ version: string }>(`SELECT version FROM v1_schema_migrations`)).rows.map((r) => r.version));
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query("BEGIN");
      await client.query(readFileSync(path.join(dir, f), "utf8"));
      await client.query(`INSERT INTO v1_schema_migrations (version) VALUES ($1)`, [f]);
      await client.query("COMMIT");
      console.log(`applied ${f}`);
    }
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    console.error(`migration failed: ${err instanceof Error ? err.name : "unknown"}`);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main();
