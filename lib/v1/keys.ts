import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "ocv_live_";
const KEY_RE = /^ocv_live_[A-Za-z0-9_-]{43}$/;
const LOOKUP_LEN = API_KEY_PREFIX.length + 12;

export function generateApiKey(): { plaintext: string; lookup: string; hash: string } {
  const plaintext = API_KEY_PREFIX + randomBytes(32).toString("base64url");
  return { plaintext, lookup: keyLookup(plaintext), hash: hashApiKey(plaintext) };
}

export function isWellFormedKey(key: string): boolean {
  return KEY_RE.test(key);
}

/** Non-secret lookup prefix (indexed). 12 base64url chars = 72 bits; collisions are rejected by UNIQUE. */
export function keyLookup(key: string): string {
  return key.slice(0, LOOKUP_LEN);
}

export function hashApiKey(key: string): string {
  return "sha256:" + createHash("sha256").update(key, "utf8").digest("hex");
}

export function hashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}
