#!/usr/bin/env node

import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const locales = ["zh", "zh-cn", "es"];
const output = {};

function extract(text, field) {
  const match = text.match(new RegExp(`${field}:\\s*\"([^\"]+)\"`));
  if (!match) throw new Error(`Missing ${field}`);
  return match[1];
}

for (const locale of locales) {
  const directory = path.join(root, "content", "guides", locale);
  const files = (await readdir(directory)).filter((file) => file.endsWith(".mdx")).sort();
  for (const file of files) {
    const text = await readFile(path.join(directory, file), "utf8");
    const slug = extract(text, "slug");
    output[slug] ||= {};
    output[slug][locale] = {
      title: extract(text, "title"),
      summary: extract(text, "summary"),
    };
  }
}

await writeFile(
  path.join(root, "data", "guide-localizations.json"),
  `${JSON.stringify(output, null, 2)}\n`,
  "utf8",
);

console.log(`generated metadata for ${Object.keys(output).length} guide slugs`);
