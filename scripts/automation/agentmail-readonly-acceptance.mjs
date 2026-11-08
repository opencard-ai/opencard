#!/usr/bin/env node
// Hosted AgentMail READ-ONLY acceptance. Exactly ONE request: GET list-messages, limit=1, for the fixed
// inbox opencard@agentmail.to. No message body/attachment fetch, no mark-read, no send/create/delete.
// Prints ONLY an allowlisted summary: http status, count, returned length, schema key names, latest timestamp.
// Never prints sender/subject/preview/ids/raw errors. This proves the hosted monitor CAN read; it does NOT
// mean the daily monitor has moved to the cloud.
export const ORIGIN = 'https://api.agentmail.to';
export const INBOX = 'opencard@agentmail.to';
export const PATH = `/v0/inboxes/${encodeURIComponent(INBOX)}/messages`;
// Explicit schema allowlists (field NAMES only; values are never printed).
const TOP_KEYS = new Set(['count', 'limit', 'next_page_token', 'messages']);
const MSG_KEYS = new Set(['inbox_id', 'thread_id', 'message_id', 'labels', 'timestamp', 'from', 'to', 'cc', 'bcc', 'reply_to', 'subject', 'preview', 'text', 'html', 'attachments', 'in_reply_to', 'references', 'headers', 'size', 'created_at', 'updated_at']);
const keysOf = (o, allow) => (o && typeof o === 'object' && !Array.isArray(o) ? Object.keys(o).filter(k => allow.has(k)).sort() : []);
const iso = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(v) && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null);

export function buildRequest(apiKey) {
  if (typeof apiKey !== 'string' || apiKey.length < 16 || /\s/.test(apiKey)) throw new Error('missing or invalid AGENTMAIL_API_KEY');
  const url = new URL(PATH, ORIGIN); url.searchParams.set('limit', '1');
  if (url.origin !== ORIGIN || url.pathname !== PATH || url.search !== '?limit=1') throw new Error('request target drift');
  return { url: url.toString(), init: { method: 'GET', redirect: 'error', headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' } } };
}
export function summarize(status, body) {
  const msgs = body && Array.isArray(body.messages) ? body.messages : null;
  const first = msgs && msgs[0];
  return {
    ok: status === 200 && !!msgs, status,
    count: Number.isSafeInteger(body?.count) ? body.count : null,
    returned: msgs ? msgs.length : null,
    keys: keysOf(body, TOP_KEYS), messageKeys: keysOf(first, MSG_KEYS),
    latestTimestamp: iso(first?.timestamp) ?? iso(first?.created_at),
  };
}
export async function runAcceptance({ env = process.env, fetchImpl = globalThis.fetch, print = (s) => console.log(s), timeoutMs = 15000 } = {}) {
  let req;
  try { req = buildRequest(env.AGENTMAIL_API_KEY); } catch { print(JSON.stringify({ ok: false, exit: 2, error: 'config' })); return 2; }
  let calls = 0;
  const guardedFetch = (u, i) => {
    if (++calls > 1) throw new Error('second request refused');
    const p = new URL(u);
    if (p.origin !== ORIGIN || p.pathname !== PATH || i.method !== 'GET' || i.redirect !== 'error' || i.body !== undefined) throw new Error('request refused');
    return fetchImpl(u, { ...i, signal: AbortSignal.timeout(timeoutMs) });
  };
  let summary;
  try {
    const res = await guardedFetch(req.url, req.init);
    let body = null;
    if (res.status === 200) { try { body = await res.json(); } catch { body = null; } } else { try { await res.body?.cancel?.(); } catch {} }
    summary = summarize(res.status, body);
  } catch { summary = { ok: false, status: null, error: 'request-failed' }; }
  const exit = summary.ok ? 0 : 1;
  print(JSON.stringify({ exit, ...summary }));
  return exit;
}
if (import.meta.url === `file://${process.argv[1]}`) runAcceptance().then(c => { process.exitCode = c; }, () => { console.log(JSON.stringify({ ok: false, exit: 1, error: 'internal' })); process.exitCode = 1; });
