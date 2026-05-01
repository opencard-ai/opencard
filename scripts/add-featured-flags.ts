/**
 * One-shot: stamp `featured: true` onto a curated list of iconic cards so
 * they pin to the top of their tier in the cards-section default view.
 *
 * Idempotent — re-running is safe; entries already featured stay featured.
 * Cards not present in the catalog are reported but not fatal.
 */
import * as fs from "fs";
import * as path from "path";

const CARDS_DIR = path.join(process.cwd(), "data/cards");

const FEATURED_IDS: string[] = [
  // 💎 Premium
  "amex-platinum",
  "amex-gold",
  "amex-biz-platinum",
  "amex-biz-gold",
  "chase-sapphire-reserve",
  "chase-sapphire-reserve-biz",
  "capital-one-venture-x",
  "amex-hilton-honors-aspire",
  "citi-strata-elite",
  "amex-marriott-brilliant",
  // ✓ No Annual Fee
  "chase-freedom-unlimited",
  "chase-freedom-flex",
  "capital-one-savorone",
  "wells-fargo-active-cash",
  "discover-it",
  // 🏢 Business
  "chase-ink-biz-preferred",
  "chase-ink-biz-cash",
  "chase-ink-biz-unlimited",
  "amex-blue-biz-plus",
  "amex-blue-biz-cash",
];

function pathFor(id: string): string {
  return path.join(CARDS_DIR, `${id}.json`);
}

function main() {
  let stamped = 0;
  let alreadySet = 0;
  const missing: string[] = [];

  for (const id of FEATURED_IDS) {
    const fp = pathFor(id);
    if (!fs.existsSync(fp)) {
      missing.push(id);
      continue;
    }
    const raw = fs.readFileSync(fp, "utf-8");
    const card = JSON.parse(raw);
    if (card.featured === true) {
      alreadySet++;
      continue;
    }
    card.featured = true;
    const trailingNl = raw.endsWith("\n") ? "\n" : "";
    fs.writeFileSync(fp, JSON.stringify(card, null, 2) + trailingNl);
    stamped++;
  }

  console.log("=== add-featured-flags ===");
  console.log(`Newly featured:        ${stamped}`);
  console.log(`Already featured:      ${alreadySet}`);
  console.log(`Missing from catalog:  ${missing.length}`);
  if (missing.length > 0) {
    console.log("  " + missing.join("\n  "));
  }
}

main();
