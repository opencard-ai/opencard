import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { args, outputs } from '../ops-state/core.mjs';

const HOUR = 3600000;
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error('invalid UTC timestamp');
  const time = Date.parse(value);
  if (new Date(time).toISOString().slice(0, 19) !== value.slice(0, 19)) throw new Error('invalid UTC date');
  return time;
}
function successes(input, now) {
  if (!input || !Array.isArray(input.workflow_runs)) throw new Error('expected workflow_runs array');
  return input.workflow_runs.filter(run => {
    if (!run || !['head_branch', 'event', 'status'].every(k => typeof run[k] === 'string') || !(run.conclusion === null || typeof run.conclusion === 'string')) throw new Error('invalid workflow run');
    // Any successful dispatch on main counts.
    return run.head_branch === 'main' && ['schedule', 'workflow_dispatch'].includes(run.event) && run.status === 'completed' && run.conclusion === 'success';
  }).map(run => timestamp(run.created_at)).filter(time => time <= now).sort((a, b) => b - a);
}
export function evaluate({ offerRuns, auditRuns, gscRuns, now }) {
  const time = timestamp(now), offers = successes(offerRuns, time), audits = successes(auditRuns, time), gscSuccesses = successes(gscRuns, time);
  const week = new Date(time); week.setUTCHours(0, 0, 0, 0);
  week.setUTCDate(week.getUTCDate() - (week.getUTCDay() + 6) % 7);
  const weekStart = week.toISOString(), slotTime = +week + (18 * 60 + 47) * 60000;
  const slot = new Date(slotTime).toISOString();
  const ptDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time));
  const offer = offers.some(t => t > time - 36 * HOUR) ? 'ok' : 'missed';
  // Monday's scheduled run can start many hours late. Wait through Tuesday 14:47Z
  // before alarming, and require a success created in this UTC week, not last week's run.
  // A missed audit re-alerts daily until a success.
  const audit = time < slotTime + 20 * HOUR ? 'pending' : audits.some(t => t >= +week) ? 'ok' : 'missed';
  // GSC is daily at 17:30Z. As for offer-watch, allow 36h between successes
  // (24h cadence plus 12h grace for GitHub scheduling delays).
  const gsc = gscSuccesses.some(t => t > time - 36 * HOUR) ? 'ok' : 'missed';
  const latestGscSuccess = gscSuccesses.length ? new Date(gscSuccesses[0]).toISOString() : null;
  const latestOfferSuccess = offers.length ? new Date(offers[0]).toISOString() : null;
  const lines = [];
  if (offer === 'missed') lines.push(`- offer-watch: no successful scheduled/dispatched run on main in the last 36h (latest success: ${latestOfferSuccess || 'none'}).`);
  if (audit === 'missed') lines.push(`- weekly-audit: no successful run on main since ${weekStart} (slot ${slot} + 20h grace passed).`);
  if (gsc === 'missed') lines.push(`- gsc: no successful scheduled/dispatched run on main in the last 36h (daily slot 17:30Z; latest success: ${latestGscSuccess || 'none'}).`);
  const text = lines.length ? `[MISSED] OpenCard ops watchdog ${ptDate}\n${lines.join('\n')}\nNo automatic catch-up was started. See the run link.\n` : 'NO_REPLY';
  return { offer, audit, gsc, latestGscSuccess, pt_date: ptDate, weekStart, slot, latestOfferSuccess, text };
}
export function main(argv = process.argv.slice(2)) {
  try {
    const a = args(argv);
    const result = evaluate({ offerRuns: JSON.parse(fs.readFileSync(a['offer-runs'], 'utf8')), auditRuns: JSON.parse(fs.readFileSync(a['audit-runs'], 'utf8')), gscRuns: JSON.parse(fs.readFileSync(a['gsc-runs'], 'utf8')), now: a.now });
    fs.mkdirSync(a['out-dir'], { recursive: true });
    fs.writeFileSync(path.join(a['out-dir'], 'watchdog.txt'), result.text);
    fs.writeFileSync(path.join(a['out-dir'], 'watchdog.json'), `${JSON.stringify(result, null, 2)}\n`);
    outputs({ pt_date: result.pt_date });
    return 0;
  } catch { console.error('ops-watchdog: malformed input or unable to write output'); return 2; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
