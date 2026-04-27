/**
 * Audit data/cards/*.json to identify candidates for soft-deprecation
 * (mark deprecated=true, exclude from main listings, keep file for SEO/history).
 *
 * Categories (matching strategic discussion 2026-04-26):
 *   A. discontinued     — known discontinued/closed-to-new (already flagged or strong signal)
 *   B. store-card       — Synchrony retail / Comenity / merchant co-brand store cards
 *   C. subprime         — secured / first-progress / opensky / fair-poor credit targeting
 *   D. niche-international — Aer Lingus / Iberia / Emirates / Cathay / non-mainstream foreign airlines
 *   E. duplicate        — same product appearing under multiple card_ids
 *   F. business-niche   — long-tail business cards with low traffic potential
 *   G. keep             — mainstream, default keep
 *
 * Output: data/recurring-credits-research/card-removal-audit.json + markdown table
 *
 * Read-only. Does NOT modify data/cards/. Operator reviews + decides per card.
 */
import * as fs from "fs";
import * as path from "path";

type Bucket =
  | "A_discontinued"
  | "B_store_card"
  | "C_subprime"
  | "D_niche_international"
  | "E_duplicate_candidate"
  | "F_business_niche"
  | "G_keep";

interface CardRow {
  card_id: string;
  name: string;
  issuer: string;
  annual_fee?: number;
  bucket: Bucket;
  bucket_reason: string;
  duplicate_of?: string;
  business_card?: boolean;
  has_recurring_credits?: boolean;
  flagged_already?: string; // existing discontinued/_duplicate_of marker
}

// ============================================================
// Heuristics per bucket
// ============================================================

function detectDiscontinued(c: Record<string, unknown>): { yes: boolean; reason?: string } {
  if (c.discontinued === true) return { yes: true, reason: "already flagged discontinued=true" };
  if (typeof c.status === "string" && /^(discontinued|transferred|closed|deprecated|legacy)$/i.test(c.status as string)) {
    return { yes: true, reason: `status=${c.status}` };
  }
  if (c._duplicate_of) {
    return { yes: false }; // handled in bucket E
  }
  return { yes: false };
}

function detectStoreCard(c: Record<string, unknown>): { yes: boolean; reason?: string } {
  const id = String(c.card_id ?? "").toLowerCase();
  const name = String(c.name ?? "").toLowerCase();
  const issuer = String(c.issuer ?? "").toLowerCase();
  // Synchrony retail prefix
  if (id.startsWith("sync-")) return { yes: true, reason: `Synchrony retail prefix (id=${id})` };
  if (id.startsWith("synchrony-")) return { yes: true, reason: `Synchrony prefix` };
  // Comenity / Bread Financial
  if (issuer.includes("comenity") || issuer.includes("bread financial")) return { yes: true, reason: `issuer=${issuer}` };
  // Retailer name in card name
  const retailers = [
    /\bgap\b/, /\bold navy\b/, /\bbanana republic\b/, /\bathleta\b/,
    /\bamazon store\b/, /\bbelk\b/, /\bamerican eagle\b/,
    /\bkohl/, /\blowe/, /\bhome depot\b/,
    /\bbest buy\b/, /\bnordstrom\b/, /\btarget redcard\b/,
    /\btj maxx\b/, /\bcvs\b/,
  ];
  for (const r of retailers) {
    if (r.test(name)) return { yes: true, reason: `retailer name match: ${name}` };
  }
  return { yes: false };
}

function detectSubprime(c: Record<string, unknown>): { yes: boolean; reason?: string } {
  const id = String(c.card_id ?? "").toLowerCase();
  const name = String(c.name ?? "").toLowerCase();
  const issuer = String(c.issuer ?? "").toLowerCase();
  const credit = String(c.credit_required ?? "").toLowerCase();
  if (/secured|first.?progress|opensky|fortiva|deserve|petal|self\b/.test(id)) {
    return { yes: true, reason: `subprime/secured id pattern: ${id}` };
  }
  if (/\bsecured\b/.test(name)) {
    return { yes: true, reason: `name contains 'secured'` };
  }
  if (issuer === "first electronic bank" || issuer === "webbank" || issuer === "celtic bank") {
    // First Electronic Bank also issues Bilt — check name
    if (/bilt/.test(name)) return { yes: false };
    return { yes: true, reason: `issuer=${issuer} (typically subprime fintech)` };
  }
  if (/^(poor|fair)$/i.test(credit) && Number(c.annual_fee ?? 0) <= 50) {
    return { yes: true, reason: `credit_required=${credit} + low/no AF` };
  }
  return { yes: false };
}

