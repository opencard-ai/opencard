/**
 * Recompute welcome_offer.estimated_value across data/cards/ using the
 * canonical CPP table in lib/cpp-rates.ts.
 *
 * Modes:
 *   --dry  show diffs only, no writes (default)
 *   --apply  write the new values into the JSON files
 *
 * Skips cards without:
 *   - welcome_offer.bonus_points (can't multiply)
 *   - point_program (defaults to 1.0 cpp; still computes but flagged)
 */
import * as fs from "fs";
import * as path from "path";
import { getCpp, recomputeEstimatedValue } from "../lib/cpp-rates";

const CARDS_DIR = path.join(process.cwd(), "data/cards");
const apply = process.argv.includes("--apply");

interface Diff {
  id: string;
  program: string;
  cpp: number;
  pts: number;
  oldEv: number | null;
  newEv: number;
  delta: number | null; // null when oldEv missing
}

function main() {
  const files = fs.readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  const diffs: Diff[] = [];
  let touched = 0;

  for (const file of files) {
    const fp = path.join(CARDS_DIR, file);
    const raw = fs.readFileSync(fp, "utf-8");
    const card = JSON.parse(raw);
    const wo = card.welcome_offer;
    if (!wo) continue;
    const newEv = recomputeEstimatedValue(wo.bonus_points, wo.point_program);
    if (newEv == null) continue;
    const oldEv = typeof wo.estimated_value === "number" ? wo.estimated_value : null;
    if (oldEv === newEv) continue;

    diffs.push({
      id: card.card_id,
      program: wo.point_program || "(none)",
      cpp: getCpp(wo.point_program),
      pts: Number(wo.bonus_points),
      oldEv,
      newEv,
      delta: oldEv == null ? null : newEv - oldEv,
    });

    if (apply) {
      card.welcome_offer.estimated_value = newEv;
      const trailingNl = raw.endsWith("\n") ? "\n" : "";
      fs.writeFileSync(fp, JSON.stringify(card, null, 2) + trailingNl);
      touched++;
    }
  }

  // Sort by absolute delta (biggest changes first) so the audit is useful.
  diffs.sort((a, b) => Math.abs(b.delta ?? Number.MAX_SAFE_INTEGER) - Math.abs(a.delta ?? Number.MAX_SAFE_INTEGER));

  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Cards considered: ${files.length}`);
  console.log(`Cards changed:    ${diffs.length}`);
  if (apply) console.log(`Files written:    ${touched}`);
  console.log();
  console.log(
    "id".padEnd(40) +
      " program".padEnd(28) +
      " cpp".padStart(6) +
      " pts".padStart(10) +
      " old".padStart(8) +
      " new".padStart(8) +
      " Δ".padStart(8),
  );
  for (const d of diffs.slice(0, 60)) {
    const oldStr = d.oldEv != null ? `$${d.oldEv}` : "—";
    const deltaStr = d.delta == null ? "(new)" : (d.delta > 0 ? `+${d.delta}` : `${d.delta}`);
    console.log(
      d.id.padEnd(40) +
        " " +
        d.program.slice(0, 26).padEnd(27) +
        d.cpp.toFixed(2).padStart(6) +
        " " +
        d.pts.toLocaleString().padStart(9) +
        " " +
        oldStr.padStart(7) +
        " $" +
        d.newEv.toString().padStart(6) +
        " " +
        deltaStr.padStart(7),
    );
  }
  if (diffs.length > 60) console.log(`  … and ${diffs.length - 60} more`);
}

main();
