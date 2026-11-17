/**
 * Load the gold set and sources whitelist into the v1 DB. Data files live OUTSIDE the repo.
 * Usage: npx tsx scripts/v1-load-gold.ts <gold.json> <whitelist.json>
 * - Whitelist: upsert all entries (dispatchable flag preserved).
 * - Gold: one task per item with a random UUIDv4 task_id; gold_id/answer/provenance only in task_gold_answers.
 *   Idempotent by gold_id; changed/closed/expired tasks are retired with historical answers preserved. Items whose source_url is not on a dispatchable source are skipped.
 * Prints counts only; never prints answers, ids or notes.
 */
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getV1Db } from "../lib/v1/db";
import { logFailure, configureAdminDatabaseUrl } from "../lib/v1-settle/admin";
import { urlMatchesWhitelist } from "../lib/v1/verify-validate";
import { v1Config } from "../lib/v1/config";
import { INSTRUCTIONS, type TaskType } from "../lib/v1/tasks";

type WL = { pattern: string; issuer: string; kind: string; fields?: string[]; requires_browser?: boolean; dispatchable?: boolean; robots?: unknown; tos_url?: string | null; tos_notes?: string | null };
type Gold = { gold_id: string; card_id: string; field: string; type: string; gold_answer: unknown; source_url: string; confirmed_date?: string; confirmed_by?: string; match_rule?: unknown; notes?: string };

async function main() {
  configureAdminDatabaseUrl();
  const [goldPath, wlPath] = process.argv.slice(2);
  if (!goldPath || !wlPath) throw new Error("usage: v1-load-gold.ts <gold.json> <whitelist.json>");
  const gold = JSON.parse(readFileSync(goldPath, "utf8")) as { rules: string[]; items: Gold[] };
  const wl = JSON.parse(readFileSync(wlPath, "utf8")) as { entries: WL[] };
  const db = await getV1Db();
  const out = await db.transaction(async (tx) => {
    // The input whitelist is authoritative: removed patterns must lose dispatch approval too.
    await tx.query(`UPDATE sources_whitelist SET dispatchable = false`);
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
    const disp = wl.entries.filter((e) => e.dispatchable === true && e.kind === "official");
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

    let created = 0, existing = 0, updated = 0, skipped = 0;
    for (const g of gold.items) {
      const allowed = disp.filter((e) => e.fields?.includes(g.field.replace(/\[\d+\]/g, "[]")) && urlMatchesWhitelist(g.source_url, [e.pattern]));
      const has = await tx.query<{ task_id: string; unchanged: boolean }>(
        `SELECT g.task_id, (g.gold_answer = $2::jsonb AND g.source_url = $3 AND t.expires_at > now()
           AND t.state = 'open' AND t.allowed_sources = jsonb_build_array($3::text) AND t.card_id = $4 AND t.field = $5 AND t.type = $6) AS unchanged
         FROM task_gold_answers g JOIN tasks t ON t.task_id = g.task_id WHERE g.gold_id = $1 FOR UPDATE OF t`,
        [g.gold_id, JSON.stringify(g.gold_answer), g.source_url, g.card_id, g.field, g.type],
      );
      if (has.rows[0]?.unchanged && allowed.length) { existing++; continue; }
      if (has.rows.length) {
        // Preserve historical answers and evidence. Retire old tasks and create fresh opaque IDs
        // when an answer changes, a task closes/expires, or its source loses approval.
        await tx.query(`UPDATE tasks SET state = 'expired' WHERE task_id = $1 AND state = 'open'`, [has.rows[0].task_id]);
        await tx.query(`UPDATE task_gold_answers SET gold_id = NULL WHERE task_id = $1`, [has.rows[0].task_id]);
        updated++;
      }
      if (!allowed.length) { skipped++; continue; }
      const taskId = randomUUID();
      await tx.query(
        `INSERT INTO tasks (task_id, card_id, field, type, instructions_code, allowed_sources, current_value, blind, is_gold, origin, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,NULL,true,true,'manual', now() + make_interval(mins => $7))`,
        [taskId, g.card_id, g.field, g.type, INSTRUCTIONS[g.type as TaskType], JSON.stringify([g.source_url]), v1Config.goldTtlMinutes()],
      );
      await tx.query(
        `INSERT INTO task_gold_answers (task_id, gold_answer, gold_id, source_url, match_rule, confirmed_date, confirmed_by, notes)
         VALUES ($1,$2::jsonb,$3,$4,$5::jsonb,$6,$7,$8)`,
        [taskId, JSON.stringify(g.gold_answer), g.gold_id, g.source_url, g.match_rule == null ? null : JSON.stringify(g.match_rule),
          g.confirmed_date ?? null, g.confirmed_by ?? null, g.notes ?? null],
      );
      created++;
    }
    return { whitelist: wl.entries.length, dispatchable: disp.length, gold_created: created, gold_updated: updated, gold_unchanged: existing, gold_skipped_non_dispatchable: skipped };
  });
  console.log(JSON.stringify(out));
  process.exit(0);
}
main().catch((e) => { logFailure("load", e); process.exit(1); });
