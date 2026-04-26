/**
 * CFPB Schumer Box extraction — single PDF runner.
 *
 * Replaces archive/run_extractor_v2.py..v6.py + archive/schumer_extractor_v2.py
 * with an LLM-based pipeline that writes through the fact store.
 *
 * Usage:
 *   # Single local PDF (e.g. one cached in data/cfpb-cache/)
 *   npx tsx scripts/pipelines/cfpb/extract.ts \
 *     --pdf data/cfpb-cache/amex-platinum.pdf \
 *     --card-id amex-platinum \
 *     --quarter "Q3 2025" \
 *     --source-url "https://files.consumerfinance.gov/.../platinum-cardmember-agreement.pdf"
 *
 *   # Dry run (no fact store write)
 *   npx tsx scripts/pipelines/cfpb/extract.ts --pdf X --card-id Y --dry-run
 *
 * What this does NOT do (yet):
 *   - Crawl CFPB by issuer (TODO Week 2)
 *   - Match unfamiliar PDFs to OpenCard card_id via fuzzy name match (TODO)
 *   - Skip PDFs whose hash hasn't changed since last quarter (TODO)
 *
 * What it DOES do:
 *   - Read one PDF
 *   - Reject if Spanish or empty
 *   - Run LLM extraction (MiniMax)
 *   - Per-field validation + sanity gate
 *   - Emit one FactEvent per non-null field via lib/fact-store.ts ingestFact()
 *   - Print what was accepted / queued for review / rejected
 */
import * as fs from "fs";
import * as crypto from "crypto";
import * as path from "path";
import { readPdf, isLikelySpanishFromFilename } from "./lib/pdf-text";
import { extractSchumerBox, fieldPathsFromExtraction } from "./lib/schumer-llm";
import { ingestFact, type ExtractionMethod } from "../../../lib/fact-store";

interface CliArgs {
  pdf: string;
  cardId: string;
  quarter?: string;
  sourceUrl?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case "--pdf":
        args.pdf = next;
        i++;
        break;
      case "--card-id":
        args.cardId = next;
        i++;
        break;
      case "--quarter":
        args.quarter = next;
        i++;
        break;
      case "--source-url":
        args.sourceUrl = next;
        i++;
        break;
      case "--dry-run":
        args.dryRun = true;
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
    }
  }
  if (!args.pdf || !args.cardId) {
    printHelp();
    process.exit(1);
  }
  return args as CliArgs;
}

function printHelp() {
  console.log(`Usage: extract.ts --pdf <path> --card-id <id> [options]

Required:
  --pdf <path>          Path to a CFPB cardmember agreement PDF
  --card-id <id>        OpenCard card_id this PDF maps to (e.g. amex-platinum)

Optional:
  --quarter <q>         e.g. "Q3 2025" — for provenance metadata
  --source-url <url>    Original CFPB URL — for provenance metadata
  --dry-run             Run LLM, validate, but don't write to fact store
`);
}

