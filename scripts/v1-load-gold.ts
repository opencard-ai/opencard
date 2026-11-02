/**
 * Load the gold set and sources whitelist into the v1 DB. Data files live OUTSIDE the repo.
 * Usage: V1_DATABASE_URL=... npx tsx scripts/v1-load-gold.ts <gold.json> <whitelist.json>
 * - Whitelist: upsert all entries (dispatchable flag preserved).
 * - Gold: one task per item with a random UUIDv4 task_id; gold_id/answer/provenance only in task_gold_answers.
 *   Idempotent by gold_id. Items whose source_url is not on a dispatchable source are skipped.
 * Prints counts only; never prints answers, ids or notes.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getV1Db } from "../lib/v1/db";
import { urlMatchesWhitelist } from "../lib/v1/verify-validate";
import { DEFAULT_TIER_CONFIG } from "../lib/v1-settle/scoring";

type WL = { pattern: string; issuer: string; kind: string; fields?: string[]; requires_browser?: boolean; dispatchable?: boolean; robots?: unknown; tos_url?: string | null; tos_notes?: string | null };
type Gold = { gold_id: string; card_id: string; field: string; type: string; gold_answer: unknown; source_url: string; confirmed_date?: string; confirmed_by?: string; match_rule?: unknown; notes?: string };

async function main() {
  const [goldPath, wlPath] = process.argv.slice(2);
  if (!goldPath || !wlPath) throw new Error("usage: v1-load-gold.ts <gold.json> <whitelist.json>");
  const gold = JSON.parse(readFileSync(goldPath, "utf8")) as { rules: string[]; items: Gold[] };
  const wl = JSON.parse(readFileSync(wlPath, "utf8")) as { entries: WL[] };
  const db = await getV1Db();
  const out = await db.transaction(async (tx) => {
    for (const e of wl.entries) {
      await tx.query(
        `INSERT INTO sources_whitelist (pattern, issuer, kind, tos_notes, fields, requires_browser, dispatchable, robots, tos_url)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)
         ON CONFLICT (pattern) DO UPDATE SET issuer=EXCLUDED.issuer, kind=EXCLUDED.kind, tos_notes=EXCLUDED.tos_notes, fields=EXCLUDED.fields,
           requires_browser=EXCLUDED.requires_browser, dispatchable=EXCLUDED.dispatchable, robots=EXCLUDED.robots, tos_url=EXCLUDED.tos_url`,
        [e.pattern, e.issuer, e.kind, e.tos_notes ?? null, JSON.stringify(e.fields ?? []), Boolean(e.requires_browser), e.dispatchable === true,
          e.robots == null ? null : typeof e.robots === "string" ? e.robots : JSON.stringify(e.robots), e.tos_url ?? null],
      );
    }
    const disp = wl.entries.filter((e) => e.dispatchable === true);
    await tx.query(
      `INSERT INTO v1_scoring_config (key, value) VALUES ('gold_rules', $1::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify({
        visible_text_only: true,
        no_inferred_values: true,
        dispatchable_sources_only: true,
        link_check: { compare: "host+path", scheme_insensitive: true, strip_query: true, strip_fragment: true, trailing_slash_insensitive: true },
        source_rules: gold.rules,
      })],
    );
    await tx.query(`INSERT INTO v1_scoring_config (key, value) VALUES ('tiers', $1::jsonb) ON CONFLICT (key) DO NOTHING`, [JSON.stringify(DEFAULT_TIER_CONFIG)]);
    let created = 0, existing = 0, skipped = 0;
    for (const g of gold.items) {
      const has = await tx.query(`SELECT 1 FROM task_gold_answers WHERE gold_id = $1`, [g.gold_id]);
      if (has.rows.length) { existing++; continue; }
      const allowed = disp.filter((e) => urlMatchesWhitelist(g.source_url, [e.pattern]));
      if (!allowed.length) { skipped++; continue; }
      const taskId = randomUUID();
      await tx.query(
        `INSERT INTO tasks (task_id, card_id, field, type, instructions_code, allowed_sources, current_value, blind, is_gold, origin, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,NULL,true,true,'manual', now() + interval '180 days')`,
        [taskId, g.card_id, g.field, g.type, `${g.type}.v1`, JSON.stringify(disp.filter((e) => e.issuer === allowed[0].issuer).map((e) => e.pattern))],
      );
      await tx.query(
        `INSERT INTO task_gold_answers (task_id, gold_answer, gold_id, source_url, match_rule, confirmed_date, confirmed_by, notes)
         VALUES ($1,$2::jsonb,$3,$4,$5::jsonb,$6,$7,$8)`,
        [taskId, JSON.stringify(g.gold_answer), g.gold_id, g.source_url, g.match_rule == null ? null : JSON.stringify(g.match_rule),
          g.confirmed_date ?? null, g.confirmed_by ?? null, g.notes ?? null],
      );
      created++;
    }
    return { whitelist: wl.entries.length, dispatchable: disp.length, gold_created: created, gold_existing: existing, gold_skipped_non_dispatchable: skipped };
  });
  console.log(JSON.stringify(out));
  process.exit(0);
}
main().catch((e) => { console.error(`load failed: ${e instanceof Error ? e.message : "unknown"}`); process.exit(1); });
