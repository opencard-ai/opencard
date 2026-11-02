import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { setV1DbForTesting, type V1Db } from "@/lib/v1/db";
import { resetV1RateLimitForTesting } from "@/lib/v1/rate-limit";
import { v1Config } from "@/lib/v1/config";
import { parseSubmission } from "@/lib/v1/verify-validate";
import { POST as registerAgent } from "@/app/api/v1/agents/route";
import { POST as postVerify } from "@/app/api/v1/verify/route";
import { settle } from "@/lib/v1-settle/scoring";
import { logFailure } from "@/lib/v1-settle/admin";
import { makeTestDb, seedFixtures, evidence, assignAll } from "./v1-harness";
import type { PGlite } from "@electric-sql/pglite";

const ROOT = path.join(__dirname, "..");
const INVITES = Array.from({ length: 20 }, (_, i) => `fake-invite-review-${i}`);
let n = 0;

describe("v1 review fixes: DB role, probation weight, expiry, excerpt limits, safe logging", () => {
  let db: V1Db; let pg: PGlite;
  before(async () => {
    ({ db, pg } = await makeTestDb());
    await seedFixtures(pg);
    setV1DbForTesting(db);
    process.env.V1_API_ENABLED = "true";
    process.env.V1_INVITE_CODES = INVITES.join(",");
    delete process.env.V1_MAX_EXCERPT_CHARS;
    resetV1RateLimitForTesting();
  });
  after(() => setV1DbForTesting(null));

  const newAgent = async () => {
    const r = await registerAgent(new Request("http://localhost/api/v1/agents", {
      method: "POST", headers: { "content-type": "application/json", "x-invite-code": INVITES[n], "x-forwarded-for": `10.8.0.${++n}` },
      body: JSON.stringify({ agent_name: `review-${n}` }),
    }));
    return (await r.json()) as { api_key: string; agent_id: string };
  };

  it("API role opencard_api cannot read gold/config/migrations, cannot TRUNCATE or DELETE, but can serve the API", async () => {
    await pg.exec(`CREATE TABLE IF NOT EXISTS v1_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    await pg.exec(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'opencard_api') THEN CREATE ROLE opencard_api NOLOGIN; END IF; END $$;`);
    await pg.exec(readFileSync(path.join(ROOT, "db/roles/opencard_api_grants.sql"), "utf8"));
    await pg.exec(`SET ROLE opencard_api`);
    try {
      for (const t of ["task_gold_answers", "v1_scoring_config", "v1_schema_migrations", "consensus_suggestions"]) {
        await assert.rejects(pg.query(`SELECT * FROM ${t}`), /permission denied/, t);
      }
      await assert.rejects(pg.query(`TRUNCATE votes`), /permission denied/);
      await assert.rejects(pg.query(`DELETE FROM credit_ledger`), /permission denied/);
      await assert.rejects(pg.query(`UPDATE agents SET tier = 'trusted'`), /permission denied/);
      await assert.rejects(pg.query(`CREATE TABLE x_evil (a int)`), /permission denied/);
      await pg.query(`SELECT task_id, card_id FROM tasks LIMIT 1`);
      await pg.query(`SELECT pattern FROM sources_whitelist WHERE dispatchable LIMIT 1`);
      await pg.query(`SELECT agent_id FROM agents LIMIT 1 FOR UPDATE`);
      const rolsuper = await pg.query<{ owner: string }>(`SELECT tableowner AS owner FROM pg_tables WHERE tablename = 'tasks'`);
      assert.notEqual(rolsuper.rows[0].owner, "opencard_api");
    } finally {
      await pg.exec(`RESET ROLE`);
    }
  });

  it("probation agents vote at reduced weight", async () => {
    const a = await newAgent();
    await assignAll(pg);
    const r = await postVerify(new Request("http://localhost/api/v1/verify", {
      method: "POST", headers: { authorization: `Bearer ${a.api_key}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: "t_fake_fee_a", status: "verified", result: { annual_fee: 95, first_year_waived: false }, evidence: evidence() }),
    }));
    assert.equal(r.status, 202);
    const w = (await pg.query<{ weight: string }>(`SELECT weight FROM votes WHERE agent_id = $1`, [a.agent_id])).rows[0].weight;
    assert.equal(Number(w), (0.5 * v1Config.probationWeightPct()) / 100);
    assert.ok(Number(w) < 0.5);
  });

  it("settle expires overdue tasks and reverses their provisional rewards, per task", async () => {
    const a = await newAgent();
    await assignAll(pg);
    const r = await postVerify(new Request("http://localhost/api/v1/verify", {
      method: "POST", headers: { authorization: `Bearer ${a.api_key}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: "t_fake_offer_c", status: "verified", evidence: evidence("https://issuer-alpha.example.com/cards/fake-card-gamma"),
        result: { bonus_amount: 1, bonus_unit: "points", spending_requirement: 1, time_period_months: 1 } }),
    }));
    assert.equal(r.status, 202);
    await pg.query(`UPDATE tasks SET expires_at = now() - interval '1 minute' WHERE task_id = 't_fake_offer_c'`);
    const s = await settle(db);
    assert.ok(s.expired_tasks >= 1 && s.expired_votes >= 1);
    assert.equal((await pg.query<{ state: string }>(`SELECT state FROM tasks WHERE task_id = 't_fake_offer_c'`)).rows[0].state, "expired");
    assert.equal((await pg.query<{ outcome: string }>(`SELECT outcome FROM votes WHERE agent_id = $1`, [a.agent_id])).rows[0].outcome, "expired");
    const led = (await pg.query<{ reason: string; delta: number; state: string }>(
      `SELECT reason, delta, state FROM credit_ledger WHERE agent_id = $1 AND reason <> 'probation_grant' ORDER BY created_at`, [a.agent_id])).rows;
    assert.deepEqual(led.map((x) => [x.reason, x.delta, x.state]), [["task_reward", 1, "confirmed"], ["clawback", -1, "confirmed"]]);
    assert.equal((await pg.query(`SELECT 1 FROM credit_ledger WHERE state = 'provisional' AND ref_id IN (SELECT vote_id FROM votes WHERE task_id = 't_fake_offer_c')`)).rows.length, 0);
  });

  it("excerpt limit defaults to 300; Amex stays capped at 200", () => {
    const now = Date.now();
    const sub = (url: string, len: number) => parseSubmission({ task_id: "t1", status: "verified", result: {}, evidence: { ...evidence(url), excerpt: "x".repeat(len) } }, now);
    assert.equal(v1Config.maxExcerptChars(), 300);
    assert.equal(sub("https://issuer-alpha.example.com/cards/a", 300).ok, true);
    assert.equal(sub("https://issuer-alpha.example.com/cards/a", 301).ok, false);
    assert.equal(sub("https://www.americanexpress.com/us/credit-cards/card/x/", 200).ok, true);
    assert.equal(sub("https://www.americanexpress.com/us/credit-cards/card/x/", 201).ok, false);
  });

  it("offline scripts log only error name and code, never the message", () => {
    const lines: string[] = [];
    const orig = console.error;
    console.error = (...a: unknown[]) => { lines.push(a.map(String).join(" ")); };
    try {
      const e = Object.assign(new Error("postgres://user:SECRET@host/db gold_answer=42"), { code: "28P01" });
      logFailure("settle", e);
    } finally { console.error = orig; }
    assert.equal(lines[0], "settle failed: Error code=28P01");
    for (const f of ["scripts/v1-settle.ts", "scripts/v1-load-gold.ts", "scripts/v1-migrate.ts", "lib/v1-settle/scoring.ts"]) {
      assert.ok(!/\.message\b/.test(readFileSync(path.join(ROOT, f), "utf8")), f);
    }
  });
});
