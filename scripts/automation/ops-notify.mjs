#!/usr/bin/env node
// Ops notification CLI (PR #94 design, option B1). PREVIEW BY DEFAULT.
//   node scripts/automation/ops-notify.mjs --job offer-watch|weekly-audit --summary-file <file> --pt-date YYYY-MM-DD
//        --run-id <id> --out-dir <dir> [--run-url <url>] [--sent-keys <json file>] [--send] [--record-ops-state]
// Writes <out-dir>/notify-preview.md and <out-dir>/notify-record.json. Sends ONLY with --send AND
// OPS_NOTIFY_SEND=true AND AGENTMAIL_API_KEY / AGENTMAIL_FROM_INBOX / OWNER_EMAIL present (existing secret names).
// --record-ops-state is a stub: the ops-state write is a later step and is refused here.
import fs from 'node:fs';
import path from 'node:path';
import { alreadySent, buildMessage, gateSend, sendViaAgentMail } from './ops-notify-core.mjs';

export async function main(argv = process.argv.slice(2), env = process.env, fetchImpl = globalThis.fetch) {
  const has = f => argv.includes(f);
  const arg = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  if (has('--record-ops-state')) { console.error('ops-notify: --record-ops-state is not enabled yet (ops-state writer is a later step)'); return 2; }
  const job = arg('--job'), ptDate = arg('--pt-date'), runId = arg('--run-id'), outDir = arg('--out-dir'), summaryFile = arg('--summary-file');
  if (!job || !ptDate || !runId || !outDir || !summaryFile) { console.error('ops-notify: --job, --pt-date, --run-id, --summary-file and --out-dir are required'); return 2; }
  fs.mkdirSync(outDir, { recursive: true });
  let summary;
  try { summary = fs.readFileSync(summaryFile, 'utf8'); } catch { console.error('ops-notify: summary file missing or unreadable (refusing to treat as NO_REPLY)'); return 2; }
  let msg;
  try { msg = buildMessage({ job, ptDate, runId, summary, runUrl: arg('--run-url') }); } catch (e) { console.error(`ops-notify: ${e.message}`); return 2; }
  const sentKeys = arg('--sent-keys') && fs.existsSync(arg('--sent-keys')) ? JSON.parse(fs.readFileSync(arg('--sent-keys'), 'utf8')) : [];
  const gate = gateSend({ sendFlag: has('--send'), env });
  const record = { key: msg.key, job, pt_date: ptDate, run_id: runId, at: new Date().toISOString(), mode: gate.send ? 'send' : 'preview', gate: gate.reason, status: 'preview' };
  const write = () => fs.writeFileSync(path.join(outDir, 'notify-record.json'), `${JSON.stringify(record, null, 2)}\n`);

  if (msg.skip) { record.status = `skipped:${msg.reason}`; write(); fs.writeFileSync(path.join(outDir, 'notify-preview.md'), `(no notification: ${msg.reason})\n`); console.log(`ops-notify: skipped (${msg.reason})`); return 0; }
  fs.writeFileSync(path.join(outDir, 'notify-preview.md'), `**Subject:** ${msg.subject}\n\n\`\`\`\n${msg.text}\n\`\`\`\n`);
  if (alreadySent(sentKeys, msg.key)) { record.status = 'skipped:already_sent'; write(); console.log('ops-notify: already sent for this key; skipping'); return 0; }
  if (gate.error) { record.status = 'refused'; write(); console.error(`ops-notify: ${gate.reason}`); return 2; }
  if (!gate.send) { write(); console.log(`ops-notify: ${gate.reason}; preview written`); return 0; }
  // Order per #94: (later) record pending in ops-state -> send -> record notified. A crash after send may duplicate once.
  record.status = 'pending'; write();
  try {
    await sendViaAgentMail({ fetchImpl, apiKey: env.AGENTMAIL_API_KEY, inboxId: env.AGENTMAIL_FROM_INBOX, to: env.OWNER_EMAIL, message: msg });
  } catch (e) { record.status = 'send_failed'; record.error = /^http_\d{3}$/.test(e?.category || '') ? e.category : 'client_or_network_error'; write(); console.error('ops-notify: send failed; will retry on the next run'); return 1; }
  record.status = 'sent'; write(); console.log('ops-notify: sent'); return 0;
}

if (process.argv[1] && /ops-notify\.mjs$/.test(process.argv[1])) main().then(code => { process.exitCode = code; });