function detectNicheInternational(c: Record<string, unknown>): { yes: boolean; reason?: string } {
  const name = String(c.name ?? "").toLowerCase();
  // Niche international airline co-brands (US-issued but for non-US-mainstream airlines)
  const niche = [
    /aer lingus/, /iberia/, /emirates/, /cathay/, /singapore air/,
    /air france/, /klm/, /lufthansa/, /turkish/, /etihad/, /qantas/, /qatar/,
    /asiana/, /eva air/, /korean air/, /thai airways/, /china airlines/,
    /virgin atlantic/, /aeromexico/, /avianca/, /copa/, /latam/, /tap portugal/,
    /finnair/, /icelandair/, /norwegian/, /sas\b/,
  ];
  // Mainstream international NOT to flag: Hawaiian (US territory), Alaska, Air Canada/Aeroplan
  for (const r of niche) {
    if (r.test(name)) return { yes: true, reason: `niche international airline: ${name}` };
  }
  return { yes: false };
}

function detectBusinessNiche(c: Record<string, unknown>): { yes: boolean; reason?: string } {
  const id = String(c.card_id ?? "").toLowerCase();
  const isBiz = id.includes("biz") || id.includes("business") || (Array.isArray(c.tags) && (c.tags as string[]).includes("business"));
  if (!isBiz) return { yes: false };
  const issuer = String(c.issuer ?? "").toLowerCase();
  const af = Number(c.annual_fee ?? 0);
  // Major issuers' business cards = NOT niche
  const majorBiz = ["american express", "chase", "capital one"].some((m) => issuer.includes(m));
  if (majorBiz) return { yes: false };
  // Citi business cards: AAdvantage MileUp Biz, Costco Biz — niche
  // Barclays business cards (Wyndham Biz, JetBlue Biz, etc.) — generally niche
  const nichePartners = [
    /wyndham/, /aadvantage.*mileup/, /aadvantage.*business/,
    /jetblue/, /alaska airlines.*biz/, /world of hyatt.*business/,
  ];
  for (const r of nichePartners) {
    if (r.test(id)) return { yes: true, reason: `niche partner business card: ${id} (${issuer}, $${af})` };
  }
  return { yes: false };
}

// Duplicate detection — token-based similarity with abbreviation expansion
const ID_ABBREV: Record<string, string[]> = {
  bce: ["blue", "cash", "everyday"],
  bcp: ["blue", "cash", "preferred"],
  bbp: ["blue", "business", "plus"],
  bbc: ["blue", "business", "cash"],
  biz: ["business"],
  mr: ["membership", "rewards"],
  uc: ["unlimited", "cash"],
  cc: ["custom", "cash"],
  cdc: ["customized", "cash"],
};

const NAME_NORM: Record<string, string> = {
  "american express": "amex",
  "bank of america": "boa",
  "capital one": "cap1",
  "world elite mastercard": "",
  "world elite": "",
  "credit card": "",
  "from amex": "amex",
};

function normalizeNameTokens(s: string): string[] {
  let lower = s.toLowerCase().replace(/[®™]/g, "");
  for (const [k, v] of Object.entries(NAME_NORM)) {
    lower = lower.replace(new RegExp(k, "g"), v);
  }
  return lower
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && t !== "the" && t !== "card")
    .map((t) => (ID_ABBREV[t] ? ID_ABBREV[t].join("-") : t))
    .flatMap((t) => t.split("-"))
    .filter((t) => t.length > 0);
}

function normalizeIdTokens(id: string): string[] {
  return id
    .toLowerCase()
    .split(/[-_]/)
    .flatMap((t) => (ID_ABBREV[t] ? ID_ABBREV[t] : [t]))
    .filter((t) => t.length >= 2 && t !== "the" && t !== "card");
}

function jaccard(a: Set<string>, b: Set<string>): number {
  const intersect = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersect / union;
}

