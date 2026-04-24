/**
 * Google Search Console Daily Report
 * 
 * Usage: npx tsx scripts/gsc-daily.ts
 * Runs via cron job
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const TOKEN_PATH = path.join(process.cwd(), '.gsc-token.json');
const REPORT_PATH = path.join(process.cwd(), '.gsc-report-history.json');

const SITE_URL = 'https://opencardai.com';

interface GSCReport {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  pagesIndexed: number;
  topPages: { url: string; impressions: number; clicks: number }[];
}

async function getAuthenticatedClient() {
  const credentials = {
    client_id: process.env.GSC_CLIENT_ID,
    client_secret: process.env.GSC_CLIENT_SECRET,
    redirect_uri: process.env.GSC_REDIRECT_URI || 'http://localhost:8080/oauth/callback',
  };
  
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uri
  );
  
  const tokens = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  oauth2Client.setCredentials(tokens);
  
  return oauth2Client;
}

async function fetchDailyReport(): Promise<{ report: GSCReport; alert: string | null }> {
  const auth = await getAuthenticatedClient();
  const scoper = google.searchconsole({ version: 'v1', auth });
  
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  // Fetch page data
  const response = await scoper.searchanalytics.query({
    siteUrl: SITE_URL,
    requestBody: {
      startDate: startStr,
      endDate: endStr,
      dimensions: ['page'],
      rowLimit: 20,
    },
  });
  
  const rows = response.data.rows || [];
  
  // Calculate totals
  const totals = rows.reduce((acc: any, row: any) => ({
    clicks: acc.clicks + row.clicks,
    impressions: acc.impressions + row.impressions,
  }), { clicks: 0, impressions: 0 });
  
  const report: GSCReport = {
    date: new Date().toISOString().split('T')[0],
    clicks: totals.clicks,
    impressions: totals.impressions,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0,
    pagesIndexed: rows.length,
    topPages: rows.slice(0, 5).map((row: any) => ({
      url: row.keys[0],
      impressions: row.impressions,
      clicks: row.clicks,
    })),
  };
  
  // Check for alerts
  let alert: string | null = null;
  
  // Load previous report
  const history = fs.existsSync(REPORT_PATH) 
    ? JSON.parse(fs.readFileSync(REPORT_PATH, 'utf8'))
    : [];
  
  if (history.length > 0) {
    const prev = history[history.length - 1];
    
    // Alert if impressions dropped > 50%
    if (prev.impressions > 100 && report.impressions < prev.impressions * 0.5) {
      alert = `⚠️ Impressions dropped ${((1 - report.impressions / prev.impressions) * 100).toFixed(0)}% (${prev.impressions} → ${report.impressions})`;
    }
    
    // Alert if clicks dropped significantly
    if (prev.clicks > 10 && report.clicks < prev.clicks * 0.5) {
      alert = `⚠️ Clicks dropped ${((1 - report.clicks / prev.clicks) * 100).toFixed(0)}% (${prev.clicks} → ${report.clicks})`;
    }
  }
  
  // Save to history
  history.push(report);
  fs.writeFileSync(REPORT_PATH, JSON.stringify(history.slice(-30), null, 2)); // Keep last 30 reports
  
  return { report, alert };
}

function formatReport(report: GSCReport, alert: string | null): string {
  let msg = `📊 **GSC Daily Report** (${report.date})\n\n`;
  
  if (alert) {
    msg += alert + '\n\n';
  }
  
  msg += `📈 **Last 7 Days:**\n`;
  msg += `• Clicks: ${report.clicks}\n`;
  msg += `• Impressions: ${report.impressions}\n`;
  msg += `• CTR: ${report.ctr.toFixed(2)}%\n`;
  msg += `• Pages Indexed: ${report.pagesIndexed}\n\n`;
  
  if (report.topPages.length > 0) {
    msg += `🏆 **Top Pages:**\n`;
    report.topPages.forEach((p, i) => {
      const shortUrl = p.url.replace('https://opencardai.com/', '');
      msg += `${i + 1}. ${shortUrl.substring(0, 40)}... (${p.impressions} impressions)\n`;
    });
  }
  
  return msg;
}

async function main() {
  try {
    const { report, alert } = await fetchDailyReport();
    const message = formatReport(report, alert);
    
    // Output for cron job
    console.log(message);
    
    // Exit with alert flag if needed
    if (alert) {
      process.exit(1); // Cron will see this as failure for alerting
    }
  } catch (error: any) {
    console.error('❌ GSC Report Error:', error.message);
    process.exit(1);
  }
}

main();
