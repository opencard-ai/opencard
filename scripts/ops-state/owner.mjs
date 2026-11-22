import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { args, outputs, jobs } from './core.mjs';
export function decideMode({ ownerDoc, job, expectedEpoch, eventName, ref } = {}) {
  let reason = 'ownership verified';
  if (typeof eventName !== 'string' || eventName.startsWith('pull_request')) reason = 'PR or missing event';
  else if (ref !== 'refs/heads/main') reason = 'not main';
  else if (!Object.hasOwn(jobs, job)) reason = 'invalid job';
  else if (!ownerDoc || ownerDoc.version !== 1) reason = 'missing or invalid owner document';
  else if (ownerDoc[job]?.owner !== 'github-actions') reason = 'cloud is not owner';
  else if (ownerDoc[job]?.productionEnabled !== true) reason = 'production disabled';
  else if (!expectedEpoch || ownerDoc[job]?.epoch !== expectedEpoch) reason = 'epoch mismatch';
  return { mode: reason === 'ownership verified' ? 'write' : 'shadow', reason };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    const a = args(process.argv.slice(2));
    result = decideMode({ ownerDoc: JSON.parse(fs.readFileSync(a.file, 'utf8')), job: a.job, expectedEpoch: a.epoch, eventName: a.event, ref: a.ref });
  } catch { result = { mode: 'shadow', reason: 'owner document unavailable or parse error' }; }
  console.log(result.mode); outputs(result);
}
