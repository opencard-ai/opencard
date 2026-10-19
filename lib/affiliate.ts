import type { CreditCard } from "@/lib/cards";

/**
 * Affiliate links are DORMANT. They render only when BOTH:
 *   1. NEXT_PUBLIC_AFFILIATE_LINKS_ENABLED === "true" (unset/anything else = off), and
 *   2. the card record carries a valid `affiliate_url`.
 * Do not enable while the site runs on Vercel Hobby (non-commercial use only);
 * turning this on needs an explicit owner decision and a plan change.
 */
export function affiliateLinksEnabled(flag: string | undefined = process.env.NEXT_PUBLIC_AFFILIATE_LINKS_ENABLED): boolean {
  return flag === "true";
}

/** Absolute https URL with a hostname, no credentials, no whitespace. */
export function isValidAffiliateUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0 || value.length > 2048) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** The affiliate URL to render for a card, or null (the default) when dormant/absent/invalid. */
export function getAffiliateUrl(
  card: Pick<CreditCard, "affiliate_url">,
  enabled: boolean = affiliateLinksEnabled(),
): string | null {
  if (!enabled) return null;
  return isValidAffiliateUrl(card.affiliate_url) ? card.affiliate_url : null;
}
