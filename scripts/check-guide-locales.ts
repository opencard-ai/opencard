#!/usr/bin/env tsx
import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import guideLocalizationData from "../data/guide-localizations.json";

const slugs = Object.keys(guideLocalizationData);
const legacyGeneratedSlugs = new Set([
  "credit-card-benefit-expiration-guide",
  "credit-card-annual-fee-worth-it",
  "new-credit-card-onboarding-checklist",
  "credit-card-points-valuation-guide",
  "premium-card-overlap-hidden-costs",
]);
const locales = ["en", "zh", "zh-cn", "es"];
const minWords: Record<string, number> = { en: 900, es: 900 };
const minCjkChars: Record<string, number> = { zh: 1400, "zh-cn": 1400 };

function fileFor(locale: string, slug: string) {
  return locale === "en"
    ? path.join("content", "guides", `${slug}.mdx`)
    : path.join("content", "guides", locale, `${slug}.mdx`);
}

let failed = false;
for (const locale of locales) {
  for (const slug of slugs) {
    const file = fileFor(locale, slug);
    if (!existsSync(file)) {
      console.error(`missing ${locale}/${slug}: ${file}`);
      failed = true;
      continue;
    }
    const text = readFileSync(file, "utf8");
    const words = text.split(/\s+/).filter(Boolean).length;
    const cjkChars = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const hasMetadata = text.includes("export const metadata") && text.includes(`slug: "${slug}"`);
    if (!hasMetadata) {
      console.error(`metadata missing or wrong slug: ${file}`);
      failed = true;
    }
    const longLines = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 80 && !line.startsWith("export "));
    const duplicateLongLines = longLines.filter((line, index) => longLines.indexOf(line) !== index);
    if (duplicateLongLines.length && !legacyGeneratedSlugs.has(slug)) {
      console.error(`repeated long paragraphs ${locale}/${slug}: ${duplicateLongLines.length}`);
      failed = true;
    }
    if (locale !== "en" && text.includes("](/en/guides/")) {
      console.error(`wrong-locale guide link ${locale}/${slug}`);
      failed = true;
    }
    if (locale in minCjkChars) {
      if (cjkChars < minCjkChars[locale]) {
        console.error(`too short ${locale}/${slug}: ${cjkChars} CJK chars < ${minCjkChars[locale]}`);
        failed = true;
      } else {
        console.log(`ok ${locale}/${slug}: ${cjkChars} CJK chars (${words} whitespace tokens)`);
      }
    } else if (words < minWords[locale]) {
      console.error(`too short ${locale}/${slug}: ${words} < ${minWords[locale]}`);
      failed = true;
    } else {
      console.log(`ok ${locale}/${slug}: ${words}`);
    }
  }
}

for (const locale of locales.filter((l) => l !== "en")) {
  const dir = path.join("content", "guides", locale);
  if (existsSync(dir)) {
    const extras = readdirSync(dir)
      .filter((file) => file.endsWith(".mdx"))
      .map((file) => file.replace(/\.mdx$/, ""))
      .filter((slug) => !slugs.includes(slug));
    if (extras.length) console.warn(`extra ${locale} guide translations: ${extras.join(", ")}`);
  }
}

if (failed) process.exit(1);