function loadCardName(cardId: string): string | undefined {
  // Find the data/cards/*.json whose card_id matches
  const dir = path.join(process.cwd(), "data", "cards");
  if (!fs.existsSync(dir)) return undefined;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".json")) continue;
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      if (c.card_id === cardId) return c.name as string;
    } catch {
      /* skip */
    }
  }
  return undefined;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log(`📄 Extract Schumer Box  ${args.dryRun ? "(DRY RUN)" : ""}`);
  console.log(`   PDF:     ${args.pdf}`);
  console.log(`   Card ID: ${args.cardId}`);
  if (args.quarter) console.log(`   Quarter: ${args.quarter}`);

  if (!fs.existsSync(args.pdf)) {
    console.error(`❌ PDF not found: ${args.pdf}`);
    process.exit(1);
  }

  if (isLikelySpanishFromFilename(args.pdf)) {
    console.error(`⏭  Skipping: filename suggests Spanish CFPB filing.`);
    process.exit(0);
  }

  // Read + parse PDF
  const pdfResult = await readPdf(args.pdf);
  console.log(`   ${pdfResult.page_count} pages, ${pdfResult.size_bytes} bytes, language=${pdfResult.language}`);

  if (pdfResult.language === "spanish") {
    console.error(`⏭  Skipping: PDF contents appear to be Spanish.`);
    process.exit(0);
  }
  if (pdfResult.text.length < 200) {
    console.error(`❌ PDF text too short (${pdfResult.text.length} chars). Likely image-only / scanned. Needs OCR (not in scope yet).`);
    process.exit(2);
  }

  // Hash PDF content for provenance
  const fileBuf = fs.readFileSync(args.pdf);
  const contentHash = crypto.createHash("sha256").update(fileBuf).digest("hex");

  // LLM extract
  console.log(`🤖 Calling MiniMax...`);
  const extraction = await extractSchumerBox(pdfResult.text);
  console.log(`   confidence: ${extraction.confidence.toFixed(2)}`);
  if (extraction.usage) {
    console.log(`   tokens:     ${extraction.usage.total_tokens ?? "?"} (in: ${extraction.usage.prompt_tokens ?? "?"}, out: ${extraction.usage.completion_tokens ?? "?"})`);
  }
  console.log(`   canonical:  ${extraction.fields.card_canonical_name ?? "(none)"}`);

  // Per-field summary
  console.log();
  console.log(`📋 Extracted fields:`);
  for (const [field, val] of Object.entries(extraction.fields)) {
    if (field === "notes" || field === "card_canonical_name") continue;
    const v = extraction.validation[field as keyof typeof extraction.validation];
    const ok = v?.ok ?? true;
    const flag = val === null ? "·" : ok ? "✓" : "✗";
    const shown = val === null ? "—" : String(val);
    const reason = v && !v.ok ? `  ⚠ ${v.reason}` : "";
    console.log(`   ${flag}  ${field.padEnd(28)} ${shown}${reason}`);
  }

  if (extraction.fields.notes) {
    console.log(`   notes: ${extraction.fields.notes}`);
  }

  // Build the field-path → value list
  const facts = fieldPathsFromExtraction(extraction.fields);
  if (facts.length === 0) {
    console.warn(`⚠️  No usable fields extracted. Nothing to ingest.`);
    process.exit(0);
  }

  if (args.dryRun) {
    console.log();
    console.log(`💤 Dry run — not writing to fact store.`);
    console.log(`   Would emit ${facts.length} FactEvent(s).`);
    process.exit(0);
  }

  // Look up card name for sanity-gate context (premium-name detection)
  const cardName = loadCardName(args.cardId);
  if (!cardName) {
    console.warn(`⚠️  No card found for card_id=${args.cardId}. Sanity gate may miss premium-name check.`);
  }

  // Write to fact store
  console.log();
  console.log(`💾 Writing to fact store...`);
  const extractedBy: ExtractionMethod = "llm:minimax";
  let accepted = 0;
  let queued = 0;
  let failed = 0;
  for (const { field_path, value } of facts) {
    const result = await ingestFact(
      {
        card_id: args.cardId,
        field_path,
        value,
        source: {
          type: "cfpb_ccad",
          url: args.sourceUrl,
          quarter: args.quarter,
          fetched_at: new Date().toISOString(),
          content_hash: contentHash,
        },
        confidence: extraction.confidence,
        extracted_by: extractedBy,
      },
      { card_name: cardName },
    );
    if (result.accepted) {
      accepted++;
      console.log(`   ✓ ${field_path} = ${JSON.stringify(value)}`);
    } else if (result.reviewQueued) {
      queued++;
      console.log(`   ⚠ ${field_path} → REVIEW QUEUE (${result.reason})`);
    } else {
      failed++;
      console.log(`   ✗ ${field_path} FAILED (${result.reason})`);
    }
  }

  console.log();
  console.log(`📊 ${accepted} accepted, ${queued} queued for review, ${failed} failed.`);
  console.log(`   Run \`npm run facts:promote:dry\` to preview the merged data/cards/*.json change.`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
