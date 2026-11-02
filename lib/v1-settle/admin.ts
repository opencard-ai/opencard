/** Helpers for privileged offline scripts (loader, settle). Never imported by API routes. */

import { readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Local, gitignored, chmod 600 file holding V1_ADMIN_DATABASE_URL. Never stored in Vercel or the repo. */
export const ADMIN_ENV_FILE = path.join(homedir(), ".opencard-v1-private", "admin.env");

/**
 * Reads V1_ADMIN_DATABASE_URL ONLY from ADMIN_ENV_FILE (process env is ignored on purpose).
 * Refuses a file readable by group/others. Never prints the value.
 */
export function readAdminDatabaseUrl(file = ADMIN_ENV_FILE): string {
  let st;
  try { st = statSync(file); } catch { throw Object.assign(new Error("admin env file missing"), { name: "AdminEnvMissing", code: "ENOENT" }); }
  if ((st.mode & 0o077) !== 0) throw Object.assign(new Error("admin env file too open"), { name: "AdminEnvInsecure", code: "EPERM" });
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*V1_ADMIN_DATABASE_URL\s*=\s*"?([^"\s]+)"?\s*$/.exec(line);
    if (m) return m[1];
  }
  throw Object.assign(new Error("V1_ADMIN_DATABASE_URL not in admin env file"), { name: "AdminEnvMissing", code: "NOKEY" });
}

/** Point this offline process's DB helper at the admin URL from the local file. */
export function useAdminDatabaseUrl(): void {
  process.env.V1_DATABASE_URL = readAdminDatabaseUrl();
}

/** Logs only the error class name and driver code; never e.message (it can contain data or connection details). */
export function logFailure(what: string, e: unknown): void {
  const name = e instanceof Error ? e.name : "UnknownError";
  const code = (e as { code?: unknown } | null)?.code;
  console.error(`${what} failed: ${name}${typeof code === "string" ? ` code=${code}` : ""}`);
}