function findDuplicates(
  cards: Array<{ card_id: string; name: string; issuer: string; annual_fee?: number }>,
): Map<string, string> {
  const map = new Map<string, string>();

  // Build normalized token sets per card
  const fingerprints = cards.map((c) => {
    const idTokens = normalizeIdTokens(c.card_id);
    const nameTokens = normalizeNameTokens(c.name);
    // Combined token set (id + name normalized) — stronger fingerprint than just one
    const combined = new Set([...idTokens, ...nameTokens]);
    const issuerKey = c.issuer
      .toLowerCase()
      .replace(/[^a-z]/g, "")
      .slice(0, 30);
    return { card_id: c.card_id, name: c.name, issuer: c.issuer, af: c.annual_fee, issuerKey, tokens: combined };
  });

  // Group by issuer first (most dupes share issuer)
  const byIssuer = new Map<string, typeof fingerprints>();
  for (const f of fingerprints) {
    if (!byIssuer.has(f.issuerKey)) byIssuer.set(f.issuerKey, []);
    byIssuer.get(f.issuerKey)!.push(f);
  }

  // Tier/variant markers — if exactly ONE side has these, it's a DIFFERENT product
  // (consumer vs business, regular vs student, regular vs secured, etc.)
  const VARIANT_MARKERS = [
    "business", "biz", "student", "secured", "infinite", "club",
    "premier", "preferred", "reserve", "platinum", "gold", "plus",
    "aspire", "surpass", "brilliant", "bonvoy", "boundless",
    "magnate", "prestige", "elite", "signature",
    "x", // venture-x vs venture
  ];

  function hasVariantMismatch(a: Set<string>, b: Set<string>): string | null {
    for (const m of VARIANT_MARKERS) {
      const ah = a.has(m);
      const bh = b.has(m);
      if (ah !== bh) return m; // exactly one has it
    }
    return null;
  }

  for (const [, group] of byIssuer) {
    if (group.length < 2) continue;
    // Pairwise comparison within issuer
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        const sim = jaccard(a.tokens, b.tokens);
        if (sim < 0.6) continue;

        // Variant marker mismatch = different product, skip
        const mismatch = hasVariantMismatch(a.tokens, b.tokens);
        if (mismatch) continue;

        // AF mismatch ($20+ delta or 50%+ delta) = different products
        if (
          typeof a.af === "number" &&
          typeof b.af === "number" &&
          Math.abs(a.af - b.af) > Math.max(20, Math.min(a.af, b.af) * 0.5)
        ) {
          continue;
        }
        // Pick shorter id as canonical
        const [canon, dup] =
          a.card_id.length <= b.card_id.length ? [a, b] : [b, a];
        if (!map.has(dup.card_id)) {
          map.set(dup.card_id, canon.card_id);
        }
      }
    }
  }
  return map;
}

// ============================================================
// Main
// ============================================================

