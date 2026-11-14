/** Compare a cloud dry-run offer-watch day against the Mac run of the same PT date (read-only).
 *   npx tsx scripts/offer-watch/shadow-compare.ts --cloud <candidates-D.json> --mac <candidates-D.json> [--cloud-plan <apply-D.dry.json>] [--mac-plan <apply-D.json>] [--out <report.json>]
 * Prints a Markdown table; exits 0 even when values differ (this is a report, not a gate). */
import fs from 'node:fs';
import { compareCandidates, comparePlans, renderMarkdown } from './shadow-compare-core';

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined; };
/** Explicitly supplied files must exist; a missing file is an error, not an empty dataset. */
const read = (file?: string) => { if (!file) return null; if (!fs.existsSync(file)) { console.error(`missing input: ${file}`); process.exit(2); } return JSON.parse(fs.readFileSync(file, 'utf8')); };
const cloud = arg('--cloud'), mac = arg('--mac');
if (!cloud || !mac) { console.error('usage: shadow-compare.ts --cloud <file> --mac <file> [--cloud-plan f] [--mac-plan f] [--out f]'); process.exit(2); }
const report = compareCandidates(read(cloud) || [], read(mac) || []);
if (arg('--cloud-plan') || arg('--mac-plan')) report.plan = comparePlans(read(arg('--cloud-plan')), read(arg('--mac-plan')));
if (arg('--out')) fs.writeFileSync(arg('--out')!, `${JSON.stringify(report, null, 2)}\n`);
console.log(renderMarkdown(report));
