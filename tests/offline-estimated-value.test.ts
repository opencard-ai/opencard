import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { recomputeEstimatedValue } from "../lib/cpp-rates";

test("explicit bonus types override cash and small-bonus heuristics", () => {
  for (const points of [500, 50000]) {
    assert.equal(recomputeEstimatedValue(points, "Ulta Beauty Rewards", "points"), null);
    assert.equal(recomputeEstimatedValue(points, "Ulta Beauty Rewards", "percent_discount"), null);
    assert.equal(recomputeEstimatedValue(points, undefined, "points"), null);
  }
  assert.equal(recomputeEstimatedValue(500, "Membership Rewards", "points"), 9);
  assert.equal(recomputeEstimatedValue(500, "Membership Rewards", "percent_discount"), null);
  assert.equal(recomputeEstimatedValue(2000, "Membership Rewards", "cash"), 2000);
  assert.equal(recomputeEstimatedValue(500, "Cash Back", "points"), null);
  for (const points of [undefined, null, 0, -1, NaN, Infinity]) {
    assert.equal(recomputeEstimatedValue(points, "Membership Rewards", "points"), null);
  }
});

test("cash and existing valued currencies retain their valuations", () => {
  for (const [program, points, expected] of [
    ["Membership Rewards", 60000, 1020],
    ["United MileagePlus", 60000, 810],
    ["Hilton Honors", 100000, 500],
    ["Discover Miles", 10000, 100],
  ] as const) {
    assert.equal(recomputeEstimatedValue(points, program), expected);
    assert.equal(recomputeEstimatedValue(points, program, "points"), expected);
  }
  assert.equal(recomputeEstimatedValue(250, "Cash Back"), 250);
  assert.equal(recomputeEstimatedValue(2000, "Cash Back", "cash"), 2000);
  // Untyped legacy offers keep their existing dollar / default-CPP conventions.
  assert.equal(recomputeEstimatedValue(200, undefined), 200);
  assert.equal(recomputeEstimatedValue(20000, "Bank of America Travel Points"), 200);
});

test("both offline CLIs respect bonus_type, including apply in an isolated catalog", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "opencard-estimated-value-"));
  const cardsDir = path.join(dir, "data/cards");
  mkdirSync(cardsDir, { recursive: true });
  const offers = {
    "ulta-points": { bonus_points: 500, point_program: "Ulta Beauty Rewards", bonus_type: "points" },
    "ulta-large": { bonus_points: 50000, point_program: "Ulta Beauty Rewards", bonus_type: "points", estimated_value: 0 },
    "ulta-discount": { bonus_points: 500, point_program: "Ulta Beauty Rewards", bonus_type: "percent_discount", discount_percent: 20, estimated_value: 0 },
    "cash": { bonus_points: 2000, point_program: "Points", bonus_type: "cash", estimated_value: 0 },
    "mr-small": { bonus_points: 500, point_program: "Membership Rewards", bonus_type: "points", estimated_value: 0 },
    "hilton": { bonus_points: 100000, point_program: "Hilton Honors", bonus_type: "points", estimated_value: 0 },
    "legacy-bank": { bonus_points: 20000, point_program: "Bank of America Travel Points", estimated_value: 0 },
  };
  const writeCard = (id: string, offer: object) => writeFileSync(path.join(cardsDir, `${id}.json`), JSON.stringify({
    card_id: id, name: id, issuer: "Fixture", network: "visa", annual_fee: 0,
    welcome_offer: offer, status: "active", last_verified: "2026-11-23",
  }));
  const readOffer = (id: string) => JSON.parse(readFileSync(path.join(cardsDir, `${id}.json`), "utf8")).welcome_offer;
  const run = (script: string, ...args: string[]) => execFileSync(process.execPath, [
    "--import", createRequire(import.meta.url).resolve("tsx"),
    fileURLToPath(new URL(`../scripts/${script}`, import.meta.url)), ...args,
  ], { cwd: dir, encoding: "utf8" });
  try {
    for (const [id, offer] of Object.entries(offers)) writeCard(id, offer);
    const dry = run("recompute-estimated-value.ts", "--dry");
    assert.match(dry, /Mode: DRY-RUN/);
    assert.match(dry, /Cards changed:\s+4/);
    for (const [id, offer] of Object.entries(offers)) assert.deepEqual(readOffer(id), offer);

    run("recompute-estimated-value.ts", "--apply");
    assert.equal(readOffer("ulta-points").estimated_value, undefined);
    assert.equal(readOffer("ulta-large").estimated_value, 0);
    assert.equal(readOffer("ulta-discount").estimated_value, 0);
    assert.equal(readOffer("cash").estimated_value, 2000);
    assert.equal(readOffer("mr-small").estimated_value, 9);
    assert.equal(readOffer("hilton").estimated_value, 500);
    assert.equal(readOffer("legacy-bank").estimated_value, 200);

    // Deliberately inconsistent positive values exercise the audit's expectation
    // gate: unsupported points/discounts must be skipped, valued offers must flag.
    for (const [id, offer] of Object.entries(offers)) writeCard(id, { ...offer, estimated_value: 1 });
    run("audit/db-audit.ts", "--today", "2026-11-23", "--out-dir", "audit");
    const audit = JSON.parse(readFileSync(path.join(dir, "audit/2026-11-23-db-audit.json"), "utf8"));
    const values = audit.findings.filter((f: { type: string }) => f.type === "value_inconsistent");
    assert.deepEqual(values.map((f: { card_id: string }) => f.card_id).sort(), ["cash", "hilton", "legacy-bank", "mr-small"]);
    assert.match(values.find((f: { card_id: string }) => f.card_id === "cash").detail, /≈ \$2000/);
    assert.match(values.find((f: { card_id: string }) => f.card_id === "mr-small").detail, /≈ \$9/);
    for (const id of Object.keys(offers)) assert.equal(readOffer(id).estimated_value, 1, "audit is read-only");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
