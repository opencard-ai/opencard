/** Offline policy/cohort logic. Policy is intent, never proof of Google's index. */
export type Cohort = 'retained' | 'excluded' | 'new' | 'unknown';
export type IndexPolicy = 'indexable' | 'noindex' | 'unknown';
export interface Metric { clicks: number; impressions: number; ctr: number; position: number }
export interface PageMetric extends Metric { url: string }
export interface PolicyContext {
  indexableUrls: Set<string>;
  cardIds: Set<string>;
  guideSlugs: Set<string>;
}
export interface Baseline { capturedAt: string; indexableUrls: string[] }
export const COHORT_LABELS: Record<Cohort, string> = {
  retained: 'Retained core (baseline)', excluded: 'Intentional noindex',
  new: 'Newly indexable since baseline', unknown: 'Unknown / unclassified',
};
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.origin !== 'https://opencardai.com') return raw;
    return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
  } catch { return raw; }
}
export function classifyPolicy(raw: string, context: PolicyContext): IndexPolicy {
  const url = normalizeUrl(raw);
  if (context.indexableUrls.has(url)) return 'indexable';
  const match = /^https:\/\/opencardai\.com\/(en|zh|zh-cn|es)\/(cards|guides)\/([^/]+)$/.exec(url);
  if (match && ((match[2] === 'cards' && context.cardIds.has(match[3])) ||
      (match[2] === 'guides' && match[1] !== 'en' && context.guideSlugs.has(match[3])))) return 'noindex';
  if (/^https:\/\/opencardai\.com\/(zh|zh-cn|es)\/benefit-expiration-tracker$/.test(url)) return 'noindex';
  return 'unknown';
}
export function classifyCohort(url: string, context: PolicyContext, baseline: Baseline): Cohort {
  const policy = classifyPolicy(url, context);
  if (policy === 'noindex') return 'excluded';
  if (policy === 'unknown') return 'unknown';
  return baseline.indexableUrls.includes(normalizeUrl(url)) ? 'retained' : 'new';
}
export function compareCohorts(current: PageMetric[], previous: PageMetric[], context: PolicyContext, baseline: Baseline) {
  const empty = (): Metric & { pages: number } => ({ clicks: 0, impressions: 0, ctr: 0, position: 0, pages: 0 });
  const result = Object.fromEntries(Object.keys(COHORT_LABELS).map(key => [key, { current: empty(), previous: empty() }])) as Record<Cohort, { current: Metric & { pages: number }; previous: Metric & { pages: number } }>;
  for (const [period, rows] of [['current', current], ['previous', previous]] as const) {
    for (const row of rows) {
      const total = result[classifyCohort(row.url, context, baseline)][period];
      total.clicks += row.clicks;
      total.impressions += row.impressions;
      total.position += row.position * row.impressions;
      total.pages += 1;
    }
    for (const cohort of Object.values(result)) {
      const total = cohort[period];
      total.position = total.impressions ? total.position / total.impressions : 0;
      total.ctr = total.impressions ? total.clicks / total.impressions * 100 : 0;
    }
  }
  return result;
}

/** Product routes use card_id, which need not equal the source JSON filename. */
export function cardIdsFromRecords(cards: ReadonlyArray<{ card_id: string }>): Set<string> {
  return new Set(cards.map(card => card.card_id));
}
