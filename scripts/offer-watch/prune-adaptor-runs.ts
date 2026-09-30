/** Retention for data/adaptor/runs (gitignored evidence snapshots).
 * Dry run by default: lists run directories older than --days (default 14), using the timestamp prefix in the
 * directory name (YYYY-MM-DDTHH-MM-SSZ-...) or mtime as fallback. Pass --delete to actually remove them.
 *   npx tsx scripts/offer-watch/prune-adaptor-runs.ts [--days 14] [--delete]
 */
import fs from 'node:fs';
import path from 'node:path';

const runsDir = path.resolve('data', 'adaptor', 'runs');
const daysArg = process.argv.indexOf('--days');
const days = daysArg >= 0 ? Number(process.argv[daysArg + 1]) : 14;
if (!Number.isFinite(days) || days < 1) throw new Error('--days must be >= 1');
const doDelete = process.argv.includes('--delete');
const cutoff = Date.now() - days * 86400000;

function runTime(name: string, full: string): number {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z/);
  if (m) return Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`);
  return fs.statSync(full).mtimeMs;
}
const entries = fs.existsSync(runsDir) ? fs.readdirSync(runsDir, { withFileTypes: true }) : [];
const old = entries.filter(e => e.isDirectory() && !e.isSymbolicLink())
  .map(e => ({ name: e.name, full: path.join(runsDir, e.name) }))
  .filter(e => path.dirname(e.full) === runsDir && runTime(e.name, e.full) < cutoff)
  .sort((a, b) => a.name.localeCompare(b.name));
if (doDelete) for (const e of old) fs.rmSync(e.full, { recursive: true, force: true });
console.log(JSON.stringify({ mode: doDelete ? 'delete' : 'dry-run', runs_dir: path.relative(process.cwd(), runsDir), retention_days: days, total_runs: entries.length, older_than_cutoff: old.length, oldest: old[0]?.name ?? null, newest_pruned: old.at(-1)?.name ?? null }, null, 2));
