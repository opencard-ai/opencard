/** Compare cloud shadow vs Mac weekly audit for the same PT date (read-only report, exit 0 on differences).
 *   npx tsx scripts/audit/shadow-compare.ts --cloud <D-db-audit.json> --mac <D-db-audit.json> [--out report.json] */
import fs from 'node:fs';
import { compareFindings, renderMarkdown } from './shadow-compare-core';

const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const cloud = arg('--cloud'), mac = arg('--mac');
if (!cloud || !mac) { console.error('usage: shadow-compare.ts --cloud <db-audit.json> --mac <db-audit.json> [--out f]'); process.exit(2); }
const findings = (file: string) => JSON.parse(fs.readFileSync(file, 'utf8')).findings || [];
const report = compareFindings(findings(cloud), findings(mac));
if (arg('--out')) fs.writeFileSync(arg('--out')!, `${JSON.stringify(report, null, 2)}\n`);
console.log(renderMarkdown(report));
