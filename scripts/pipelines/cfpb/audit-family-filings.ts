/**
 * Audit cached CFPB PDFs to classify them as:
 *   - single-card     (one card's Schumer Box)
 *   - family-filing   (one filing covers multiple cards in a family — same agreement
 *                      with per-card values shown side-by-side, or as a range)
 *   - empty-scanned   (PDF text < 200 chars, needs OCR)
 *   - spanish         (Spanish-language filing)
 *   - parse-error     (pdf-parse couldn't read; likely XFA/encrypted/v2.0)
 *
 * Why: Family-filing PDFs are the #1 root cause of bad extraction —
 * the LLM picks the family max (e.g. boa-platinum FX=3% from a 0-3% range)
 * and writes it as the per-card value. Step 1 of the fix is knowing which
 * PDFs are which.
 *
 * Output: writes JSON report to scripts/pipelines/cfpb/config/family-filing-audit.json
 *         and prints a summary table to stdout.
 *
 * Usage:
 *   npx tsx scripts/pipelines/cfpb/audit-family-filings.ts
 *   npx tsx scripts/pipelines/cfpb/audit-family-filings.ts --pdf-dir data/cfpb-cache
 *   npx tsx scripts/pipelines/cfpb/audit-family-filings.ts --json-only
 */
import * as fs from "fs";
import * as path from "path";
import { readPdf } from "./lib/pdf-text";

type Classification =
  | "single-card"
  | "family-filing"
  | "empty-scanned"
  | "spanish"
  | "parse-error";

interface AuditEntry {
  filename: string;
  size_bytes: number;
  page_count: number;
  text_length: number;
  classification: Classification;
  signals: {
    family_markers: string[];
    fee_ranges: string[];
    pct_ranges: string[];
    distinct_card_names: string[];
    annual_fee_mentions: number;
    apr_lines: number;
  };
  reason: string;
}

interface AuditReport {
  generated_at: string;
  pdf_dir: string;
  total_pdfs: number;
  by_classification: Record<Classification, number>;
  entries: AuditEntry[];
}

// Phrases that strongly suggest a single PDF documents multiple cards
// in a family (BoA, Capital One, Synchrony, U.S. Bank-issued retail cards
// often look like this).
const FAMILY_MARKERS = [
  /each of the following (?:cards|accounts)/i,
  /this agreement (?:covers|applies to) (?:the following|several|multiple)/i,
  /depending on (?:the type of card|your card|your account|which card|the card)/i,
  /(?:applies|apply) only to (?:the )?(?:cards?|accounts?) (?:listed|shown)/i,
  /the chart below (?:shows|lists|provides)/i,
  /your card type/i,
  /var(?:ies|y) (?:by|with) (?:your |the )?card/i,
  /shows? a range of terms/i,
  /different (?:rates?|fees?|terms?) (?:for|based on)/i,
];

// Fee range: "$X to $Y", "Between $X and $Y", "$X-$Y" but only if
// it sits within ~40 chars of fee/penalty/cash-advance/transaction context.
// We REJECT credit-limit ranges (typically $1000+) and comma-split artifacts
// like "$2,900 - $29" by requiring the second value to be reasonable.
const FEE_RANGE_RES = [
  /\b(?:between\s+)?\$\s?(\d{1,4}(?:\.\d{1,2})?)\s*(?:to|and|-|–|—)\s*\$?\s?(\d{1,4}(?:\.\d{1,2})?)\b/gi,
];

// Percent range: "0% to 5%", "Between 25.74% and 29.74%"
const PCT_RANGE_RE =
  /(?:between\s+)?(\d{1,2}(?:\.\d{1,2})?)\s?%\s*(?:to|and|-|–|—)\s*(\d{1,2}(?:\.\d{1,2})?)\s?%/gi;

const ANNUAL_FEE_RE = /annual\s+(?:membership\s+)?fee/gi;
const APR_LINE_RE =
  /\b(?:apr|annual percentage rate)\b.{0,40}?\d+(?:\.\d+)?\s?%/gi;

/**
 * Load known card names from data/cards/*.json — used to count distinct
 * card mentions in a PDF head (a key family-filing signal).
 */
function loadKnownCardNames(): Map<string, string> {
  const dir = path.join(process.cwd(), "data", "cards");
  const map = new Map<string, string>(); // normalized name → card_id
  if (!fs.existsSync(dir)) return map;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (typeof c.name !== "string") continue;
      // Normalize: strip ®/™, collapse spaces, lowercase. Keep ≥10 chars
      // to avoid generic "Visa" / "Card" matches.
      const norm = c.name
        .replace(/[®™]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
      if (norm.length >= 10) map.set(norm, c.card_id);
    } catch {
      /* skip bad JSON */
    }
  }
  return map;
}

