import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
export function isOfferCli(moduleUrl: string, entry = process.argv[1]): boolean {
  try { return !!entry && fs.realpathSync(entry) === fs.realpathSync(fileURLToPath(moduleUrl)); }
  catch { return false; }
}
