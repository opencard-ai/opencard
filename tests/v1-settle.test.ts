import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { setV1DbForTesting, type V1Db } from "@/lib/v1/db";
import { resetV1RateLimitForTesting } from "@/lib/v1/rate-limit";
import { POST as registerAgent } from "@/app/api/v1/agents/route";
import { POST as postVerify } from "@/app/api/v1/verify/route";
import { urlMatchesWhitelist } from "@/lib/v1/verify-validate";
import { settle, normalizeLinkUrl, matchesGold } from "@/lib/v1-settle/scoring";
import { makeTestDb, seedFixtures, evidence } from "./v1-harness";
import type { PGlite } from "@electric-sql/pglite";

const INVITE = "fake-invite-settle";
const BASE = "http://localhost/api/v1";
let n = 0;
async function newAgent(): Promise<{ key: string; id: string }> {
  const r = await registerAgent(new Request(`${BASE}/agents`, {
    method: "POST", headers: { "content-type": "application/json", "x-invite-code": INVITE, "x-forwarded-for": `10.9.0.${++n}` },
    body: JSON.stringify({ agent_name: `settle-${n}` }),
  }));
  const b = await r.json();
  return { key: b.api_key, id: b.agent_id };
}
const verify = (key: string, body: unknown) =>
  postVerify(new Request(`${BASE}/verify`, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body) }));
const fee = (task: string, annual_fee: number, url = "https://issuer-alpha.example.com/cards/fake-card-delta") =>
  ({ task_id: task, status: "verified", result: { annual_fee, first_year_waived: false }, evidence: evidence(url) });

