/**
 * Dump first 3KB of a PDF's text. Diagnostic helper for tuning the
 * family-filing classifier.
 *
 * Usage: npx tsx scripts/pipelines/cfpb/dump-pdf-head.ts <pdf-path> [chars]
 */
import { readPdf } from "./lib/pdf-text";

async function main() {
  const pdfPath = process.argv[2];
  const chars = Number(process.argv[3] ?? 3000);
  if (!pdfPath) {
    console.error("Usage: dump-pdf-head.ts <pdf> [chars]");
    process.exit(1);
  }
  const r = await readPdf(pdfPath);
  console.log(`pages=${r.page_count}  text_len=${r.text.length}  language=${r.language}`);
  console.log("---HEAD---");
  console.log(r.text.slice(0, chars));
  console.log("---END---");
}
main().catch((e) => { console.error(e); process.exit(2); });
