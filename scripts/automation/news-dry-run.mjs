#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareNewsDryRun } from './news-dry-run-core.mjs';

const args = process.argv.slice(2);
const options = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--now', '--slot', '--run-id'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('unknown, duplicate or incomplete option');
  options[args[i]] = args[i + 1];
}
const fixture = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./fixtures/news.json', import.meta.url)), 'utf8'));
const result = await prepareNewsDryRun({ fixture, now: options['--now'], slot: options['--slot'], runId: options['--run-id'] });
// Only fresh, private OS scratch is writable; no arbitrary output path or fixture path.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencard-news-dry-'));
for (const [name, value] of Object.entries(result)) fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(dir);
