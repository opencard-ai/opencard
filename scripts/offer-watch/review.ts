/** Read-only: registry comes from actual configs, production from committed HEAD, never applied-artifact history.
 * npx tsx scripts/offer-watch/review.ts [candidates.json] [previous-report.json]
 * Input: Candidate[]. Optional prior report suppresses unchanged fingerprints; no sending or patches.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { assessCandidate, type Candidate } from './gate';
const root = process.cwd();
const registry = new Set<string>();
for (const file of fs.readdirSync(path.join(root, 'scripts/card-adaptor/cards')).filter(f => f.endsWith('.json'))) {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'scripts/card-adaptor/cards', file), 'utf8'));
  if (config.cardId) registry.add(config.cardId);
}
const baseline = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', 'HEAD', 'data/cards'], { encoding: 'utf8' }).trim().split('\n').filter(f => f.endsWith('.json'));
const cards = new Map();
for (const file of files) {
  const card = JSON.parse(execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 2e6 }));
  if (card.card_id) cards.set(card.card_id, card);
}
const input: Candidate[] = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : [];
if (!Array.isArray(input)) throw new Error('Expected candidate array');
const previous = process.argv[3] ? JSON.parse(fs.readFileSync(process.argv[3], 'utf8')).results || [] : [];
const seen = new Set(previous.map((r: any) => r.fingerprint));
const results = input.map(candidate => {
  const result = assessCandidate(candidate, cards.get(candidate.card_id), registry.has(candidate.card_id));
  return { ...result, notify: (result.status !== 'unchanged' || result.coverage_action !== 'none') && !seen.has(result.fingerprint) };
});
console.log(JSON.stringify({ baseline_commit: baseline, baseline_note: 'Committed HEAD, not proof of deployed version. Check deployment before claiming production changed.', coverage_source: 'scripts/card-adaptor/cards (working tree, including uncommitted configs)', registry: [...registry].sort(), results }, null, 2));