function findDistinctCardMentions(
  text: string,
  knownCards: Map<string, string>,
): string[] {
  const head = text.slice(0, 4000).toLowerCase();
  const found = new Set<string>();
  for (const [name, cardId] of knownCards) {
    // Allow some flexibility: "Bank of America Platinum Mastercard" should
    // match "BoA Platinum Mastercard" loosely; for now require exact normalized
    // substring match. Good enough as a signal.
    if (head.includes(name)) found.add(cardId);
  }
  return Array.from(found);
}

/**
 * Filter regex matches to drop false positives:
 *   - "$2,900 - $29" — comma-split artifact
 *   - "$1000 - $2000" — credit limit, not a fee
 *   - second value < first / 10 → almost certainly artifact
 */
function isLikelyFeeRange(low: number, high: number): boolean {
  if (low > 1000 && high > 1000) return false; // credit limit territory
  if (low > 200 && high < low / 10) return false; // comma-split
  if (high < low) return false; // descending — artifact
  if (high === low) return false; // not a range
  return true;
}

function classify(
  text: string,
  page_count: number,
  knownCards: Map<string, string>,
): {
  classification: Classification;
  signals: AuditEntry["signals"];
  reason: string;
} {
  const lower = text.toLowerCase();
  const signals: AuditEntry["signals"] = {
    family_markers: [],
    fee_ranges: [],
    pct_ranges: [],
    distinct_card_names: [],
    annual_fee_mentions: 0,
    apr_lines: 0,
  };

  if (text.length < 200) {
    return {
      classification: "empty-scanned",
      signals,
      reason: `text length ${text.length} chars — likely scanned/image-only`,
    };
  }

  // Spanish check
  const spanishHits = [
    "contrato de cuenta",
    "tarjeta de crédito",
    "tasa de porcentaje anual",
  ].filter((s) => lower.includes(s)).length;
  if (spanishHits >= 2) {
    return {
      classification: "spanish",
      signals,
      reason: `Spanish hits: ${spanishHits}`,
    };
  }

  // Family-marker phrases
  for (const re of FAMILY_MARKERS) {
    const m = text.match(re);
    if (m) signals.family_markers.push(m[0]);
  }

  // Fee ranges (filtered for false positives)
  for (const re of FEE_RANGE_RES) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      const low = Number(m[1]);
      const high = Number(m[2]);
      if (isLikelyFeeRange(low, high)) signals.fee_ranges.push(m[0]);
      if (signals.fee_ranges.length >= 8) break;
    }
  }
  signals.fee_ranges = Array.from(new Set(signals.fee_ranges));

  // Percent ranges
  {
    let m: RegExpExecArray | null;
    PCT_RANGE_RE.lastIndex = 0;
    while ((m = PCT_RANGE_RE.exec(text)) !== null) {
      const low = Number(m[1]);
      const high = Number(m[2]);
      if (high > low && high <= 50) signals.pct_ranges.push(m[0]);
      if (signals.pct_ranges.length >= 8) break;
    }
  }
  signals.pct_ranges = Array.from(new Set(signals.pct_ranges));

  // Distinct known card names mentioned in head
  signals.distinct_card_names = findDistinctCardMentions(text, knownCards);

  signals.annual_fee_mentions = (text.match(ANNUAL_FEE_RE) ?? []).length;
  signals.apr_lines = (text.match(APR_LINE_RE) ?? []).length;

  // Decision
  const hasFamilyMarker = signals.family_markers.length >= 1;
  const hasFeeRange = signals.fee_ranges.length >= 1;
  const hasPctRange = signals.pct_ranges.length >= 1;
  const multiCardNames = signals.distinct_card_names.length >= 2;

  // Strong family signal: 2+ distinct card names in head
  if (multiCardNames) {
    return {
      classification: "family-filing",
      signals,
      reason: `${signals.distinct_card_names.length} distinct card names in head: ${signals.distinct_card_names.slice(0, 3).join(", ")}`,
    };
  }

  // Family marker + any range
  if (hasFamilyMarker && (hasFeeRange || hasPctRange)) {
    return {
      classification: "family-filing",
      signals,
      reason: `family marker (${signals.family_markers[0]}) + ${
        hasFeeRange ? "fee range" : "pct range"
      }`,
    };
  }

  // Multiple family markers alone
  if (signals.family_markers.length >= 2) {
    return {
      classification: "family-filing",
      signals,
      reason: `${signals.family_markers.length} family markers`,
    };
  }

  // NOTE: previously also triggered on "fee_range + pct_range alone".
  // Removed because single-card filings have credit-tiered APR ranges
  // (e.g. "17.99% to 34.99% based on creditworthiness") which are NOT
  // family signals. Better to under-classify and surface ambiguous cases
  // for manual review than to false-positive.

  return {
    classification: "single-card",
    signals,
    reason: "no strong family signals",
  };
}

