/** Private publication metadata only; never committed with card data. No Redis calls. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export interface OfferJournal {
  version: 1; runId: string; fingerprints: string[]; files: string[];
  phase: string; headSha?: string; prNumber?: number; mergeSha?: string;
  rollbackHead?: string; rollbackPr?: number; rollbackSha?: string; deployment?: string;
}
export interface OfferJournalStore {
  load(runId: string): OfferJournal | null;
  claim(fingerprints: string[], runId: string): void;
  save(journal: OfferJournal): void;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
/** Single-filesystem adapter, NOT a cloud/distributed lease or a verified backup. */
export function privateFileJournal(root: string, repo = process.cwd()): OfferJournalStore {
  if (!path.isAbsolute(root)) throw new Error('explicit absolute private journal directory required');
  const base = path.resolve(root), repository = fs.realpathSync(repo);
  const inside = (candidate: string) => { const rel = path.relative(repository, candidate); return !rel || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel)); };
  if (inside(base)) throw new Error('journal must be outside repo');
  const ensure = () => {
    fs.mkdirSync(base, { recursive: true, mode: 0o700 });
    if (inside(fs.realpathSync(base)) || (fs.statSync(base).mode & 0o077) !== 0) throw new Error('journal directory must be private and outside repo');
  };
  return {
    load: runId => {
      const file = path.join(base, `${hash(runId)}.json`);
      if (!fs.existsSync(file)) return null;
      ensure();
      return JSON.parse(fs.readFileSync(file, 'utf8')) as OfferJournal;
    },
    claim: (fingerprints, runId) => {
      ensure(); const dir = path.join(base, 'claims'); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      for (const fp of fingerprints) {
        const file = path.join(dir, hash(fp));
        try { fs.writeFileSync(file, runId, { flag: 'wx', mode: 0o600 }); }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || fs.readFileSync(file, 'utf8') !== runId) throw new Error('fingerprint already claimed or state unavailable');
        }
      }
    },
    save: journal => {
      ensure(); const file = path.join(base, `${hash(journal.runId)}.json`);
      const temporary = `${file}.${process.pid}.tmp`;
      try { fs.writeFileSync(temporary, JSON.stringify(journal), { mode: 0o600 }); fs.renameSync(temporary, file); }
      finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    },
  };
}
