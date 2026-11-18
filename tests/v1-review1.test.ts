import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { makeTestDb, evidence, assignAll } from "./v1-harness";
import type { V1Db } from "@/lib/v1/db";
import { setV1DbForTesting } from "@/lib/v1/db";
import type { PGlite } from "@electric-sql/pglite";
import { loadGold } from "@/lib/v1-settle/gold-loader";
import { ingestTask } from "@/lib/v1-settle/task-ingest";
import { settle } from "@/lib/v1-settle/scoring";
import { generateApiKey, newId } from "@/lib/v1/keys";
import { pickTasks } from "@/lib/v1/tasks";
import { v1Config } from "@/lib/v1/config";
import { POST as verify } from "@/app/api/v1/verify/route";
import { GET as me } from "@/app/api/v1/agents/me/route";

const wl = { entries: [{ pattern: "https://issuer.example/cards/**", issuer: "Synthetic", kind: "official", fields: ["annual_fee", "sources[].url"], dispatchable: true }] };
const answer = { annual_fee: 95, first_year_waived: false };

describe("review 1 regression coverage", () => {
  let db: V1Db, pg: PGlite;
  before(async () => {
    ({ db, pg } = await makeTestDb());
    await loadGold(db, { rules: [], items: [] }, wl);
    setV1DbForTesting(db);
    process.env.V1_API_ENABLED = "true";
  });
  after(async () => { setV1DbForTesting(null); delete process.env.V1_API_ENABLED; await pg.close(); });

  const agent = async (score = 0.5) => {
    const id = newId("ag"), key = generateApiKey();
    await pg.query(`INSERT INTO agents (agent_id,api_key_prefix,api_key_hash,agent_name,score) VALUES ($1,$2,$3,'Synthetic',$4)`, [id, key.lookup, key.hash, score]);
    return { id, key: key.plaintext };
  };
  const taskPair = async (blind: boolean) => {
    const card = newId("card").replaceAll("_", "-");
    const source = `https://issuer.example/cards/${card}`;
    const sources = [source, `${source}/terms`];
    await ingestTask(db, { card_id: card, field: "annual_fee", type: "fee_check", origin: "weekly", blind, current_value: answer, allowed_sources: sources });
    const input = { rules: [], items: [{ gold_id: newId("gold"), card_id: card, field: "annual_fee", type: "fee_check", gold_answer: answer, source_url: source }] };
    assert.equal((await loadGold(db, input, wl)).gold_created, 1);
    const rows = (await pg.query<{ task_id: string; is_gold: boolean; blind: boolean; allowed_sources: string[]; current_value: unknown }>(`SELECT * FROM tasks WHERE card_id = $1 ORDER BY is_gold`, [card])).rows;
    return { regular: rows[0].task_id, gold: rows[1].task_id, source, input, rows };
  };
  const submit = async (key: string, task: string, source: string, result: unknown = answer) => {
    await assignAll(pg);
    const r = await verify(new Request("http://localhost/api/v1/verify", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ task_id: task, status: "verified", result, evidence: evidence(source) }) }));
    assert.equal(r.status, 202, JSON.stringify(await r.json()));
  };
  const status = async (key: string) => {
    const r = await me(new Request("http://localhost/api/v1/agents/me", { headers: { authorization: `Bearer ${key}` } }));
    assert.equal(r.status, 200);
    const body = await r.json();
    return { credits: body.credits, score: body.reputation.score, completed: body.reputation.tasks_completed };
  };

  for (const blind of [false, true]) it(`loader gives gold and regular the same ID format, blind=${blind}, sources and public presentation`, async () => {
    // No hand-written task IDs: both actual production ingestion paths run here.
    const pair = await taskPair(blind);
    assert.notEqual(pair.regular, pair.gold);
    for (const row of pair.rows) {
      assert.match(row.task_id, /^t_[a-f0-9]{24}$/);
      assert.equal(row.blind, blind);
      assert.deepEqual(row.current_value, answer);
      assert.deepEqual(row.allowed_sources, pair.rows[0].allowed_sources);
    }
    // Isolate this pair so dispatch deterministically returns its two public DTOs.
    await pg.query(`UPDATE tasks SET state = 'expired' WHERE task_id NOT IN ($1,$2)`, [pair.regular, pair.gold]);
    const a = await agent();
    const gold = (await db.transaction((tx) => pickTasks(tx, a.id, 1, () => 0)))[0];
    const regular = (await db.transaction((tx) => pickTasks(tx, a.id, 1, () => 0.99)))[0];
    const presentation = ({ task_id, expires_at, ...rest }: typeof gold) => {
      assert.match(task_id, /^t_[a-f0-9]{24}$/);
      assert.ok(Date.parse(expires_at) > Date.now());
      return rest;
    };
    assert.deepEqual(presentation(gold), presentation(regular));
    assert.equal(gold.blind, blind);
    assert.deepEqual(gold.current_value, blind ? null : answer);
    assert.ok(!JSON.stringify(gold).includes("gold"));
    assert.equal((await loadGold(db, pair.input, wl)).gold_unchanged, 1);
    pair.input.items[0].gold_answer = { ...answer, annual_fee: 96 };
    assert.equal((await loadGold(db, pair.input, wl)).gold_updated, 1);
    assert.equal((await pg.query(`SELECT 1 FROM task_gold_answers WHERE task_id = $1`, [pair.gold])).rows.length, 1, "history preserved");
    const replacement = (await pg.query<{ task_id: string }>(`SELECT task_id FROM task_gold_answers WHERE gold_id = $1`, [pair.input.items[0].gold_id])).rows[0].task_id;
    assert.notEqual(replacement, pair.gold);
    assert.match(replacement, /^t_[a-f0-9]{24}$/);
  });

  it("reload replaces a legacy gold UUID even when its presentation and answer are unchanged", async () => {
    const pair = await taskPair(true);
    const legacy = "12345678-1234-4234-8234-123456789abc";
    // Simulate an old loader row without changing its reference or presentation.
    await pg.query(`INSERT INTO tasks (task_id,card_id,field,type,instructions_code,allowed_sources,current_value,blind,is_gold,origin,expires_at)
      SELECT $1,card_id,field,type,instructions_code,allowed_sources,current_value,blind,is_gold,origin,expires_at FROM tasks WHERE task_id = $2`, [legacy, pair.gold]);
    await pg.query(`UPDATE task_gold_answers SET task_id = $1 WHERE task_id = $2`, [legacy, pair.gold]);
    await pg.query(`UPDATE tasks SET state = 'expired' WHERE task_id = $1`, [pair.gold]);
    const out = await loadGold(db, pair.input, wl);
    assert.equal(out.gold_updated, 1);
    assert.equal(out.gold_created, 1);
    const replacement = (await pg.query<{ task_id: string }>(`SELECT task_id FROM task_gold_answers WHERE gold_id = $1`, [pair.input.items[0].gold_id])).rows[0].task_id;
    assert.match(replacement, /^t_[a-f0-9]{24}$/);
    assert.notEqual(replacement, pair.gold);
  });

  it("skips gold without a regular presentation and retires withdrawn sources", async () => {
    const unmatched = { rules: [], items: [{ gold_id: "unmatched", card_id: "no-template", field: "annual_fee", type: "fee_check", gold_answer: answer, source_url: "https://issuer.example/cards/no-template" }] };
    assert.equal((await loadGold(db, unmatched, wl)).gold_skipped_no_template, 1);
    assert.equal((await pg.query(`SELECT 1 FROM tasks WHERE card_id = 'no-template'`)).rows.length, 0);
    const pair = await taskPair(false);
    assert.equal((await loadGold(db, pair.input, { entries: [] })).gold_skipped_non_dispatchable, 1);
    assert.equal((await pg.query<{ state: string }>(`SELECT state FROM tasks WHERE task_id = $1`, [pair.gold])).rows[0].state, "expired");
    await loadGold(db, { rules: [], items: [] }, wl);
  });

  for (const end of ["quorum", "expiry"] as const) it(`gold and regular settlement timing is identical through 1/2 votes and ${end}`, async () => {
    await pg.query(`UPDATE tasks SET state = 'expired'`);
    const pair = await taskPair(true);
    const regular = [await agent(), await agent(), await agent()];
    const gold = [await agent(), await agent(), await agent()];
    for (let i = 0; i < 2; i++) {
      await submit(regular[i].key, pair.regular, pair.source);
      await submit(gold[i].key, pair.gold, pair.source);
      const before = await status(gold[0].key);
      await settle(db);
      assert.deepEqual(await status(gold[0].key), before, "settle cannot reveal gold before quorum");
      assert.deepEqual(await status(gold[0].key), await status(regular[0].key));
      assert.equal((await status(gold[0].key)).credits.pending, 1);
      assert.equal((await pg.query(`SELECT 1 FROM votes WHERE task_id IN ($1,$2) AND outcome = 'pending'`, [pair.regular, pair.gold])).rows.length, 2 * (i + 1));
    }
    if (end === "quorum") {
      await submit(regular[2].key, pair.regular, pair.source);
      await submit(gold[2].key, pair.gold, pair.source);
    } else await pg.query(`UPDATE tasks SET expires_at = now() - interval '1 minute' WHERE task_id IN ($1,$2)`, [pair.regular, pair.gold]);
    const sum = await settle(db);
    assert.equal(end === "quorum" ? sum.settled_tasks : sum.expired_tasks, 2);
    for (const a of [regular[0], gold[0]]) {
      const s = await status(a.key);
      assert.deepEqual(s.credits, { balance: end === "quorum" ? 1 : 0, pending: 0 });
      assert.equal(s.completed, end === "quorum" ? 1 : 0);
    }
    const ledger = (await pg.query(`SELECT * FROM credit_ledger ORDER BY entry_id`)).rows;
    await settle(db);
    assert.deepEqual((await pg.query(`SELECT * FROM credit_ledger ORDER BY entry_id`)).rows, ledger);
  });

  it("caps score increases and new vote snapshots, including legacy scores above the placeholder cap", async () => {
    const pair = await taskPair(false);
    const agents = [await agent(0.99), await agent(999), await agent(0)];
    for (const a of agents) await submit(a.key, pair.gold, pair.source, a === agents[2] ? { ...answer, annual_fee: 1 } : answer);
    const weights = (await pg.query<{ weight: number | string }>(`SELECT weight FROM votes WHERE task_id = $1 ORDER BY submitted_at`, [pair.gold])).rows.map((r) => Number(r.weight));
    assert.deepEqual(weights, [0.99, v1Config.reputationScoreCap, 0]);
    await settle(db);
    for (const a of agents.slice(0, 2)) assert.equal((await status(a.key)).score, v1Config.reputationScoreCap);
    assert.deepEqual((await pg.query<{ weight: number | string }>(`SELECT weight FROM votes WHERE task_id = $1 ORDER BY submitted_at`, [pair.gold])).rows.map((r) => Number(r.weight)), weights);
    assert.equal((await status(agents[2].key)).score, 0, "gold penalties retain the floor");
    for (const a of agents) await submit(a.key, pair.regular, pair.source, a === agents[2] ? { ...answer, annual_fee: 1 } : answer);
    await settle(db);
    for (const a of agents.slice(0, 2)) assert.equal((await status(a.key)).score, v1Config.reputationScoreCap);
    assert.equal((await status(agents[2].key)).score, 0, "consensus penalties retain the floor");
  });

  for (const isGold of [false, true]) for (const count of [0, 2, 4]) it(`expires malformed ${isGold ? "gold" : "regular"} quorum with ${count} pending votes`, async () => {
    const pair = await taskPair(false), task = isGold ? pair.gold : pair.regular;
    for (let i = 0; i < count; i++) {
      const a = await agent(), vote = newId("v");
      await pg.query(`INSERT INTO votes (vote_id,task_id,agent_id,result,weight) VALUES ($1,$2,$3,$4::jsonb,0.5)`, [vote, task, a.id, JSON.stringify({ result: answer })]);
      await pg.query(`INSERT INTO credit_ledger (entry_id,agent_id,delta,reason,ref_id,state) VALUES ($1,$2,1,'task_reward',$3,'provisional')`, [newId("cl"), a.id, vote]);
    }
    await pg.query(`UPDATE tasks SET state = 'quorum' WHERE task_id = $1`, [task]);
    const sum = await settle(db);
    assert.equal(sum.expired_tasks, 1);
    assert.equal(sum.expired_votes, count);
    assert.equal((await pg.query<{ state: string }>(`SELECT state FROM tasks WHERE task_id = $1`, [task])).rows[0].state, "expired");
    assert.equal((await pg.query(`SELECT 1 FROM votes WHERE task_id = $1 AND outcome <> 'expired'`, [task])).rows.length, 0);
    assert.equal((await pg.query<{ total: number }>(`SELECT COALESCE(SUM(delta),0)::int AS total FROM credit_ledger WHERE ref_id IN (SELECT vote_id FROM votes WHERE task_id = $1)`, [task])).rows[0].total, 0);
    assert.equal((await settle(db)).expired_tasks, 0);
  });

  for (const change of ["unchanged", "redirect", "error", "different"] as const) it(`handles a plain URL current value for link consensus: ${change}`, async () => {
    const source = "https://issuer.example/cards/link", card = newId("card").replaceAll("_", "-");
    await ingestTask(db, { card_id: card, type: "link_check", field: "sources[0].url", origin: "url-check", blind: false, current_value: source, allowed_sources: [source] });
    const task = (await pg.query<{ task_id: string }>(`SELECT task_id FROM tasks WHERE card_id = $1`, [card])).rows[0].task_id;
    const result = { http_status: change === "error" ? 404 : 200, final_url: change === "different" ? `${source}/new` : "https://issuer.example/cards/link/?q=1#x", is_official_redirect: change === "redirect" };
    for (let i = 0; i < 3; i++) await submit((await agent()).key, task, source, result);
    const sum = await settle(db);
    assert.equal(sum.suggestions, change === "unchanged" ? 0 : 1);
    assert.equal(sum.agreed, 3);
    assert.equal((await pg.query(`SELECT 1 FROM consensus_suggestions WHERE task_id = $1`, [task])).rows.length, change === "unchanged" ? 0 : 1);
  });

  it("migration repairs pending outcomes on existing disputed tasks", async () => {
    const pair = await taskPair(false), a = await agent();
    await submit(a.key, pair.regular, pair.source);
    await pg.query(`UPDATE tasks SET state = 'disputed' WHERE task_id = $1`, [pair.regular]);
    await pg.exec(`DROP TRIGGER tasks_api_transition_guard ON tasks`);
    await pg.exec(readFileSync(new URL("../db/migrations/0005_review_settlement_guards.sql", import.meta.url), "utf8"));
    assert.equal((await pg.query<{ outcome: string }>(`SELECT outcome FROM votes WHERE task_id = $1`, [pair.regular])).rows[0].outcome, "disputed");
  });

  it("DB trigger allows only API open -> quorum while retaining locks and privileged settlement", async () => {
    const pair = await taskPair(false);
    await pg.exec(`CREATE ROLE opencard_api NOLOGIN`);
    await pg.exec(readFileSync(new URL("../db/roles/opencard_api_grants.sql", import.meta.url), "utf8"));
    await pg.exec(`SET ROLE opencard_api`);
    try {
      await pg.query(`SELECT task_id FROM tasks WHERE task_id = $1 FOR UPDATE`, [pair.regular]);
      for (const state of ["settled", "disputed", "expired", "open"]) await assert.rejects(pg.query(`UPDATE tasks SET state = $2 WHERE task_id = $1`, [pair.regular, state]), /API task transition/);
      await pg.query(`UPDATE tasks SET state = 'quorum' WHERE task_id = $1`, [pair.regular]);
      for (const state of ["open", "settled", "disputed", "expired", "quorum"]) await assert.rejects(pg.query(`UPDATE tasks SET state = $2 WHERE task_id = $1`, [pair.regular, state]), /API task transition/);
    } finally { await pg.exec(`RESET ROLE`); }
    await pg.query(`UPDATE tasks SET state = 'settled' WHERE task_id = $1`, [pair.regular]);
    assert.equal((await pg.query<{ state: string }>(`SELECT state FROM tasks WHERE task_id = $1`, [pair.regular])).rows[0].state, "settled");
  });
});
