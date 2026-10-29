import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import type { V1Db, Queryable } from "@/lib/v1/db";

export const GOLD_SENTINEL = "GOLD_SENTINEL_9f2c71";
const root = path.join(__dirname, "..");

export async function makeTestDb(): Promise<{ db: V1Db; pg: PGlite }> {
  const pg = new PGlite();
  await pg.exec(readFileSync(path.join(root, "db/migrations/0001_verify_to_access.sql"), "utf8"));
  const wrap = (q: { query: PGlite["query"] }): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const r = await q.query(sql, params as never[]);
      return { rows: r.rows as T[] };
    },
  });
  const db: V1Db = {
    ...wrap(pg),
    transaction: (fn) => pg.transaction((tx) => fn(wrap(tx as unknown as { query: PGlite["query"] }))),
  };
  return { db, pg };
}

/** Seeds FAKE fixtures directly via SQL (the only place the gold table is written). */
export async function seedFixtures(pg: PGlite): Promise<void> {
  const wl = JSON.parse(readFileSync(path.join(root, "tests/fixtures/v1/sources-whitelist.fake.json"), "utf8"));
  for (const e of wl.entries) {
    await pg.query(`INSERT INTO sources_whitelist (pattern, issuer, kind, tos_notes) VALUES ($1,$2,$3,$4)`, [e.pattern, e.issuer, e.kind, e.tos_notes]);
  }
  const fx = JSON.parse(readFileSync(path.join(root, "tests/fixtures/v1/tasks.fake.json"), "utf8"));
  const insert = async (t: Record<string, unknown>, isGold: boolean) => {
    await pg.query(
      `INSERT INTO tasks (task_id, card_id, field, type, instructions_code, allowed_sources, current_value, blind, is_gold, origin, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10, now() + interval '7 days')`,
      [t.task_id, t.card_id, t.field, t.type, t.instructions_code, JSON.stringify(t.allowed_sources),
        t.current_value === null ? null : JSON.stringify(t.current_value), t.blind, isGold, t.origin],
    );
  };
  for (const t of fx.tasks) await insert(t, false);
  for (const g of fx.gold) {
    await insert(g, true);
    await pg.query(`INSERT INTO task_gold_answers (task_id, gold_answer) VALUES ($1, $2::jsonb)`, [g.task_id, JSON.stringify(g.gold_answer)]);
  }
}

export function evidence(url = "https://issuer-alpha.example.com/cards/fake-card-alpha") {
  return {
    url,
    retrieved_at: new Date().toISOString(),
    excerpt: "FAKE excerpt: Annual fee $95",
    content_hash: "sha256:" + "a".repeat(64),
  };
}
