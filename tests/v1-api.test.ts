import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { setV1DbForTesting } from "@/lib/v1/db";
import { resetV1RateLimitForTesting } from "@/lib/v1/rate-limit";
import { getAllCards } from "@/lib/cards";
import { POST as registerAgent } from "@/app/api/v1/agents/route";
import { GET as getMe } from "@/app/api/v1/agents/me/route";
import { GET as getCard } from "@/app/api/v1/cards/[card_id]/route";
import { POST as postVerify } from "@/app/api/v1/verify/route";
import { makeTestDb, seedFixtures, evidence, GOLD_SENTINEL } from "./v1-harness";
import type { PGlite } from "@electric-sql/pglite";

const ROOT = path.join(__dirname, "..");
const INVITE = "fake-invite-code-for-tests";
const BASE = "http://localhost/api/v1";

// Capture everything the API writes to the console so we can prove no secret/gold leaks into logs.
const logged: string[] = [];
const origConsole = { log: console.log, error: console.error, warn: console.warn, info: console.info };
// Every response body + headers observed during the suite.
const seen: string[] = [];

async function record(res: Response): Promise<{ status: number; body: Record<string, unknown>; headers: Headers }> {
  const text = await res.text();
  seen.push(text, JSON.stringify([...res.headers.entries()]));
  return { status: res.status, body: text ? JSON.parse(text) : {}, headers: res.headers };
}

function hashDir(dir: string): string {
  const h = createHash("sha256");
  for (const f of readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (statSync(p).isFile()) h.update(f).update(readFileSync(p));
  }
  return h.digest("hex");
}

const register = (name: string, invite: string | null = INVITE, ip = "10.0.0.1") =>
  registerAgent(new Request(`${BASE}/agents`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...(invite ? { "x-invite-code": invite } : {}) },
    body: JSON.stringify({ agent_name: name, contact_email: "fake@example.com" }),
  }));
const auth = (key: string) => ({ authorization: `Bearer ${key}` });
const card = (key: string, id: string) => getCard(new Request(`${BASE}/cards/${id}`, { headers: auth(key) }), { params: Promise.resolve({ card_id: id }) });
const verify = (key: string, body: unknown) =>
  postVerify(new Request(`${BASE}/verify`, { method: "POST", headers: { ...auth(key), "content-type": "application/json" }, body: JSON.stringify(body) }));

