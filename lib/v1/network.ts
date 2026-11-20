import { createHash } from "node:crypto";
import { isIP } from "node:net";

/** Hash a coarse IPv4 /24 or IPv6 /64; never persist the raw client address.
 * Trust forwarded headers only behind Vercel's configured ingress.
 */
export function networkGroup(ip: string): string | null {
  let group: string;
  if (isIP(ip) === 4) group = ip.split(".").slice(0, 3).join(".");
  else if (isIP(ip) === 6) {
    const normalized = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
    const [left, right = ""] = normalized.split("::");
    const a = left ? left.split(":") : [], b = right ? right.split(":") : [];
    group = [...a, ...Array(8 - a.length - b.length).fill("0"), ...b].slice(0, 4).map((p) => p.padStart(4, "0")).join(":");
  } else return null;
  return createHash("sha256").update(group).digest("hex");
}
