/**
 * Configuration for the auto-update-cards pipeline.
 * All constants are centralized here for easy tweaking.
 */

export const CONFIG = {
  /** Maximum cards to process per weekly run */
  WEEKLY_BUDGET: 50,

  /**
   * Issuers temporarily excluded from the auto-update queue.
   * Amex pages are React SPAs that emit `{{{HTML_ESCAPER}}}` server-side
   * templates, never go fully `networkidle`, and resist the standard
   * Playwright fallback. Until a per-issuer scrape strategy is in place,
   * skip them to avoid burning a queue slot on guaranteed failure.
   * Remove an entry once a working extractor exists for that issuer.
   */
  SKIP_ISSUERS: ["American Express"] as readonly string[],

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
