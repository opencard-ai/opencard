/** Fixed repo checks, asynchronous child/group cancellation. Never shell-interprets inputs. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
export function asyncOfferCheck(cmd: string, args: string[], signal: AbortSignal, options: {
  cwd: string; timeoutMs?: number; killGraceMs?: number; spawnImpl?: typeof spawn; killGroup?: (pid: number, signal: NodeJS.Signals) => void;
}): Promise<{ code: number; cwd: string }> {
  if (cmd !== 'npm' || args.length !== 2 || args[0] !== 'run' || !['validate', 'build', 'offer-watch:test', 'test'].includes(args[1])) throw new Error('fixed repo check allowlist refused');
  if (!path.isAbsolute(options.cwd) || (fs.statSync(options.cwd).mode & 0o077)) throw new Error('explicit private isolated worktree required');
  if (fs.readdirSync(options.cwd).some(name => /^\.env(?:\.|$)/.test(name) && name !== '.env.example')) throw new Error('check worktree must not contain env files');
  if (signal.aborted) return Promise.reject(new Error('lease already lost; check not started'));
  const timeoutMs = options.timeoutMs ?? 15 * 60000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15 * 60000) throw new Error('bounded check timeout required');
  const killGraceMs = options.killGraceMs ?? 2000;
  if (!Number.isSafeInteger(killGraceMs) || killGraceMs < 1 || killGraceMs > 2000) throw new Error('bounded group kill grace required');
  const cwd = fs.realpathSync(options.cwd);
  // A fresh private sibling, never under the validated publication tree. Do not inherit user HOME/cache.
  const home = fs.mkdtempSync(path.join(path.dirname(cwd), '.offer-check-home-'));
  const temp = path.join(home, 'tmp'); fs.mkdirSync(temp, { mode: 0o700 });
  const removeHome = () => { try { fs.rmSync(home, { recursive: true, force: true }); return true; } catch { return false; } };
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try { child = (options.spawnImpl ?? spawn)(cmd, args, { cwd, shell: false, detached: true, stdio: 'ignore', env: { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, TMPDIR: temp, npm_config_cache: path.join(home, '.npm'), XDG_CACHE_HOME: path.join(home, '.cache'), CI: 'true', NEXT_TELEMETRY_DISABLED: '1' } }); }
    catch { removeHome(); reject(new Error('async check process unavailable; output suppressed')); return; }
    let canceled = false, done = false, killTimer: ReturnType<typeof setTimeout> | undefined;
    const kill = (kind: NodeJS.Signals) => { if (child.pid) { try { (options.killGroup ?? ((pid, s) => { process.kill(-pid, s); }))(child.pid, kind); } catch { /* group already exited */ } } };
    const cleanup = () => { done = true; clearTimeout(timeout); if (killTimer) clearTimeout(killTimer); signal.removeEventListener('abort', abort); return removeHome(); };
    const abort = () => {
      if (done || canceled) return;
      canceled = true; kill('SIGTERM');
      // Leader close/error MUST NOT cancel group escalation: descendants may ignore TERM.
      killTimer = setTimeout(() => { kill('SIGKILL'); cleanup(); reject(new Error('async check canceled/lease lost; group escalation completed')); }, killGraceMs);
    };
    const timeout = setTimeout(abort, timeoutMs);
    signal.addEventListener('abort', abort, { once: true });
    child.once('error', () => { if (!canceled) { cleanup(); reject(new Error('async check process unavailable; output suppressed')); } });
    child.once('close', code => { if (!canceled) { const cleaned = cleanup(); if (!cleaned) reject(new Error('async check private home cleanup failed')); else if (signal.aborted) reject(new Error('async check lease lost')); else resolve({ code: code ?? 1, cwd: fs.realpathSync(options.cwd) }); } });
    if (signal.aborted) abort();
  });
}