async function auditOne(
  filepath: string,
  knownCards: Map<string, string>,
): Promise<AuditEntry> {
  const filename = path.basename(filepath);
  try {
    const r = await readPdf(filepath);
    const c = classify(r.text, r.page_count, knownCards);
    return {
      filename,
      size_bytes: r.size_bytes,
      page_count: r.page_count,
      text_length: r.text.length,
      classification: c.classification,
      signals: c.signals,
      reason: c.reason,
    };
  } catch (err) {
    return {
      filename,
      size_bytes: 0,
      page_count: 0,
      text_length: 0,
      classification: "parse-error",
      signals: {
        family_markers: [],
        fee_ranges: [],
        pct_ranges: [],
        distinct_card_names: [],
        annual_fee_mentions: 0,
        apr_lines: 0,
      },
      reason: `parse error: ${(err as Error).message}`,
    };
  }
}

function parseArgs(argv: string[]): { pdfDir: string; jsonOnly: boolean } {
  let pdfDir = path.join(process.cwd(), "data", "cfpb-cache");
  let jsonOnly = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pdf-dir") {
      pdfDir = argv[i + 1];
      i++;
    } else if (argv[i] === "--json-only") {
      jsonOnly = true;
    }
  }
  return { pdfDir, jsonOnly };
}

async function main() {
  const { pdfDir, jsonOnly } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(pdfDir)) {
    console.error(`❌ pdf-dir not found: ${pdfDir}`);
    process.exit(1);
  }

  const knownCards = loadKnownCardNames();
  if (!jsonOnly) {
    console.log(`📚 Loaded ${knownCards.size} card names from data/cards/`);
  }

  const pdfs = fs
    .readdirSync(pdfDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

  if (!jsonOnly) {
    console.log(`🔍 Auditing ${pdfs.length} PDFs in ${pdfDir} ...`);
  }

  const entries: AuditEntry[] = [];
  for (let i = 0; i < pdfs.length; i++) {
    const f = pdfs[i];
    if (!jsonOnly && i % 10 === 0) {
      process.stderr.write(`   [${i}/${pdfs.length}] ${f}\n`);
    }
    const entry = await auditOne(path.join(pdfDir, f), knownCards);
    entries.push(entry);
  }

  const byClass: Record<Classification, number> = {
    "single-card": 0,
    "family-filing": 0,
    "empty-scanned": 0,
    "spanish": 0,
    "parse-error": 0,
  };
  for (const e of entries) byClass[e.classification]++;

  const report: AuditReport = {
    generated_at: new Date().toISOString(),
    pdf_dir: pdfDir,
    total_pdfs: pdfs.length,
    by_classification: byClass,
    entries,
  };

  const outPath = path.join(
    process.cwd(),
    "scripts/pipelines/cfpb/config/family-filing-audit.json",
  );
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2));
    return;
  }

  console.log();
  console.log(`📊 Classification summary:`);
  for (const [k, v] of Object.entries(byClass)) {
    console.log(`   ${String(k).padEnd(16)} ${v}`);
  }
  console.log();
  console.log(`📁 Family-filing PDFs:`);
  const families = entries.filter((e) => e.classification === "family-filing");
  for (const e of families) {
    const cards = e.signals.distinct_card_names;
    const range = e.signals.fee_ranges[0] ?? e.signals.pct_ranges[0] ?? "—";
    const marker = e.signals.family_markers[0] ?? "—";
    console.log(
      `   ${e.filename}\n      reason: ${e.reason}\n      cards: ${cards.length > 0 ? cards.slice(0, 4).join(", ") : "(none matched)"}\n      example range: ${range}\n      marker: ${marker}`,
    );
  }
  console.log();
  console.log(`📁 Empty / scanned PDFs (need OCR):`);
  for (const e of entries.filter((x) => x.classification === "empty-scanned")) {
    console.log(`   ${e.filename}  (${e.text_length} chars)`);
  }
  console.log();
  console.log(`✅ Report written to ${outPath}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