describe("/api/v1 verify-to-access (Phase 0-1)", () => {
  let pg: PGlite;
  let cardsHashBefore: string;
  const realCardId = getAllCards()[0].card_id;

  before(async () => {
    for (const k of ["log", "error", "warn", "info"] as const) {
      console[k] = (...args: unknown[]) => { logged.push(args.map(String).join(" ")); };
    }
    process.env.V1_API_ENABLED = "true";
    process.env.V1_INVITE_CODES = `other-code,${INVITE}`;
    process.env.V1_PROBATION_GRANT = "3";
    process.env.V1_TASK_REWARD = "1";
    cardsHashBefore = hashDir(path.join(ROOT, "data/cards"));
    const t = await makeTestDb();
    pg = t.pg;
    setV1DbForTesting(t.db);
    await seedFixtures(pg);
  });
  beforeEach(() => resetV1RateLimitForTesting());
  after(async () => {
    Object.assign(console, origConsole);
    setV1DbForTesting(null);
    await pg.close();
  });

  it("404s everything when V1_API_ENABLED is off (closed beta default)", async () => {
    process.env.V1_API_ENABLED = "";
    try {
      assert.equal((await record(await register("x"))).status, 404);
      assert.equal((await record(await getMe(new Request(`${BASE}/agents/me`)))).status, 404);
    } finally {
      process.env.V1_API_ENABLED = "true";
    }
  });

  it("requires a valid invite code to register", async () => {
    assert.equal((await record(await register("nobody", null))).status, 403);
    assert.equal((await record(await register("nobody", "wrong"))).status, 403);
  });

  it("returns the plaintext key exactly once and stores only a sha256 hash", async () => {
    const r = await record(await register("agent-one"));
    assert.equal(r.status, 201);
    const key = r.body.api_key as string;
    assert.match(key, /^ocv_live_[A-Za-z0-9_-]{43}$/);
    assert.equal(r.headers.get("X-Credits-Balance"), "3");

    const row = (await pg.query<Record<string, unknown>>(`SELECT * FROM agents WHERE agent_id = $1`, [r.body.agent_id])).rows[0];
    assert.equal(row.api_key_hash, "sha256:" + createHash("sha256").update(key).digest("hex"));
    const dump = JSON.stringify((await pg.query(`SELECT * FROM agents`)).rows) + JSON.stringify((await pg.query(`SELECT * FROM credit_ledger`)).rows);
    assert.ok(!dump.includes(key), "plaintext key must not be stored");

    const me = await record(await getMe(new Request(`${BASE}/agents/me`, { headers: auth(key) })));
    assert.equal(me.status, 200);
    assert.ok(!JSON.stringify(me.body).includes(key));
    assert.ok(!("api_key" in me.body));
    assert.deepEqual(me.body.credits, { balance: 3, pending: 0 });
    assert.equal(me.body.tier, "probation");
  });

  it("rejects missing, malformed and wrong keys with 401", async () => {
    assert.equal((await record(await getMe(new Request(`${BASE}/agents/me`)))).status, 401);
    assert.equal((await record(await getMe(new Request(`${BASE}/agents/me`, { headers: auth("ocv_live_short") })))).status, 401);
    const r = await record(await register("agent-wrongkey"));
    const k = r.body.api_key as string;
    const tampered = k.slice(0, -1) + (k.endsWith("A") ? "B" : "A");
    assert.equal((await record(await getMe(new Request(`${BASE}/agents/me`, { headers: auth(tampered) })))).status, 401);
  });

  it("charges 1 credit per card, attaches <=2 tasks, sets all headers, and returns 402 when empty", async () => {
    const key = (await record(await register("agent-spender"))).body.api_key as string;
    for (let i = 0; i < 3; i++) {
      const r = await record(await card(key, realCardId));
      assert.equal(r.status, 200);
      assert.equal((r.body.card as Record<string, unknown>).card_id, realCardId);
      assert.ok(!("affiliate_url" in (r.body.card as object)));
      const tasks = r.body.verification_tasks as Record<string, unknown>[];
      assert.ok(tasks.length <= 2);
      assert.equal(r.headers.get("X-Tasks-Attached"), String(tasks.length));
      assert.equal(r.headers.get("X-Credits-Balance"), String(2 - i));
      for (const h of ["X-Credits-Pending", "X-Credits-Cost", "X-Reputation-Tier", "X-RateLimit-Remaining", "X-RateLimit-Reset"]) assert.ok(r.headers.get(h), h);
      for (const t of tasks) {
        assert.ok(!("is_gold" in t));
        if (t.blind) assert.equal(t.current_value, null);
        assert.ok(t.instructions_code);
      }
    }
    const r = await record(await card(key, realCardId));
    assert.equal(r.status, 402);
    assert.equal(r.body.error, "insufficient_credits");
    assert.equal(r.body.required_credits, 1);
    assert.ok(Array.isArray(r.body.verification_tasks));
    assert.ok((r.body.alternatives as Record<string, unknown>).public_html);
    assert.equal(r.headers.get("X-Credits-Balance"), "0");
    // Ledger is append-only.
    await assert.rejects(pg.query(`DELETE FROM credit_ledger`));
    await assert.rejects(pg.query(`UPDATE credit_ledger SET delta = 999`));
  });

  it("404s an unknown card without charging", async () => {
    const key = (await record(await register("agent-404"))).body.api_key as string;
    const r = await record(await card(key, "no-such-card-xyz"));
    assert.equal(r.status, 404);
    assert.equal(r.headers.get("X-Credits-Balance"), "3");
  });

  it("validates verify submissions (schema, whitelist, duplicates, unknown tasks)", async () => {
    const key = (await record(await register("agent-validator"))).body.api_key as string;
    const ok = { task_id: "t_fake_fee_a", status: "verified", result: { annual_fee: 95, first_year_waived: false }, evidence: evidence() };
    assert.equal((await record(await verify(key, { ...ok, result: { annual_fee: "95", first_year_waived: false } }))).status, 422);
    assert.equal((await record(await verify(key, { ...ok, result: { ...ok.result, extra: 1 } }))).status, 422);
    assert.equal((await record(await verify(key, { ...ok, evidence: { ...ok.evidence, content_hash: "md5:x" } }))).status, 422);
    const bad = await record(await verify(key, { ...ok, evidence: evidence("https://evil.example.net/cards/") }));
    assert.equal(bad.status, 422);
    assert.equal(bad.body.error, "evidence_source_not_allowed");
    assert.equal((await record(await verify(key, { ...ok, task_id: "t_does_not_exist" }))).status, 404);
    assert.equal((await record(await verify(key, { task_id: "t_fake_fee_a", status: "unable_to_verify" }))).status, 422);

    const good = await record(await verify(key, ok));
    assert.equal(good.status, 202);
    assert.deepEqual(good.body, { task_id: "t_fake_fee_a", state: "pending_consensus", provisional_credits: 1, votes_received: 1, votes_required: 3 });
    assert.equal(good.headers.get("X-Credits-Pending"), "1");
    assert.equal(good.headers.get("X-Credits-Balance"), "3", "provisional credits are not spendable");
    assert.equal((await record(await verify(key, ok))).status, 409);
  });

  it("unable_to_verify earns nothing and does not count toward quorum; 3 verified votes reach quorum", async () => {
    const body = (n: number) => ({ task_id: "t_fake_link_b", status: "verified", evidence: evidence("https://issuer-beta.example.com/new/fake"),
      result: { http_status: 200, final_url: `https://issuer-beta.example.com/new/fake-${n}`, is_official_redirect: true } });
    const unable = (await record(await register("agent-unable"))).body.api_key as string;
    const u = await record(await verify(unable, { task_id: "t_fake_link_b", status: "unable_to_verify", reason: "page_blocked" }));
    assert.equal(u.status, 202);
    assert.equal(u.body.provisional_credits, 0);
    assert.equal(u.body.votes_received, 0);
    for (let i = 1; i <= 3; i++) {
      const k = (await record(await register(`agent-q${i}`))).body.api_key as string;
      const r = await record(await verify(k, body(i)));
      assert.equal(r.status, 202);
      assert.equal(r.body.votes_received, i);
      assert.ok(!JSON.stringify(r.body).includes("agent_"), "never reveals other agents");
    }
    assert.equal((await pg.query<{ state: string }>(`SELECT state FROM tasks WHERE task_id = 't_fake_link_b'`)).rows[0].state, "quorum");
    const late = (await record(await register("agent-late"))).body.api_key as string;
    assert.equal((await record(await verify(late, body(4)))).status, 409);
  });

  it("gold tasks are indistinguishable: same response shape whether right or wrong", async () => {
    const k1 = (await record(await register("agent-h1"))).body.api_key as string;
    const k2 = (await record(await register("agent-h2"))).body.api_key as string;
    const ev = evidence("https://issuer-alpha.example.com/cards/fake-card-delta");
    const right = await record(await verify(k1, { task_id: "t_fake_fee_d", status: "verified", result: { annual_fee: 777123 % 10000, first_year_waived: false }, evidence: ev }));
    const wrong = await record(await verify(k2, { task_id: "t_fake_fee_d", status: "verified", result: { annual_fee: 1, first_year_waived: true }, evidence: ev }));
    assert.equal(right.status, wrong.status);
    assert.deepEqual(Object.keys(right.body).sort(), Object.keys(wrong.body).sort());
    assert.equal(right.body.state, "pending_consensus");
    assert.equal(right.body.provisional_credits, wrong.body.provisional_credits);
  });

  it("forces gold tasks into card responses and still never exposes gold data", async () => {
    await pg.query(`UPDATE tasks SET state = 'expired' WHERE is_gold = false`);
    const key = (await record(await register("agent-hcards"))).body.api_key as string;
    const r = await record(await card(key, realCardId));
    assert.equal(r.status, 200);
    const tasks = r.body.verification_tasks as Record<string, unknown>[];
    assert.equal(tasks.length, 1);
    assert.equal(tasks[0].task_id, "t_fake_fee_d");
    assert.equal(tasks[0].current_value, null);
    await pg.query(`UPDATE tasks SET state = 'open' WHERE is_gold = false AND task_id <> 't_fake_link_b'`);
  });

  it("logs nothing sensitive and an internal error leaks no data", async () => {
    // Break the DB to exercise the error path, then restore.
    await pg.query(`ALTER TABLE credit_ledger RENAME TO credit_ledger_tmp`);
    try {
      const k = (await record(await register("agent-err"))) as { status: number };
      assert.equal(k.status, 500);
    } finally {
      await pg.query(`ALTER TABLE credit_ledger_tmp RENAME TO credit_ledger`);
    }
  });

  it("gold_answer never appears in any response, header or log line", () => {
    const all = seen.join("\n") + "\n" + logged.join("\n");
    assert.ok(seen.length > 20, "suite exercised the API");
    assert.ok(!all.includes(GOLD_SENTINEL));
    assert.ok(!all.includes("777123"));
    // gold_accuracy (agent own aggregate score, spec 8) is the only allowed mention.
    const m = /.{0,40}gold.{0,40}/i.exec(all.replaceAll('"gold_accuracy":', "")); assert.ok(!m, `gold-related text found: ${m?.[0]}`);
    assert.ok(!/is_gold/.test(all));
  });

  it("no API key plaintext appears in logs", () => {
    assert.ok(!/ocv_live_[A-Za-z0-9_-]{43}/.test(logged.join("\n")));
  });

  it("API source never references the isolated gold table or answer column", () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(f)) files.push(p);
      }
    };
    walk(path.join(ROOT, "app/api/v1"));
    walk(path.join(ROOT, "lib/v1"));
    assert.ok(files.length >= 10);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert.ok(!/gold_answer|task_gold_answers/.test(src), `${path.relative(ROOT, f)} must not reference gold answers`);
    }
  });

  it("never writes data/cards", () => {
    assert.equal(hashDir(path.join(ROOT, "data/cards")), cardsHashBefore);
  });
});
