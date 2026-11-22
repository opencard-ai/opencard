/** Privileged gold loader. Public task presentation comes from a matching regular signal,
 * never from the reference answer. Without one, skip rather than expose a gold-only shape. */
import type { V1Db } from "../v1/db";
import { newId } from "../v1/keys";
import { urlMatchesWhitelist } from "../v1/verify-validate";
import { v1Config } from "../v1/config";
import { INSTRUCTIONS, permittedSources, type SourceRule, type TaskType } from "../v1/tasks";

type WL = { pattern: string; issuer: string; kind: string; fields?: string[]; requires_browser?: boolean; dispatchable?: boolean; robots?: unknown; tos_url?: string | null; tos_notes?: string | null };
type Gold = { gold_id: string; card_id: string; field: string; type: string; gold_answer: unknown; source_url: string; confirmed_date?: string; confirmed_by?: string; match_rule?: unknown; notes?: string };

export async function loadGold(db: V1Db, gold: { rules: string[]; items: Gold[] }, wl: { entries: WL[] }) {
  return db.transaction(async (tx) => {
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

    let created = 0, existing = 0, updated = 0, skipped = 0, unmatched = 0;
    for (const g of gold.items) {
      const allowed = disp.filter((e) => e.fields?.includes(g.field.replace(/\[\d+\]/g, "[]")) && urlMatchesWhitelist(g.source_url, [e.pattern]));
      const templates = await tx.query<{ blind: boolean; current_value: unknown; allowed_sources: string[] }>(
        `SELECT blind, current_value, allowed_sources FROM tasks
         WHERE NOT is_gold AND card_id = $1 AND field = $2 AND type = $3
         ORDER BY created_at DESC, task_id LIMIT 1`, [g.card_id, g.field, g.type],
      );
      const template = templates.rows[0];
      const sources = template ? permittedSources(template.allowed_sources, g.field,
        disp.map((e) => ({ ...e, fields: e.fields ?? [], dispatchable: true })) as SourceRule[]) : [];
      const matched = template && sources.length > 0 && urlMatchesWhitelist(g.source_url, sources);
      const has = await tx.query<{ task_id: string; unchanged: boolean }>(
        `SELECT g.task_id, (g.gold_answer = $2::jsonb AND g.source_url = $3 AND t.expires_at > now()
           AND t.state = 'open' AND t.task_id ~ '^t_[a-f0-9]{24}$' AND t.allowed_sources = $7::jsonb AND t.blind = $8 AND t.current_value IS NOT DISTINCT FROM $9::jsonb AND t.card_id = $4 AND t.field = $5 AND t.type = $6) AS unchanged
         FROM task_gold_answers g JOIN tasks t ON t.task_id = g.task_id WHERE g.gold_id = $1 FOR UPDATE OF t`,
        [g.gold_id, JSON.stringify(g.gold_answer), g.source_url, g.card_id, g.field, g.type, JSON.stringify(sources), template?.blind ?? true,
          template?.current_value == null ? null : JSON.stringify(template.current_value)],
      );
      if (has.rows[0]?.unchanged && allowed.length && matched) { existing++; continue; }
      if (has.rows.length) {
        // Preserve historical answers and evidence. Retire old tasks and create fresh opaque IDs
        // when an answer changes, a task closes/expires, or its source loses approval.
        await tx.query(`UPDATE tasks SET state = 'expired' WHERE task_id = $1 AND state = 'open'`, [has.rows[0].task_id]);
        await tx.query(`UPDATE task_gold_answers SET gold_id = NULL WHERE task_id = $1`, [has.rows[0].task_id]);
        updated++;
      }
      if (!allowed.length) { skipped++; continue; }
      if (!matched) { unmatched++; continue; }
      const taskId = newId("t");
      await tx.query(
        `INSERT INTO tasks (task_id, card_id, field, type, instructions_code, allowed_sources, current_value, blind, is_gold, origin, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,true,'manual', now() + make_interval(mins => $9))`,
        [taskId, g.card_id, g.field, g.type, INSTRUCTIONS[g.type as TaskType], JSON.stringify(sources),
          template.current_value == null ? null : JSON.stringify(template.current_value), template.blind, v1Config.goldTtlMinutes()],
      );
      await tx.query(
        `INSERT INTO task_gold_answers (task_id, gold_answer, gold_id, source_url, match_rule, confirmed_date, confirmed_by, notes)
         VALUES ($1,$2::jsonb,$3,$4,$5::jsonb,$6,$7,$8)`,
        [taskId, JSON.stringify(g.gold_answer), g.gold_id, g.source_url, g.match_rule == null ? null : JSON.stringify(g.match_rule),
          g.confirmed_date ?? null, g.confirmed_by ?? null, g.notes ?? null],
      );
      created++;
    }
    return { whitelist: wl.entries.length, dispatchable: disp.length, gold_created: created, gold_updated: updated, gold_unchanged: existing, gold_skipped_non_dispatchable: skipped, gold_skipped_no_template: unmatched };
  });
}
