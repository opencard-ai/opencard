/** Move no-change, cosmetic-only and duplicate pending card-update artifacts to artifacts/card-updates/archived/.
 * Dry run by default; pass --write to move files (never deletes). Appends to archived/ARCHIVE_LOG.jsonl.
 * Afterwards regenerate the index: npm run artifact:index
 */
import fs from 'node:fs';
import path from 'node:path';
import { planPendingArchive } from './pending-classify';

const pendingDir = path.join('artifacts', 'card-updates', 'pending');
const archiveDir = path.join('artifacts', 'card-updates', 'archived');
const write = process.argv.includes('--write');
const files = fs.existsSync(pendingDir) ? fs.readdirSync(pendingDir).filter(f => f.endsWith('.json')).sort() : [];
const plan = planPendingArchive(files.map(file => ({ file, artifact: JSON.parse(fs.readFileSync(path.join(pendingDir, file), 'utf8')) })));
const toArchive = plan.filter(p => p.action === 'archive');
if (write && toArchive.length) {
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivedAt = new Date().toISOString();
  for (const item of toArchive) {
    const target = path.join(archiveDir, item.file);
    if (fs.existsSync(target)) throw new Error(`Refusing to overwrite ${target}`);
    fs.renameSync(path.join(pendingDir, item.file), target);
    fs.appendFileSync(path.join(archiveDir, 'ARCHIVE_LOG.jsonl'), `${JSON.stringify({ file: item.file, card_id: item.card_id, reason: item.reason, archived_at: archivedAt, from: pendingDir })}\n`);
  }
}
console.log(JSON.stringify({ mode: write ? 'write' : 'dry-run', pending_total: files.length, archive: toArchive.length, keep: plan.length - toArchive.length, plan }, null, 2));
