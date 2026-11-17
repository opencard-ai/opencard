// Validate the complete candidate set before copying any state into the artifact.
import fs from 'node:fs';
import path from 'node:path';
import { args, incoming } from './core.mjs';
try {
  const a = args(process.argv.slice(2));
  const files = incoming(a.from, a.job, a.today);
  fs.mkdirSync(a.out, { recursive: true });
  for (const f of files) fs.writeFileSync(path.join(a.out, f.name), f.bytes, { flag: 'wx' });
} catch (e) { console.error(`stage: ${e.message}`); process.exitCode = 2; }