function main() {
  const cardsDir = path.join(process.cwd(), "data", "cards");
  const files = fs.readdirSync(cardsDir).filter((f) => f.endsWith(".json"));

  const cards: Array<Record<string, unknown>> = [];
  for (const f of files) {
    try {
      cards.push(JSON.parse(fs.readFileSync(path.join(cardsDir, f), "utf8")));
    } catch {
      console.error(`skip ${f}: parse error`);
    }
  }

  const dupes = findDuplicates(
    cards.map((c) => ({
      card_id: c.card_id as string,
      name: c.name as string,
      issuer: c.issuer as string,
      annual_fee: c.annual_fee as number | undefined,
    })),
  );

  const rows: CardRow[] = [];
  for (const c of cards) {
    const row: CardRow = {
      card_id: c.card_id as string,
      name: c.name as string,
      issuer: c.issuer as string,
      annual_fee: c.annual_fee as number | undefined,
      bucket: "G_keep",
      bucket_reason: "mainstream / default keep",
      business_card: typeof c.card_id === "string" && (/biz|business/.test(c.card_id as string) || (Array.isArray(c.tags) && (c.tags as string[]).includes("business"))),
      has_recurring_credits: Array.isArray(c.recurring_credits) && (c.recurring_credits as unknown[]).length > 0,
    };

    // Existing flags
    if (c.discontinued === true) row.flagged_already = "discontinued=true";
    else if (c.status === "transferred") row.flagged_already = "status=transferred";
    else if (c._duplicate_of) row.flagged_already = `_duplicate_of=${c._duplicate_of}`;

    // Apply detectors in order — first match wins
    const a = detectDiscontinued(c);
    if (a.yes) {
      row.bucket = "A_discontinued";
      row.bucket_reason = a.reason!;
      rows.push(row);
      continue;
    }
    const dupCanonical = dupes.get(c.card_id as string);
    if (dupCanonical) {
      row.bucket = "E_duplicate_candidate";
      row.bucket_reason = `same name+issuer as ${dupCanonical}`;
      row.duplicate_of = dupCanonical;
      rows.push(row);
      continue;
    }
    const b = detectStoreCard(c);
    if (b.yes) {
      row.bucket = "B_store_card";
      row.bucket_reason = b.reason!;
      rows.push(row);
      continue;
    }
    const cc = detectSubprime(c);
    if (cc.yes) {
      row.bucket = "C_subprime";
      row.bucket_reason = cc.reason!;
      rows.push(row);
      continue;
    }
    const d = detectNicheInternational(c);
    if (d.yes) {
      row.bucket = "D_niche_international";
      row.bucket_reason = d.reason!;
      rows.push(row);
      continue;
    }
    const f = detectBusinessNiche(c);
    if (f.yes) {
      row.bucket = "F_business_niche";
      row.bucket_reason = f.reason!;
      rows.push(row);
      continue;
    }
    rows.push(row);
  }

  const summary: Record<Bucket, number> = {
    A_discontinued: 0,
    B_store_card: 0,
    C_subprime: 0,
    D_niche_international: 0,
    E_duplicate_candidate: 0,
    F_business_niche: 0,
    G_keep: 0,
  };
  for (const r of rows) summary[r.bucket]++;

  // Output
  const outDir = path.join(process.cwd(), "data", "recurring-credits-research");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "card-removal-audit.json"),
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        total_cards: rows.length,
        summary,
        rows,
      },
      null,
      2,
    ),
  );

  // Markdown report
  const mdLines: string[] = [];
  mdLines.push(`# Card Removal Audit — ${new Date().toISOString().slice(0, 10)}`);
  mdLines.push("");
  mdLines.push(`Total cards: **${rows.length}**`);
  mdLines.push("");
  mdLines.push(`| Bucket | Count | Disposition |`);
  mdLines.push(`|---|---|---|`);
  mdLines.push(`| A. Discontinued / closed | ${summary.A_discontinued} | already partly flagged |`);
  mdLines.push(`| B. Store cards | ${summary.B_store_card} | recommend soft-deprecate |`);
  mdLines.push(`| C. Subprime / secured | ${summary.C_subprime} | recommend keep 1-2 representative, soft-deprecate rest |`);
  mdLines.push(`| D. Niche international | ${summary.D_niche_international} | recommend soft-deprecate |`);
  mdLines.push(`| E. Duplicate candidates | ${summary.E_duplicate_candidate} | recommend dedup (keep canonical) |`);
  mdLines.push(`| F. Business niche | ${summary.F_business_niche} | recommend soft-deprecate |`);
  mdLines.push(`| G. Keep (mainstream) | ${summary.G_keep} | keep |`);
  mdLines.push("");

  const buckets: Bucket[] = ["A_discontinued", "B_store_card", "C_subprime", "D_niche_international", "E_duplicate_candidate", "F_business_niche"];
  for (const b of buckets) {
    const inB = rows.filter((r) => r.bucket === b);
    if (inB.length === 0) continue;
    mdLines.push(`## ${b} (${inB.length})`);
    mdLines.push("");
    mdLines.push(`| card_id | name | issuer | AF | already flagged | reason |`);
    mdLines.push(`|---|---|---|---|---|---|`);
    for (const r of inB.sort((x, y) => x.card_id.localeCompare(y.card_id))) {
      mdLines.push(`| \`${r.card_id}\` | ${r.name} | ${r.issuer} | $${r.annual_fee ?? "?"} | ${r.flagged_already ?? "-"} | ${r.bucket_reason} |`);
    }
    mdLines.push("");
  }

  fs.writeFileSync(path.join(outDir, "card-removal-audit.md"), mdLines.join("\n"));

  // Console
  console.log(`📊 Card removal audit — ${rows.length} cards`);
  console.log();
  for (const [k, v] of Object.entries(summary)) {
    console.log(`   ${k.padEnd(28)} ${v}`);
  }
  console.log();
  console.log(`✅ Written:`);
  console.log(`   data/recurring-credits-research/card-removal-audit.json`);
  console.log(`   data/recurring-credits-research/card-removal-audit.md`);
  console.log();
  console.log(`Next: review the .md file, mark which cards in each bucket to soft-deprecate.`);
}

main();
