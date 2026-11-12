/** Offline only. No Redis/GitHub import. Requires explicit user-supplied sandbox fixtures/key FD. */
import fs from 'node:fs';
import { exportSnapshot, importSnapshot, readSandboxFixtures, snapshotDocuments, writePrivateSnapshot } from './state-snapshot';
import { assertSandboxPrefix } from './state-namespace';
const arg = (name: string) => { const i = process.argv.indexOf(name); return i < 0 ? undefined : process.argv[i + 1]; };
function main() {
  const mode = arg('--mode');
  if (!['export', 'inspect', 'prepare-import'].includes(mode ?? '')) throw new Error('explicit offline mode required');
  const fd = Number(arg('--key-fd'));
  if (!Number.isSafeInteger(fd) || fd < 3) throw new Error('caller-provided 32-byte key on explicit FD >=3 required; never CLI args/env/key files');
  const key = Buffer.alloc(33); let size = 0;
  try {
    while (size < 33) { const n = fs.readSync(fd, key, size, 33 - size, null); if (!n) break; size += n; }
    if (size !== 32) throw new Error('key must be exactly 32 bytes');
    if (mode === 'export') {
      const root = arg('--sandbox-fixture-dir'), output = arg('--out');
      if (!root || !output) throw new Error('explicit sandbox fixture directory and private output required');
      writePrivateSnapshot(output, exportSnapshot(readSandboxFixtures(root), key.subarray(0, 32)));
      console.log(JSON.stringify({ mode, written: true, encrypted: true })); return;
    }
    const file = arg('--snapshot'); if (!file || !fs.lstatSync(file).isFile() || fs.lstatSync(file).size > 4 * 1024 * 1024) throw new Error('bounded explicit snapshot file required');
    const decoded = importSnapshot(fs.readFileSync(file), key.subarray(0, 32));
    if (mode === 'prepare-import') { const prefix = arg('--new-sandbox-prefix'); if (!prefix) throw new Error('new sandbox prefix required'); assertSandboxPrefix(prefix); }
    console.log(JSON.stringify({ mode, schema: 1, fixtureOnly: true, digest: decoded.digest, documentCount: Object.keys(snapshotDocuments(decoded.bundle)).length, remoteWrites: 0, restorePerformed: false }));
  } finally { key.fill(0); }
}
try { main(); } catch { console.error('offline snapshot refused: key/input/size/authentication/schema invalid; no remote import or values printed'); process.exitCode = 1; }
