import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { makeTestDb, seedFixtures } from "./v1-harness";
import type { PGlite } from "@electric-sql/pglite";
import type { V1Db } from "@/lib/v1/db";
import { pickTasks, permittedSources } from "@/lib/v1/tasks";
import { v1Config } from "@/lib/v1/config";
import { ingestTask } from "@/lib/v1-settle/task-ingest";
import { settle, answersMatch } from "@/lib/v1-settle/scoring";
import { getBalances } from "@/lib/v1/credits";
import { networkGroup } from "@/lib/v1/network";
import { evidenceConcerns } from "@/lib/v1/verify-validate";
import { v1Headers } from "@/lib/v1/http";

describe("Phase 1 dispatch, frozen consensus and immutable settlement", () => {
  let pg: PGlite, db: V1Db;
  before(async () => {
    ({ pg, db } = await makeTestDb());
    await seedFixtures(pg);
    for (let i = 0; i < 6; i++) await pg.query(
      `INSERT INTO agents (agent_id, api_key_prefix, api_key_hash, agent_name, score) VALUES ($1,$1,'fake',$1,$2)`, [`a${i}`, i === 2 ? 5 : 1]);
  });
  after(async () => { await pg.close(); });

  it("samples gold separately and supplies complete blind tasks without exposing internal metadata", async () => {
    const tasks = await db.transaction((tx) => pickTasks(tx, "a0", 1, () => 0));
    assert.equal(tasks.length, 1);
    const t = tasks[0];
    assert.equal(t.task_id, "t_fake_fee_d");
    assert.equal(t.current_value, null);
    assert.equal(t.blind, true);
    assert.deepEqual(t.allowed_sources, ["https://issuer-alpha.example.com/cards/fake-card-delta"]);
    assert.ok(t.response_schema.annual_fee);
    assert.equal(t.evidence_required.length, 4);
    assert.ok(Date.parse(t.expires_at) > Date.now());
    assert.ok(!JSON.stringify(t).includes("777123"));
    assert.ok(!JSON.stringify(t).includes("is_gold"));
    const regular = await db.transaction((tx) => pickTasks(tx, "a0", 1, () => 0.99));
    assert.equal(regular[0].type, "link_check", "probation prefers a link task");
    const repeated = await db.transaction((tx) => pickTasks(tx, "a0", 1, () => 0));
    assert.equal(repeated.length, 0, "do not reissue an active assignment");
  });

  it("reserves at most three seats, and expires/reassigns abandoned seats", async () => {
    for (const a of ["a1", "a2"]) assert.equal((await db.transaction((tx) => pickTasks(tx, a, 1, () => 0))).length, 1);
    assert.equal((await db.transaction((tx) => pickTasks(tx, "a3", 1, () => 0))).length, 0);
    await pg.query(`UPDATE task_assignments SET expires_at = now() - interval '1 minute' WHERE agent_id = 'a1'`);
    assert.equal((await db.transaction((tx) => pickTasks(tx, "a3", 1, () => 0))).length, 1);
  });

  it("honeypot policy is confined to the frozen 10–20% range", () => {
    for (const [raw, expected] of [["10", 10], ["20", 20], ["9", 15], ["21", 15], ["bad", 15]] as const) {
      process.env.V1_HONEYPOT_PERCENT = raw;
      assert.equal(v1Config.honeypotPercent(), expected);
    }
    delete process.env.V1_HONEYPOT_PERCENT;
  });

  it("requires official, dispatchable, field-appropriate and task-specific evidence sources", () => {
    const rule = { pattern: "https://issuer.example/cards/**", kind: "official", dispatchable: true, fields: ["annual_fee"] };
    assert.equal(permittedSources(["https://issuer.example/cards/a"], "welcome_offer", [rule]).length, 0);
    assert.equal(permittedSources(["https://issuer.example.evil/cards/a"], "annual_fee", [rule]).length, 0);
    assert.equal(permittedSources(["https://issuer.example/cards/a"], "annual_fee", [{ ...rule, kind: "third_party" }]).length, 0);
    assert.equal(permittedSources(["https://issuer.example/cards/a"], "annual_fee", [{ ...rule, dispatchable: false }]).length, 0);
  });

  it("imports pipeline signals idempotently and refuses non-approved sources", async () => {
    const signal = { card_id: "fake-ingest", field: "annual_fee", type: "fee_check" as const, origin: "db-audit", blind: true,
      current_value: { annual_fee: 95, first_year_waived: false }, allowed_sources: ["https://issuer-alpha.example.com/cards/fake-ingest"] };
    assert.equal(await ingestTask(db, signal), true);
    assert.equal(await ingestTask(db, signal), false);
    const stored = (await pg.query<{ current_value: { annual_fee: number } }>(`SELECT current_value FROM tasks WHERE card_id = 'fake-ingest'`)).rows[0];
    assert.equal(stored.current_value.annual_fee, 95, "blind current value remains private for comparison");
    assert.equal(await ingestTask(db, { ...signal, card_id: "blocked-ingest", allowed_sources: ["https://blocked.example.com/x"] }), false);
    await assert.rejects(ingestTask(db, { ...signal, field: "foreign_transaction_fee" }));
  });

  const quorum = async (id: string, fees: number[], weights: number[]) => {
    await pg.query(`INSERT INTO tasks (task_id,card_id,field,type,instructions_code,origin,expires_at,state)
      VALUES ($1,'fake','annual_fee','fee_check','READ_ANNUAL_FEE_FROM_PUBLIC_OFFICIAL_PAGE','manual',now()+interval '1 hour','quorum')`, [id]);
    for (let i = 0; i < fees.length; i++) {
      const vote = `${id}-v${i}`;
      await pg.query(`INSERT INTO votes (vote_id,task_id,agent_id,result,weight) VALUES ($1,$2,$3,$4::jsonb,$5)`,
        [vote, id, `a${i}`, JSON.stringify({ status: "verified", result: { annual_fee: fees[i], first_year_waived: false }, evidence: { excerpt: `Fee $${fees[i]}` } }), weights[i]]);
      await pg.query(`INSERT INTO credit_ledger (entry_id,agent_id,delta,reason,ref_id,state) VALUES ($1,$2,1,'task_reward',$3,'provisional')`, [vote, `a${i}`, vote]);
    }
  };

  it("a high reputation minority outweighs two low weights; snapshots survive later score changes", async () => {
    await quorum("weighted", [95, 95, 100], [1, 1, 5]);
    await pg.query(`UPDATE agents SET score = 0 WHERE agent_id = 'a2'`);
    const s = await settle(db);
    assert.equal(s.agreed, 1);
    assert.equal(s.disagreed, 2);
    const suggestions = (await pg.query<{ suggested_value: { annual_fee: number }; support: { confidence: number; evidence: unknown[] } }>(`SELECT * FROM consensus_suggestions WHERE task_id = 'weighted'`)).rows;
    assert.equal(suggestions[0].suggested_value.annual_fee, 100);
    assert.equal(suggestions[0].support.confidence, 5 / 7);
    assert.equal(suggestions[0].support.evidence.length, 1);
    const count = (await pg.query(`SELECT * FROM credit_ledger`)).rows.length;
    assert.equal((await settle(db)).settled_tasks, 0);
    assert.equal((await pg.query(`SELECT * FROM credit_ledger`)).rows.length, count, "settlement retry is idempotent");
    assert.equal((await getBalances(db, "a0")).pending, 0);
    await assert.rejects(pg.query(`UPDATE credit_ledger SET state = 'confirmed' WHERE state = 'provisional'`), /append-only/);
  });

  it("keeps agreement with the current value as confirmation rather than a change suggestion", async () => {
    await quorum("unchanged", [95, 95, 95], [1, 1, 1]);
    await pg.query(`UPDATE tasks SET current_value = '{"annual_fee":95,"first_year_waived":false}'::jsonb WHERE task_id = 'unchanged'`);
    assert.equal((await settle(db)).suggestions, 0);
    assert.equal((await pg.query(`SELECT * FROM consensus_suggestions WHERE task_id = 'unchanged'`)).rows.length, 0);
    assert.equal((await pg.query<{ state: string }>(`SELECT state FROM tasks WHERE task_id = 'unchanged'`)).rows[0].state, "settled");
  });

  it("splits and zero total weights dispute without leaving pending credits", async () => {
    await quorum("split", [1, 2, 3], [1, 1, 1]);
    await quorum("zero", [1, 1, 1], [0, 0, 0]);
    assert.equal((await settle(db)).disputed_tasks, 2);
    assert.equal((await pg.query(`SELECT * FROM consensus_suggestions WHERE task_id IN ('split','zero')`)).rows.length, 0);
    assert.equal((await getBalances(db, "a0")).pending, 0);
  });

  it("requires exactly three votes and a confidence strictly above the configured threshold", async () => {
    await quorum("short", [1, 1], [1, 1]);
    assert.equal((await settle(db)).settled_tasks, 0);
    await quorum("threshold", [1, 1, 2], [1, 1, 1]);
    process.env.V1_CONFIDENCE_PERCENT = "80";
    try { assert.equal((await settle(db)).disputed_tasks, 1); }
    finally { delete process.env.V1_CONFIDENCE_PERCENT; }
  });

  it("numeric tolerance is configurable and does not merge differing categorical answers", () => {
    const a = { annual_fee: 95, first_year_waived: false };
    assert.equal(answersMatch("fee_check", a, { ...a, annual_fee: 96 }), false);
    process.env.V1_NUMERIC_TOLERANCE = "1";
    try {
      assert.equal(answersMatch("fee_check", a, { ...a, annual_fee: 96 }), true);
      assert.equal(answersMatch("fee_check", a, { ...a, first_year_waived: true }), false);
    } finally { delete process.env.V1_NUMERIC_TOLERANCE; }
  });

  it("records missing numeric evidence as an audit concern without inventing a truth verdict", () => {
    assert.deepEqual(evidenceConcerns("fee_check", { annual_fee: 95 }, "Annual fee $95"), []);
    assert.deepEqual(evidenceConcerns("fee_check", { annual_fee: 95 }, "Annual fee $0"), ["excerpt_missing_annual_fee"]);
    assert.deepEqual(evidenceConcerns("welcome_offer_check", { bonus_amount: 60000, spending_requirement: 4000, time_period_months: 3 },
      "Earn 60,000 points after $4,000 in 3 months"), []);
  });

  it("groups network ranges consistently without retaining addresses", () => {
    assert.equal(networkGroup("10.0.1.2"), networkGroup("10.0.1.99"));
    assert.notEqual(networkGroup("10.0.1.2"), networkGroup("10.0.2.2"));
    assert.equal(networkGroup("2001:db8::1"), networkGroup("2001:0db8:0000:0000::2"));
    assert.equal(networkGroup("unknown"), null);
    assert.equal(networkGroup("10.0.1.2")?.length, 64);
  });

  it("sets every frozen response header even before authentication", () => {
    const h = v1Headers({});
    for (const key of ["X-Credits-Balance", "X-Credits-Pending", "X-Credits-Cost", "X-Reputation-Tier", "X-Tasks-Attached", "X-RateLimit-Remaining", "X-RateLimit-Reset"]) assert.ok(h.has(key), key);
    assert.ok(Number.isFinite(Date.parse(h.get("X-RateLimit-Reset")!)));
  });
});