describe("v1 whitelist globs, evidence policy and offline settlement", () => {
  let db: V1Db; let pg: PGlite;
  before(async () => {
    ({ db, pg } = await makeTestDb());
    await seedFixtures(pg);
    setV1DbForTesting(db);
    process.env.V1_API_ENABLED = "true";
    process.env.V1_INVITE_CODES = INVITE;
    process.env.V1_REGISTER_LIMIT_PER_HOUR = "1000";
    resetV1RateLimitForTesting();
  });
  after(() => setV1DbForTesting(null));

  it("glob patterns: ** spans paths, * is one segment, query/fragment ignored", () => {
    assert.ok(urlMatchesWhitelist("https://www.americanexpress.com/us/credit-cards/card/gold/?q=1#x", ["https://www.americanexpress.com/us/credit-cards/card/**"]));
    assert.ok(urlMatchesWhitelist("https://www.americanexpress.com/us/apply/x", ["https://www.americanexpress.com/*/apply/**"]));
    assert.ok(!urlMatchesWhitelist("https://www.americanexpress.com/us/x/apply/y", ["https://www.americanexpress.com/*/apply/**"]));
    assert.ok(!urlMatchesWhitelist("https://evil.example/https://www.americanexpress.com/us/credit-cards/card/x", ["https://www.americanexpress.com/us/credit-cards/card/**"]));
  });

  it("link_check normalisation: host+path, no query/fragment, trailing slash and scheme insensitive", () => {
    assert.equal(normalizeLinkUrl("https://A.example.com/p/?x=1#f"), normalizeLinkUrl("http://a.example.com/p"));
    assert.ok(matchesGold("link_check", { http_status: 200, final_url: "https://a.example.com/p/?utm=1", is_official_redirect: false },
      { http_status: 200, final_url: "https://a.example.com/p", is_official_redirect: false }));
    assert.ok(!matchesGold("link_check", { http_status: 301, final_url: "https://a.example.com/p", is_official_redirect: false },
      { http_status: 200, final_url: "https://a.example.com/p", is_official_redirect: false }));
  });

  it("rejects evidence from non-dispatchable sources and Amex excerpts over 200 chars", async () => {
    const a = await newAgent();
    const r = await verify(a.key, fee("t_fake_fee_a", 95, "https://blocked.example.com/cards/x"));
    assert.equal(r.status, 422);
    assert.equal((await r.json()).error, "evidence_source_not_allowed");
    const long = { ...fee("t_fake_fee_a", 95, "https://www.americanexpress.com/us/credit-cards/card/x/"), };
    long.evidence.excerpt = "x".repeat(201);
    const r2 = await verify(a.key, long);
    assert.equal(r2.status, 422);
    assert.deepEqual((await r2.json()).fields, ["evidence.excerpt"]);
    long.evidence.excerpt = "x".repeat(200);
    assert.equal((await verify(a.key, long)).status, 202);
    const { rows } = await pg.query<{ snapshot_ref: string | null }>(`SELECT snapshot_ref FROM votes WHERE agent_id = $1`, [a.id]);
    assert.equal(rows[0].snapshot_ref, null);
  });

  it("gold grading: right vote confirms reward, wrong vote is clawed back; tiers move", async () => {
    const good = await newAgent(); const bad = await newAgent();
    assert.equal((await verify(good.key, fee("t_fake_fee_d", 7123))).status, 202); // fixture gold: 777123 % 10000 is not the gold value
    assert.equal((await verify(bad.key, fee("t_fake_fee_d", 1))).status, 202);
    // Make the fixture gold comparable (fixture carries an extra marker key that canonical() ignores).
    await pg.query(`UPDATE task_gold_answers SET gold_answer = jsonb_set(gold_answer, '{annual_fee}', '7123') WHERE task_id = 't_fake_fee_d'`);
    const s = await settle(db);
    assert.ok(s.gold_pass >= 1 && s.gold_fail >= 1);
    const led = async (id: string) => (await pg.query<{ reason: string; delta: number; state: string }>(
      `SELECT reason, delta, state FROM credit_ledger WHERE agent_id = $1 AND reason IN ('task_reward','clawback') ORDER BY created_at`, [id])).rows;
    assert.deepEqual((await led(good.id)).map((r) => [r.reason, r.delta, r.state]), [["task_reward", 1, "confirmed"]]);
    assert.deepEqual((await led(bad.id)).map((r) => [r.reason, r.delta, r.state]), [["task_reward", 1, "confirmed"], ["clawback", -1, "confirmed"]]);
    const ag = async (id: string) => (await pg.query<{ tier: string; gold_accuracy: string }>(`SELECT tier, gold_accuracy FROM agents WHERE agent_id = $1`, [id])).rows[0];
    assert.equal(Number((await ag(good.id)).gold_accuracy), 1);
    assert.equal(Number((await ag(bad.id)).gold_accuracy), 0);
    assert.equal((await ag(bad.id)).tier, "probation", "one miss is below restrict_min_gold");
    // Simulate more graded history and re-evaluate tiers through settle.
    await pg.query(`INSERT INTO v1_scoring_config (key, value) VALUES ('tiers', '{"standard_min_gold":1,"restrict_min_gold":1}'::jsonb)`);
    await pg.query(`UPDATE task_gold_answers SET gold_answer = jsonb_set(gold_answer, '{annual_fee}', '1') WHERE task_id = 't_fake_fee_d'`);
    await pg.query(`UPDATE tasks SET state = 'open' WHERE task_id = 't_fake_fee_d'`);
    const c = await newAgent();
    await verify(c.key, fee("t_fake_fee_d", 1));
    await settle(db);
    assert.equal((await ag(c.id)).tier, "standard");
    await pg.query(`UPDATE tasks SET state = 'open' WHERE task_id = 't_fake_fee_d'`);
    const d = await newAgent();
    assert.equal((await verify(d.key, fee("t_fake_fee_d", 2))).status, 202);
    await settle(db);
    assert.equal((await ag(d.id)).tier, "restricted");
  });

  it("consensus: weighted majority settles credits and writes only consensus_suggestions", async () => {
    const ev = "https://issuer-alpha.example.com/cards/fake-card-gamma";
    const offer = (bonus: number) => ({ task_id: "t_fake_offer_c", status: "verified", evidence: evidence(ev),
      result: { bonus_amount: bonus, bonus_unit: "points", spending_requirement: 4000, time_period_months: 3 } });
    const a = [await newAgent(), await newAgent(), await newAgent()];
    await verify(a[0].key, offer(60000)); await verify(a[1].key, offer(60000)); await verify(a[2].key, offer(50000));
    const s = await settle(db);
    assert.equal(s.agreed, 2); assert.equal(s.disagreed, 1); assert.equal(s.suggestions, 1);
    const sug = (await pg.query<{ suggested_value: { bonus_amount: number }; support: { votes: number } }>(
      `SELECT suggested_value, support FROM consensus_suggestions WHERE task_id = 't_fake_offer_c'`)).rows;
    assert.equal(sug.length, 1); assert.equal(sug[0].suggested_value.bonus_amount, 60000); assert.equal(sug[0].support.votes, 2);
    assert.equal((await pg.query<{ state: string }>(`SELECT state FROM tasks WHERE task_id = 't_fake_offer_c'`)).rows[0].state, "settled");
    const claw = await pg.query(`SELECT 1 FROM credit_ledger WHERE agent_id = $1 AND reason = 'clawback'`, [a[2].id]);
    assert.equal(claw.rows.length, 1);
  });
});
