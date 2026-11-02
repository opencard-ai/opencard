/** Helpers for privileged offline scripts (loader, settle). Never imported by API routes. */

/**
 * Loader and settle need the privileged URL (they read task_gold_answers / v1_scoring_config, which the
 * API role cannot). Prefer V1_ADMIN_DATABASE_URL; fall back to V1_DATABASE_URL for local/dev only.
 */
export function useAdminDatabaseUrl(): void {
  const admin = process.env.V1_ADMIN_DATABASE_URL;
  if (admin) process.env.V1_DATABASE_URL = admin;
}

/** Logs only the error class name and driver code; never e.message (it can contain data or connection details). */
export function logFailure(what: string, e: unknown): void {
  const name = e instanceof Error ? e.name : "UnknownError";
  const code = (e as { code?: unknown } | null)?.code;
  console.error(`${what} failed: ${name}${typeof code === "string" ? ` code=${code}` : ""}`);
}
