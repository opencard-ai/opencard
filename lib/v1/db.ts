/**
 * Minimal DB abstraction for /api/v1 (Verify-to-Access).
 * Production: node-postgres Pool over V1_DATABASE_URL (any Postgres: Neon, Supabase, RDS, local).
 * Tests: inject an in-process PGlite instance via setV1DbForTesting().
 */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface V1Db extends Queryable {
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

export class DbUnavailableError extends Error {
  constructor() {
    super("v1 database is not configured");
    this.name = "DbUnavailableError";
  }
}

let injected: V1Db | null = null;
let pooled: V1Db | null = null;

export function setV1DbForTesting(db: V1Db | null): void {
  injected = db;
}

async function createPgDb(url: string): Promise<V1Db> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: url, max: 5 });
  return {
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    async transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx: Queryable = {
          async query<R>(sql: string, params: unknown[] = []) {
            const r = await client.query(sql, params);
            return { rows: r.rows as R[] };
          },
        };
        const out = await fn(tx);
        await client.query("COMMIT");
        return out;
      } catch (err) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export async function getV1Db(): Promise<V1Db> {
  if (injected) return injected;
  if (pooled) return pooled;
  const url = process.env.V1_DATABASE_URL;
  if (!url) throw new DbUnavailableError();
  pooled = await createPgDb(url);
  return pooled;
}
