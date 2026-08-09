#!/usr/bin/env node

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import path from "node:path";

const API_URL = "https://api.minimax.io/anthropic/v1/messages";
const MODEL = "MiniMax-M2.7";
const ROOT = process.cwd();

const guides = [
  "cash-back-vs-travel-points",
  "first-credit-card-guide",
  "credit-card-travel-protections-guide",
  "premium-travel-card-comparison-framework",
  "credit-utilization-guide",
  "downgrade-vs-cancel-credit-card",
  "foreign-transaction-fees-and-dcc",
  "authorized-user-guide",
  "credit-card-application-sequencing",
  "credit-card-portfolio-guide",
  "credit-card-benefit-tracking-system",
  "welcome-bonus-minimum-spend-planning",
  "credit-card-payment-priority-guide",
  "balance-transfer-credit-card-guide",
  "credit-card-rental-car-insurance-guide",
  "transfer-credit-card-points-guide",
  "statement-balance-vs-current-balance",
  "credit-card-purchase-protection-guide",
  "credit-card-retention-offer-guide",
  "airport-lounge-access-guide",
];

const localeInstructions = {
  zh: "Translate into natural Traditional Chinese as used in Taiwan. Use established Taiwan credit-card terminology. Do not insert spaces between Chinese words.",
  "zh-cn": "Translate into natural Simplified Chinese. Use established Mainland Chinese credit-card terminology. Do not insert spaces between Chinese words.",
  es: "Translate into clear neutral Spanish suitable for readers across the United States and Latin America.",
};

function parseArgs() {
  const localeArg = process.argv.find((arg) => arg.startsWith("--locale="));
  const locale = localeArg?.split("=")[1];
  const overwrite = process.argv.includes("--overwrite");
  const fromZhCn = process.argv.includes("--from-zh-cn");
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : guides.length;
  if (!localeInstructions[locale]) {
    throw new Error("Use --locale=zh, --locale=zh-cn, or --locale=es");
  }
  return { locale, overwrite, limit, fromZhCn };
}

async function loadEnvKey() {
  if (process.env.MINIMAX_API_KEY) return process.env.MINIMAX_API_KEY;
  const envText = await readFile(path.join(ROOT, ".env.local"), "utf8");
  const match = envText.match(/^MINIMAX_API_KEY=["']?([^"'\n]+)["']?$/m);
  if (!match) throw new Error("MINIMAX_API_KEY is not configured");
  return match[1];
}

function cleanOutput(text) {
  let value = text.trim();
  value = value.replace(/^```(?:mdx|markdown)?\s*/i, "").replace(/\s*```$/, "").trim();
  const start = value.indexOf("export const metadata");
  if (start > 0) value = value.slice(start);
  return `${value}\n`;
}

function localizeInternalLinks(text, locale) {
  return text.replaceAll("/en/guides/", `/${locale}/guides/`);
}

function validateTranslation(text, slug, locale) {
  const required = [
    "export const metadata",
    `slug: \"${slug}\"`,
    "title:",
    "summary:",
    "published:",
    "updated:",
    "word_count:",
    "# ",
  ];
  for (const marker of required) {
    if (!text.includes(marker)) throw new Error(`${slug}/${locale}: missing ${marker}`);
  }
  const headings = text.match(/^## /gm)?.length || 0;
  const sourceLinks = text.match(/\]\(\/en\/guides\//g)?.length || 0;
  if (headings < 5) throw new Error(`${slug}/${locale}: only ${headings} H2 headings`);
  const minimumChars = locale.startsWith("zh") ? 2200 : 3500;
  if (text.length < minimumChars) {
    throw new Error(`${slug}/${locale}: output is unexpectedly short (${text.length} chars)`);
  }
  if (locale.startsWith("zh") && !/[\u3400-\u9fff]/.test(text)) {
    throw new Error(`${slug}/${locale}: Chinese text not detected`);
  }
  if (locale === "es" && !/\b(la|el|los|las|una|para|tarjeta)\b/i.test(text)) {
    throw new Error(`${slug}/${locale}: Spanish text not detected`);
  }
  const bodyLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 80 && !line.startsWith("export "));
  const duplicates = bodyLines.filter((line, index) => bodyLines.indexOf(line) !== index);
  if (duplicates.length) throw new Error(`${slug}/${locale}: repeated long paragraphs detected`);
  return { headings, sourceLinks, chars: text.length };
}

async function translate(apiKey, source, slug, locale) {
  const prompt = `You are the senior editor for OpenCard, a US credit-card education website.

${localeInstructions[locale]}

Translate the complete MDX document below. Requirements:
- Preserve the exact slug, published date, updated date, Markdown hierarchy, bullet structure, emphasis, and every URL.
- Translate title, summary, headings, prose, link labels, and tags or explanatory text.
- Keep the metadata object valid JavaScript and keep word_count as the source value for registry consistency.
- Preserve technical distinctions involving APR, grace periods, statement credits, insurance, liability, issuer rules, and claims.
- Do not summarize, omit, add repetitive filler, or add translator commentary.
- Do not translate brand names, product names, paths, or URLs.
- Output only the complete translated MDX, beginning with "export const metadata". Do not use a code fence.

SOURCE MDX:
${source}`;

  const response = await fetch(API_URL, {
    signal: AbortSignal.timeout(120_000),
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 12000,
      temperature: 0.15,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) {
    throw new Error(`${slug}/${locale}: API ${response.status} ${await response.text()}`);
  }
  const payload = await response.json();
  const raw = payload.content?.map((part) => part.text || "").join("") || "";
  const output = localizeInternalLinks(cleanOutput(raw), locale);
  validateTranslation(output, slug, locale);
  return output;
}

async function main() {
  const { locale, overwrite, limit, fromZhCn } = parseArgs();
  const apiKey = await loadEnvKey();
  const selected = guides.slice(0, limit);
  const targetDir = path.join(ROOT, "content", "guides", locale);
  await mkdir(targetDir, { recursive: true });

  for (const [index, slug] of selected.entries()) {
    const sourcePath = fromZhCn && locale === "zh"
      ? path.join(ROOT, "content", "guides", "zh-cn", `${slug}.mdx`)
      : path.join(ROOT, "content", "guides", `${slug}.mdx`);
    const targetPath = path.join(targetDir, `${slug}.mdx`);
    if (!overwrite) {
      try {
        await access(targetPath);
        console.log(`[${index + 1}/${selected.length}] skip ${locale}/${slug}`);
        continue;
      } catch {}
    }
    console.log(`[${index + 1}/${selected.length}] translate ${locale}/${slug}`);
    const source = await readFile(sourcePath, "utf8");
    let translated;
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        translated = await translate(apiKey, source, slug, locale);
        break;
      } catch (error) {
        lastError = error;
        console.warn(`  attempt ${attempt}/3 failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (!translated) throw lastError;
    await writeFile(targetPath, translated, "utf8");
    const metrics = validateTranslation(translated, slug, locale);
    console.log(`  wrote ${metrics.chars} chars, ${metrics.headings} H2s`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
