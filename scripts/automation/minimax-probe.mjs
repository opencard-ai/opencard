import { mkdir, lstat, realpath, open } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TITLE = 'MiniMax M2.5 and M2.7 Model Retirement Notice';
export const SOURCE = 'https://platform.minimax.io/docs/faq/models.md';
export const ENDPOINT = 'https://api.minimax.io/anthropic/v1/messages';
export const DEADLINE_MS = 120_000;
export const BODY = JSON.stringify({
  model: 'MiniMax-M3',
  thinking: { type: 'disabled' },
  service_tier: 'standard',
  stream: false,
  max_tokens: 256,
  system: 'Translate the supplied title into Traditional Chinese. Return only a JSON object with exactly one field "title". Preserve MiniMax, M2.5 and M2.7 exactly.',
  messages: [{ role: 'user', content: TITLE }],
});

const refuse = () => new Error('MiniMax probe refused or failed; no public result.');
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const usageFields = ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'];

function summary(raw, key) {
  // Never propagate upstream text, error messages, headers, or arbitrary fields.
  if (typeof raw !== 'string' || raw.includes(key)) throw refuse();
  const value = JSON.parse(raw);
  if (value.model !== 'MiniMax-M3' || value.stop_reason !== 'end_turn' || Object.hasOwn(value, 'thinking') ||
      !Array.isArray(value.content) || value.content.length !== 1 ||
      value.content[0].type !== 'text' || typeof value.content[0].text !== 'string' ||
      Object.keys(value.content[0]).sort().join(',') !== 'text,type') throw refuse();
  const translated = JSON.parse(value.content[0].text);
  if (!translated || Array.isArray(translated) || Object.keys(translated).length !== 1 ||
      typeof translated.title !== 'string') throw refuse();
  const title = translated.title;
  // Latin text can only be the three literal public title tokens. Semantic and
  // Traditional Chinese correctness still require human review of the safe result.
  const han = title.replace(/MiniMax|M2\.5|M2\.7/g, '');
  if (title.length > 120 || title.includes(key) || !/\p{Script=Han}/u.test(han) ||
      !/^[\p{Script=Han}0-9 ，。；：、！？「」『』（）《》〈〉【】—–·.\-]+$/u.test(han) ||
      !['MiniMax', 'M2.5', 'M2.7'].every(token => title.split(token).length === 2)) throw refuse();
  const usage = {};
  if (value.usage !== undefined) {
    if (!value.usage || typeof value.usage !== 'object' || Array.isArray(value.usage)) throw refuse();
    for (const field of usageFields) {
      if (Object.hasOwn(value.usage, field)) {
        if (!Number.isSafeInteger(value.usage[field]) || value.usage[field] < 0) throw refuse();
        usage[field] = value.usage[field];
      }
    }
  }
  if (usage.output_tokens > 256) throw refuse();
  return { source: SOURCE, source_title: TITLE,
    requested: { model: 'MiniMax-M3', thinking: 'disabled', service_tier: 'standard', stream: false, max_tokens: 256, deadline_ms: DEADLINE_MS },
    model: value.model, stop_reason: value.stop_reason, usage, title };
}

// Dependency injection exists solely for offline tests. CLI accepts no provider,
// title, endpoint, output, or credential arguments.
export async function probeOnce({ apiKey, scratchDir, repoDir, fetchImpl = globalThis.fetch,
  setTimer = setTimeout, clearTimer = clearTimeout }) {
  let timer;
  const controller = new AbortController();
  try {
    if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey) ||
        !path.isAbsolute(scratchDir ?? '') || !path.isAbsolute(repoDir ?? '') || typeof fetchImpl !== 'function') throw refuse();
    const repo = await realpath(repoDir);
    const parent = await realpath(path.dirname(scratchDir));
    if (parent !== path.dirname(scratchDir) || within(scratchDir, repo)) throw refuse();
    try { await mkdir(scratchDir, { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw refuse(); }
    const stat = await lstat(scratchDir);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700 ||
        (process.getuid && stat.uid !== process.getuid())) throw refuse();
    // A durable exclusive claim precedes all HTTP. Even refusal/timeouts consume it.
    const ledger = await open(path.join(scratchDir, 'attempt.ledger'), 'wx', 0o600);
    try { await ledger.writeFile('attempt claimed\n'); await ledger.sync(); }
    finally { await ledger.close(); }
    // Refuse stale results as well; never replace a preexisting output.
    try { await lstat(path.join(scratchDir, 'result.json')); throw refuse(); }
    catch (error) { if (error.code !== 'ENOENT') throw refuse(); }
    const deadline = new Promise((_, reject) => {
      timer = setTimer(() => { controller.abort(); reject(refuse()); }, DEADLINE_MS);
    });
    const request = async () => {
      const response = await fetchImpl(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': apiKey },
        body: BODY,
      });
      if (!response.ok) throw refuse();
      return await response.text();
    };
    const raw = await Promise.race([request(), deadline]);
    const safe = summary(raw, apiKey);
    const result = await open(path.join(scratchDir, 'result.json'), 'wx', 0o600);
    try { await result.writeFile(JSON.stringify(safe, null, 2) + '\n'); }
    finally { await result.close(); }
    return safe;
  } catch { throw refuse(); }
  finally { if (timer !== undefined) clearTimer(timer); controller.abort(); }
}

export async function main(args = process.argv.slice(2), env = process.env,
  report = message => process.stderr.write(message)) {
  try {
    if (args.length !== 1 || args[0] !== '--execute-once' || !path.isAbsolute(env.RUNNER_TEMP ?? '')) throw refuse();
    await probeOnce({ apiKey: env.MINIMAX_API_KEY,
      scratchDir: path.join(env.RUNNER_TEMP, 'minimax-probe-once'), repoDir: process.cwd() });
    return 0;
  } catch {
    report('MiniMax probe disabled, refused, or failed; no public result.\n');
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
