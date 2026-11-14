// Pure helpers for ops job notifications (offer watcher / weekly audit) per the PR #94 design (option B1).
// No network, env or filesystem access here: the CLI injects everything. Sending is decided by gateSend().

export const JOBS = Object.freeze({ 'offer-watch': 'OpenCard 優惠監測', 'weekly-audit': 'OpenCard 每週資料庫稽核' });
export const MAX_CHARS = 3000;
export const MAX_LINES = 80;
const DEFAULT_ALLOWED_EMAILS = ['opencard@opencardai.com'];

/** NO_REPLY (and DURABLE:NO_REPLY) or empty output means "nothing to announce", exactly as the Mac relay treats it. */
export function isSilent(summary) {
  const t = String(summary ?? '').trim();
  return t === '' || /^(DURABLE:)?NO_REPLY$/.test(t);
}

const REDACTIONS = [
  // Private key blocks.
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[redacted-key]'],
  // Authorization headers / bearer tokens.
  [/\b(authorization\s*[:=]\s*)?(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{12,}/gi, '[redacted-token]'],
  // Well-known token prefixes (GitHub, Slack, AWS, OpenAI-style, Vercel, npm, Google).
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{16,}|am_[A-Za-z0-9_-]{16,}|npm_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{30,}|vercel_[A-Za-z0-9_-]{16,})\b/g, '[redacted-token]'],
  // JWTs.
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '[redacted-token]'],
  // key=value / key: value secrets, including JSON/YAML style quoted keys ("api_key": "...").
  [/(["']?)\b([A-Za-z0-9_-]*(?:token|secret|password|passwd|api[_-]?key|apikey|private[_-]?key|credential)[A-Za-z0-9_-]*)\1(\s*[:=]\s*)(?!\[redacted)("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s,;&}\]]+)/gi, '$1$2$1$3[redacted]'],
];

