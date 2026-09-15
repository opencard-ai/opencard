/**
 * Google Search Console Daily Report
 *
 * Usage: npx tsx scripts/gsc-daily.ts
 * Runs via cron job.
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import generateSitemap from '../app/sitemap';
import { getAllCards } from '../lib/cards';
import { GUIDES } from '../lib/guides';
import { Baseline, COHORT_LABELS, Cohort, IndexPolicy, classifyPolicy, compareCohorts, normalizeUrl, cardIdsFromRecords } from './gsc-cohorts';

const TOKEN_PATH = path.join(process.cwd(), '.gsc-token.json');
const REPORT_PATH = path.join(process.cwd(), '.gsc-report-history.json');
const BASELINE_PATH = path.join(process.cwd(), '.gsc-cohort-baseline.json');
const SITE_URL = 'https://opencardai.com';

interface SearchMetric {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

interface PageMetric extends SearchMetric {
  url: string;
  policy: IndexPolicy;
}

interface OpportunityMetric extends SearchMetric {
  query: string;
  url: string;
}

interface SitemapMetric {
  submitted: number;
  indexed: number;
  errors: number;
  warnings: number;
  lastDownloaded: string | null;
}

interface GSCReport extends SearchMetric {
  date: string;
  period: { startDate: string; endDate: string };
  previousPeriod: { startDate: string; endDate: string } & SearchMetric;
  sitemap: SitemapMetric;
  cohortBaseline: string;
  cohorts: ReturnType<typeof compareCohorts>;
  pageCoverage: { current: number; previous: number; rowLimit: number };
  topPages: PageMetric[];
  opportunities: OpportunityMetric[];
}

function dateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function percentageChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

async function getAuthenticatedClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GSC_CLIENT_ID,
    process.env.GSC_CLIENT_SECRET,
    process.env.GSC_REDIRECT_URI || 'http://localhost:8080/oauth/callback',
  );

  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oauth2Client.setCredentials(tokens);
  return oauth2Client;
}

function metricFromRow(row: any): SearchMetric {
  return {
    clicks: Number(row?.clicks || 0),
    impressions: Number(row?.impressions || 0),
    ctr: Number(row?.ctr || 0) * 100,
    position: Number(row?.position || 0),
  };
}

async function fetchDailyReport(): Promise<{ report: GSCReport; alerts: string[] }> {
  const auth = await getAuthenticatedClient();
  const searchConsole = google.searchconsole({ version: 'v1', auth });

  // Search Console data is normally finalized with a two-day delay.
  const currentEnd = shiftDate(new Date(), -2);
  const currentStart = shiftDate(currentEnd, -6);
  const previousEnd = shiftDate(currentStart, -1);
  const previousStart = shiftDate(previousEnd, -6);

  const queryAnalytics = async (
    startDate: Date,
    endDate: Date,
    dimensions?: string[],
    rowLimit = 1,
  ) => {
    const requestBody: Record<string, unknown> = {
      startDate: dateString(startDate),
      endDate: dateString(endDate),
      rowLimit,
    };
    if (dimensions?.length) requestBody.dimensions = dimensions;

    const response = await searchConsole.searchanalytics.query({
      siteUrl: SITE_URL,
      requestBody,
    });
    return response.data.rows || [];
  };

  const [currentRows, previousRows, pageRows, previousPageRows, queryPageRows, sitemapResponse] = await Promise.all([
    queryAnalytics(currentStart, currentEnd),
    queryAnalytics(previousStart, previousEnd),
    queryAnalytics(currentStart, currentEnd, ['page'], 25000),
    queryAnalytics(previousStart, previousEnd, ['page'], 25000),
    queryAnalytics(currentStart, currentEnd, ['query', 'page'], 1000),
    searchConsole.sitemaps.list({ siteUrl: SITE_URL }),
  ]);

  const current = metricFromRow(currentRows[0]);
  const previous = metricFromRow(previousRows[0]);

  const context = {
    indexableUrls: new Set(generateSitemap().map(item => normalizeUrl(item.url))),
    cardIds: cardIdsFromRecords(getAllCards()),
    guideSlugs: new Set(GUIDES.map(guide => guide.slug)),
  };
  // Freeze membership once. Missing GSC impressions never means newly published.
  // This baseline starts today; it cannot reconstruct the August policy change.
  const baseline: Baseline = fs.existsSync(BASELINE_PATH)
    ? JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'))
    : { capturedAt: new Date().toISOString(), indexableUrls: [...context.indexableUrls].sort() };
  if (!baseline.capturedAt || !Array.isArray(baseline.indexableUrls) || !baseline.indexableUrls.every(url => typeof url === 'string')) {
    throw new Error('Invalid GSC cohort baseline; restore the original baseline before reporting');
  }
  if (!fs.existsSync(BASELINE_PATH)) fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2), { flag: 'wx' });
  const asPages = (rows: typeof pageRows) => rows.map(row => ({ url: String(row.keys?.[0] || ''), ...metricFromRow(row) }));
  const cohorts = compareCohorts(asPages(pageRows), asPages(previousPageRows), context, baseline);

  const topPages = pageRows
    .map((row: any): PageMetric => ({
      url: String(row.keys?.[0] || ''),
      policy: classifyPolicy(String(row.keys?.[0] || ''), context),
      ...metricFromRow(row),
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 5);

  const opportunities = queryPageRows
    .map((row: any): OpportunityMetric => ({
      query: String(row.keys?.[0] || ''),
      url: String(row.keys?.[1] || ''),
      ...metricFromRow(row),
    }))
    .filter((row) => classifyPolicy(row.url, context) === 'indexable' && row.clicks === 0 && row.impressions >= 2 && row.position >= 4 && row.position <= 20)
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, 5);

  const sitemap = (sitemapResponse.data.sitemap || []).reduce<SitemapMetric>(
    (total, item) => {
      for (const content of item.contents || []) {
        if (content.type !== 'web') continue;
        total.submitted += Number(content.submitted || 0);
        total.indexed += Number(content.indexed || 0);
      }
      total.errors += Number(item.errors || 0);
      total.warnings += Number(item.warnings || 0);
      if (item.lastDownloaded && (!total.lastDownloaded || item.lastDownloaded > total.lastDownloaded)) {
        total.lastDownloaded = item.lastDownloaded;
      }
      return total;
    },
    { submitted: 0, indexed: 0, errors: 0, warnings: 0, lastDownloaded: null },
  );

  const report: GSCReport = {
    date: dateString(new Date()),
    period: { startDate: dateString(currentStart), endDate: dateString(currentEnd) },
    previousPeriod: {
      startDate: dateString(previousStart),
      endDate: dateString(previousEnd),
      ...previous,
    },
    ...current,
    sitemap,
    cohortBaseline: baseline.capturedAt,
    cohorts,
    pageCoverage: { current: pageRows.length, previous: previousPageRows.length, rowLimit: 25000 },
    topPages,
    opportunities,
  };

  const alerts: string[] = [];
  const impressionsChange = percentageChange(current.impressions, previous.impressions);
  const clicksChange = percentageChange(current.clicks, previous.clicks);

  if (impressionsChange !== null && previous.impressions > 100 && impressionsChange <= -50) {
    alerts.push(`⚠️ Sitewide impressions dropped ${Math.abs(impressionsChange).toFixed(0)}% (${previous.impressions} → ${current.impressions}); assess policy cohorts before attributing this to SEO regression.`);
  }
  if (clicksChange !== null && previous.clicks > 10 && clicksChange <= -50) {
    alerts.push(`⚠️ Clicks dropped ${Math.abs(clicksChange).toFixed(0)}% (${previous.clicks} → ${current.clicks})`);
  }
  if (sitemap.errors > 0 || sitemap.warnings > 0) {
    alerts.push(`⚠️ Sitemap reports ${sitemap.errors} error(s) and ${sitemap.warnings} warning(s)`);
  }

  const history = fs.existsSync(REPORT_PATH) ? JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8')) : [];
  history.push(report);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(history.slice(-30), null, 2));

  return { report, alerts };
}

function formatDelta(current: number, previous: number): string {
  const change = percentageChange(current, previous);
  if (change === null) return 'n/a';
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

function formatReport(report: GSCReport, alerts: string[]): string {
  let message = `📊 **GSC Daily Report** (${report.date})\n\n`;
  if (alerts.length) message += `${alerts.join('\n')}\n\n`;

  message += `📈 **Finalized 7 Days (${report.period.startDate} → ${report.period.endDate})**\n`;
  message += `• Clicks: ${report.clicks} (${formatDelta(report.clicks, report.previousPeriod.clicks)} vs prior 7d)\n`;
  message += `• Impressions: ${report.impressions} (${formatDelta(report.impressions, report.previousPeriod.impressions)} vs prior 7d)\n`;
  message += `• CTR: ${report.ctr.toFixed(2)}% (prior ${report.previousPeriod.ctr.toFixed(2)}%)\n`;
  message += `• Avg position: ${report.position.toFixed(1)} (prior ${report.previousPeriod.position.toFixed(1)})\n\n`;

  message += `🧩 **Policy cohorts — same membership in both periods**\n`;
  for (const key of Object.keys(COHORT_LABELS) as Cohort[]) {
    const { current, previous } = report.cohorts[key];
    const position = (metric: typeof current) => metric.impressions ? metric.position.toFixed(1) : 'n/a';
    message += `• ${COHORT_LABELS[key]}: ${previous.impressions} → ${current.impressions} imp (${formatDelta(current.impressions, previous.impressions)}); ${previous.clicks} → ${current.clicks} clicks; pos ${position(previous)} → ${position(current)}\n`;
  }
  message += `• Baseline captured ${report.cohortBaseline}. New = newly indexable since that snapshot, not newly published or first seen in GSC. No retrospective August attribution.\n`;
  message += `• Current policy intent, not Google's index status. Page rows: ${report.pageCoverage.current} / ${report.pageCoverage.previous} (current / prior; cap ${report.pageCoverage.rowLimit} each). GSC may omit rows; cohort sums need not equal site totals. Aggregate positions can shift with query mix.\n\n`;

  message += `🗺️ **Sitemap Status**\n`;
  message += `• Submitted URLs: ${report.sitemap.submitted}\n`;
  message += `• GSC-reported indexed URLs: ${report.sitemap.indexed}\n`;
  message += `• Errors / warnings: ${report.sitemap.errors} / ${report.sitemap.warnings}\n`;
  message += `• Last downloaded: ${report.sitemap.lastDownloaded || 'unknown'}\n`;
  message += `• Note: sitemap indexed counts may lag; URL Inspection remains authoritative for an individual URL.\n\n`;

  if (report.topPages.length) {
    message += `🏆 **Top Pages by Impressions**\n`;
    report.topPages.forEach((page, index) => {
      const shortUrl = page.url.replace(`${SITE_URL}/`, '');
      message += `${index + 1}. ${shortUrl} [${page.policy}] — ${page.impressions} imp / ${page.clicks} click / pos ${page.position.toFixed(1)}\n`;
    });
    message += '\n';
  }

  if (report.opportunities.length) {
    message += `🎯 **Near-Page-One Opportunities (indexable policy only; 0 clicks, position 4–20)**\n`;
    report.opportunities.forEach((item, index) => {
      const shortUrl = item.url.replace(`${SITE_URL}/`, '');
      message += `${index + 1}. “${item.query}” → ${shortUrl} — ${item.impressions} imp / pos ${item.position.toFixed(1)}\n`;
    });
  } else {
    message += `🎯 **Near-Page-One Opportunities:** none meeting the current threshold.\n`;
  }

  return message;
}

async function main() {
  try {
    const { report, alerts } = await fetchDailyReport();
    console.log(formatReport(report, alerts));
    if (alerts.length) process.exitCode = 1;
  } catch (error: any) {
    console.error('❌ GSC Report Error:', error.message);
    process.exitCode = 1;
  }
}

main();
