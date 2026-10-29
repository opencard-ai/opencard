import { v1Config } from "./config";
import type { TaskType } from "./tasks";

export interface Evidence { url: string; retrieved_at: string; excerpt: string; content_hash: string }
export type VerifySubmission =
  | { task_id: string; status: "verified"; result: Record<string, unknown>; evidence: Evidence }
  | { task_id: string; status: "unable_to_verify"; reason: string; evidence: Evidence | null };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const isFiniteNum = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min: number, max: number) => isFiniteNum(v, min, max) && Number.isInteger(v);
const isHttpsUrl = (v: unknown) => {
  if (typeof v !== "string" || v.length > 2048) return false;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
};

export const BONUS_UNITS = ["points", "miles", "cash", "free_nights"] as const;
export const CARD_STATUSES = ["active", "discontinued"] as const;

/** Errors name the offending field only; submitted values are never echoed. */
export function parseSubmission(body: unknown, now = Date.now()): { ok: true; value: VerifySubmission } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (!isObj(body)) return { ok: false, errors: ["body must be an object"] };
  const taskId = body.task_id;
  if (typeof taskId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(taskId)) errors.push("task_id");
  const status = body.status;
  if (status !== "verified" && status !== "unable_to_verify") errors.push("status");

  let evidence: Evidence | null = null;
  if (body.evidence !== undefined && body.evidence !== null) {
    const e = body.evidence;
    if (!isObj(e)) errors.push("evidence");
    else {
      if (!isHttpsUrl(e.url)) errors.push("evidence.url");
      const ts = typeof e.retrieved_at === "string" ? Date.parse(e.retrieved_at) : NaN;
      if (!Number.isFinite(ts) || ts > now + 5 * 60_000 || ts < now - 7 * 24 * 3600_000) errors.push("evidence.retrieved_at");
      if (typeof e.excerpt !== "string" || e.excerpt.trim().length === 0 || e.excerpt.length > v1Config.maxExcerptChars()) errors.push("evidence.excerpt");
      if (typeof e.content_hash !== "string" || !/^sha256:[0-9a-f]{64}$/.test(e.content_hash)) errors.push("evidence.content_hash");
      evidence = { url: e.url as string, retrieved_at: e.retrieved_at as string, excerpt: e.excerpt as string, content_hash: e.content_hash as string };
    }
  }

  if (status === "verified") {
    if (!evidence) errors.push("evidence");
    if (!isObj(body.result)) errors.push("result");
  } else if (status === "unable_to_verify") {
    if (typeof body.reason !== "string" || !/^[a-z0-9_]{1,64}$/.test(body.reason)) errors.push("reason");
  }
  if (errors.length) return { ok: false, errors };
  return status === "verified"
    ? { ok: true, value: { task_id: taskId as string, status, result: body.result as Obj, evidence: evidence! } }
    : { ok: true, value: { task_id: taskId as string, status: "unable_to_verify", reason: body.reason as string, evidence } };
}

/** Type-specific result validation; unknown keys are rejected so payloads stay small and structured. */
export function validateResult(type: TaskType, r: Obj): string[] {
  const errs: string[] = [];
  const allowed: Record<TaskType, string[]> = {
    link_check: ["http_status", "final_url", "is_official_redirect"],
    fee_check: ["annual_fee", "first_year_waived"],
    welcome_offer_check: ["bonus_amount", "bonus_unit", "spending_requirement", "time_period_months"],
    status_check: ["status"],
  };
  for (const k of Object.keys(r)) if (!allowed[type].includes(k)) errs.push(`result.${k.slice(0, 40)}`);
  switch (type) {
    case "link_check":
      if (!isInt(r.http_status, 100, 599)) errs.push("result.http_status");
      if (!isHttpsUrl(r.final_url)) errs.push("result.final_url");
      if (typeof r.is_official_redirect !== "boolean") errs.push("result.is_official_redirect");
      break;
    case "fee_check":
      if (!isFiniteNum(r.annual_fee, 0, 10000)) errs.push("result.annual_fee");
      if (typeof r.first_year_waived !== "boolean") errs.push("result.first_year_waived");
      break;
    case "welcome_offer_check":
      if (!isFiniteNum(r.bonus_amount, 0, 10_000_000)) errs.push("result.bonus_amount");
      if (!BONUS_UNITS.includes(r.bonus_unit as (typeof BONUS_UNITS)[number])) errs.push("result.bonus_unit");
      if (!isFiniteNum(r.spending_requirement, 0, 1_000_000)) errs.push("result.spending_requirement");
      if (!isInt(r.time_period_months, 0, 60)) errs.push("result.time_period_months");
      break;
    case "status_check":
      if (!CARD_STATUSES.includes(r.status as (typeof CARD_STATUSES)[number])) errs.push("result.status");
      break;
  }
  return errs;
}

export function urlMatchesWhitelist(url: string, patterns: string[]): boolean {
  let normalized: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    normalized = `${u.protocol}//${u.host.toLowerCase()}${u.pathname}`;
  } catch {
    return false;
  }
  return patterns.some((p) => normalized.startsWith(p));
}
