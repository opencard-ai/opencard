/**
 * Configuration for the auto-update-cards pipeline.
 * All constants are centralized here for easy tweaking.
 */

export const CONFIG = {
  /** Maximum cards to process per weekly run */
  WEEKLY_BUDGET: 50,

  /**
   * Issuers excluded from the auto-update queue.
   * American Express was here because amex.com pages are React SPAs that
   * never settle to `networkidle` and resist the Playwright fallback.
   * The fix wasn't a smarter scraper — it was switching the 31 mappable
   * Amex card sources to USCCG card-review pages (static HTML), so the
   * pipeline now scrapes them like any other issuer.
   * Empty by default; add an issuer here if a class of pages turns out
   * to be unscrapeable and there's no good third-party mirror.
   */
  SKIP_ISSUERS: [] as readonly string[],

  /** Priority: featured cards are always scanned first */
  FEATURED_PRIORITY: 25,

  /** DoC RSS scan window (days into the past) */
  DOC_LOOKBACK_DAYS: 7,

  /** Delay between card scrapes (ms) — random 1-3s to avoid rate limits */
  SCRAPE_DELAY_MIN_MS: 1000,
  SCRAPE_DELAY_MAX_MS: 3000,

  /** Cloudflare retry attempts before giving up */
  CLOUDFLARE_MAX_RETRIES: 3,

  /** Minimum AI confidence to proceed to diff (otherwise → audit report) */
  MIN_CONFIDENCE: 0.7,

  /** Minimum verbatim quote length (chars) to be considered valid */
  MIN_QUOTE_LENGTH: 30,

  /** Stale threshold: cards not updated in this many days get priority */
  STALE_THRESHOLD_DAYS: 60,

  /** GitHub Actions timeout */
  TIMEOUT_MINUTES: 30,

  /** Commit message prefix */
  BOT_BRANCH_PREFIX: "bot/update",

  /** Labels applied to PRs */
  PR_LABELS: ["bot-generated", "needs-review"],

  /** Risk label mapping */
  RISK_LABELS: {
    LOW: "LOW",
    MED: "MED",
    HIGH: "HIGH",
  } as const,
} as const;

export type RiskLevel = "LOW" | "MED" | "HIGH";
