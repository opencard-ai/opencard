/**
 * Registry of long-form pillar guides under `content/guides/*.mdx`.
 *
 * Each entry must match an `.mdx` file in `content/guides/` and the file must
 * export a `metadata` object (title, summary, dates, word_count) plus a
 * default React component (auto-emitted by `@next/mdx` from the markdown
 * body).
 *
 * Keeping this list hand-curated rather than auto-globbed because:
 *   1. Order matters for the guides index page (most relevant first).
 *   2. We want PR review to be a clear gate for new guides.
 *   3. Glob + dynamic import lookups make Vercel build trace bigger.
 *
 * If this list grows past ~30 entries the trade-off flips and a generated
 * index from a script becomes worthwhile.
 */

export type GuideSummary = {
  slug: string;
  /** Canonical English title shown on /guides index and as document title. */
  title: string;
  /** One-line meta description for /guides cards + OpenGraph. */
  summary: string;
  /** ISO date the guide was first published. */
  published: string;
  /** ISO date the guide was last meaningfully revised. */
  updated: string;
  /** Approximate word count of the prose body — useful for AdSense review
   * heuristics that prefer ≥1500 words on pillar pages. */
  word_count: number;
  /** Optional tags surfaced on the index page. */
  tags?: string[];
};

export const GUIDES: GuideSummary[] = [
  {
    slug: "transferable-points-101",
    title: "Transferable Points 101: how Chase UR, Amex MR, Citi TYP, and Capital One Miles actually work",
    summary:
      "A plain-language walkthrough of the four major US transferable-points currencies, why their flexibility outweighs raw earning rates, and when transferring beats redeeming directly.",
    published: "2026-05-24",
    updated: "2026-05-24",
    word_count: 2000,
    tags: ["points", "strategy", "beginner"],
  },
];

export function getGuide(slug: string): GuideSummary | undefined {
  return GUIDES.find((g) => g.slug === slug);
}