const SENSITIVE_PARAM = /^(token|access_token|refresh_token|id_token|key|api_key|apikey|sig|signature|code|auth|password|secret|client_secret|x-amz-[a-z-]+)$/i;
const decodeName = n => { try { return decodeURIComponent(n.replace(/\+/g, ' ')); } catch { return n; } };
/** Redact credentials out of a URL: userinfo and sensitive query/fragment parameters (names percent-decoded). */
function scrubUrl(url) {
  const u = url.replace(/^(https?:\/\/)[^/@\s]+@/i, '$1');
  return u.replace(/([?&#;])([^=&#;\s]+)=([^&#;\s]*)/g, (m, sep, name, value) => (SENSITIVE_PARAM.test(decodeName(name).trim()) ? `${sep}${name}=[redacted]` : m));
}

/**
 * Sanitize a job summary before it can leave the runner. Order matters: URLs first (so credentials in URLs go),
 * then token patterns, emails, local paths, high-entropy strings, control characters, and finally length caps.
 */
export function sanitize(summary, { allowedEmails = DEFAULT_ALLOWED_EMAILS, maxChars = MAX_CHARS, maxLines = MAX_LINES } = {}) {
  let t = String(summary ?? '');
  t = t.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, ''); // ANSI escapes
  t = t.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  t = t.replace(/https?:\/\/[^\s<>"')\]]+/gi, scrubUrl);
  for (const [re, rep] of REDACTIONS) t = t.replace(re, rep);
  const allow = new Set(allowedEmails.map(e => e.toLowerCase()));
  t = t.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, m => (allow.has(m.toLowerCase()) ? m : '[redacted-email]'));
  t = t.replace(/(?<![A-Za-z0-9_.:/-])\/(?:Users|home|private|var\/folders|tmp|root|opt\/homebrew)\/[^\s"')]*/g, '[path]');
  t = t.replace(/(?<![A-Za-z0-9_.:/-])~\/[^\s"')]+/g, '[path]');
  // High-entropy strings: 32+ chars mixing upper, lower and digits (lowercase hex SHAs are kept).
  t = t.replace(/[A-Za-z0-9_+=-]{32,}/g, m => (/[A-Z]/.test(m) && /[a-z]/.test(m) && /[0-9]/.test(m) ? '[redacted-token]' : m));
  let lines = t.split('\n');
  let truncated = false;
  if (lines.length > maxLines) { lines = lines.slice(0, maxLines); truncated = true; }
  t = lines.join('\n').trim();
  if (t.length > maxChars) { t = t.slice(0, maxChars).replace(/\n[^\n]*$/, ''); truncated = true; }
  if (truncated) t += '\n…（已截斷；完整報告見 GitHub Actions run）';
  return t;
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/;
/** Deterministic dedupe key per #94: one announcement per job + PT date + run id (attempt excluded on purpose). */
export function dedupeKey({ job, ptDate, runId }) {
  if (!JOBS[job]) throw new Error(`unknown job: ${job}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ptDate || '')) throw new Error('ptDate must be YYYY-MM-DD');
  if (!SAFE_ID.test(String(runId || ''))) throw new Error('runId must match [A-Za-z0-9._-]{1,64}');
  return `ops-notify:${job}:${ptDate}:${runId}`;
}

const escapeHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Build the message or a skip decision. Never includes env, logs or anything but the sanitized summary. */
export function buildMessage({ job, ptDate, runId, summary, runUrl, allowedEmails }) {
  const key = dedupeKey({ job, ptDate, runId });
  if (isSilent(summary)) return { skip: true, reason: 'no_reply', key };
  const body = sanitize(summary, { allowedEmails });
  if (!body) return { skip: true, reason: 'empty_after_sanitize', key };
  const link = runUrl && /^https:\/\/github\.com\/opencard-ai\/opencard\/actions\/runs\/\d+(\/attempts\/\d+)?$/.test(runUrl) ? runUrl : null;
  const text = `${body}${link ? `\n\nGitHub Actions run: ${link}` : ''}\n\n(dedupe: ${key})`;
  return { skip: false, key, subject: `[${JOBS[job]}] ${ptDate} run ${runId}`, text, html: `<pre style="font-family:inherit;white-space:pre-wrap">${escapeHtml(text)}</pre>` };
}

/**
 * Real sending needs BOTH the explicit opt-in flag (--send) AND OPS_NOTIFY_SEND=true, plus all three existing
 * secret names present. Anything else is preview-only. Returns { send, reason }.
 */
export function gateSend({ sendFlag, env = {} }) {
  if (!sendFlag) return { send: false, reason: 'preview: --send not given' };
  if (String(env.OPS_NOTIFY_SEND || '').toLowerCase() !== 'true') return { send: false, reason: 'preview: OPS_NOTIFY_SEND is not "true"' };
  const missing = ['AGENTMAIL_API_KEY', 'AGENTMAIL_FROM_INBOX', 'OWNER_EMAIL'].filter(n => !env[n]);
  if (missing.length) return { send: false, reason: `refused: missing ${missing.join(', ')}`, error: true };
  return { send: true, reason: 'send enabled' };
}

/** Already announced? `sent` is the set of dedupe keys (later loaded from ops-state MANIFEST.notified keys). */
export const alreadySent = (sent, key) => Array.isArray(sent) ? sent.includes(key) : false;

/** POST to AgentMail with an injected fetch; mirrors scripts/auto-update-cards/notify.ts. Error text is not echoed. */
export async function sendViaAgentMail({ fetchImpl, apiKey, inboxId, to, message, timeoutMs = 20000 }) {
  const res = await fetchImpl(`https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ to: [to], subject: message.subject, text: message.text, html: message.html, labels: ['opencard-ops'] }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) { const e = new Error(`AgentMail send failed: HTTP ${res.status}`); e.category = `http_${res.status}`; throw e; }
  return { status: res.status };
}
