/**
 * Google Search Console API Integration
 * 
 * Usage:
 *   npx tsx scripts/gsc-api.ts auth    # First time - get refresh token
 *   npx tsx scripts/gsc-api.ts report  # Fetch latest GSC data
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly'];
const TOKEN_PATH = path.join(process.cwd(), '.gsc-token.json');

const credentials = {
  client_id: process.env.GSC_CLIENT_ID,
  client_secret: process.env.GSC_CLIENT_SECRET,
  redirect_uri: process.env.GSC_REDIRECT_URI || 'http://localhost:8080/oauth/callback',
};

async function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    credentials.redirect_uri
  );
  return oauth2Client;
}

async function getAuthUrl() {
  const oauth2Client = await getOAuthClient();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
}

async function getTokenFromCode(code: string) {
  const oauth2Client = await getOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  
  // Save tokens to file
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('✅ Tokens saved to', TOKEN_PATH);
  console.log('\nRefresh token:', tokens.refresh_token ? '✅ Received' : '❌ Not received');
  console.log('(If no refresh token, you may need to revoke and re-authenticate)');
  
  return tokens;
}

async function loadSavedTokens() {
  if (!fs.existsSync(TOKEN_PATH)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
}

async function getAuthenticatedClient() {
  const tokens = await loadSavedTokens();
  if (!tokens) {
    console.error('❌ No saved tokens found. Run "npx tsx scripts/gsc-api.ts auth" first.');
    process.exit(1);
  }
  
  const oauth2Client = await getOAuthClient();
  oauth2Client.setCredentials(tokens);
  
  return oauth2Client;
}

async function fetchSearchAnalytics() {
  const auth = await getAuthenticatedClient();
  const scoper = google.searchconsole({ version: 'v1', auth });
  
  const siteUrl = 'https://opencardai.com';
  
  console.log('📊 Fetching GSC data for opencardai.com...\n');
  
  // Fetch last 28 days for better data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 28);
  
  const startStr = startDate.toISOString().split('T')[0];
  const endStr = endDate.toISOString().split('T')[0];
  
  try {
    // Search analytics - by page
    const response = await scoper.searchanalytics.query({
      siteUrl,
      requestBody: {
        startDate: startStr,
        endDate: endStr,
        dimensions: ['page'],
        rowLimit: 20,
      },
    });
    
    const rows = response.data.rows || [];
    
    console.log(`📈 Search Analytics (${startStr} to ${endStr})\n`);
    
    // Calculate totals first
    const totals = rows.reduce((acc: any, row: any) => ({
      clicks: acc.clicks + row.clicks,
      impressions: acc.impressions + row.impressions,
    }), { clicks: 0, impressions: 0 });
    
    console.log('--- Overall ---');
    console.log(`Total Clicks: ${totals.clicks}`);
    console.log(`Total Impressions: ${totals.impressions}`);
    console.log(`Avg CTR: ${totals.impressions > 0 ? ((totals.clicks / totals.impressions) * 100).toFixed(2) : 0}%`);
    
    if (rows.length > 0) {
      console.log('\n📄 Top Pages:');
      console.log('---------------');
      
      rows.forEach((row: any, i: number) => {
        const pageUrl = row.keys[0];
        const shortUrl = pageUrl.length > 60 ? pageUrl.substring(0, 57) + '...' : pageUrl;
        console.log(
          `${i + 1}. ${shortUrl}`,
          `| Clicks: ${row.clicks}`,
          `| Impressions: ${row.impressions}`
        );
      });
    } else {
      console.log('\n⚠️  No page data found. The site may not be indexed yet.');
      console.log('\n💡 Check Coverage report in GSC UI for indexing status.');
    }
    
  } catch (error: any) {
    console.error('❌ Error fetching data:', error.message);
    if (error.message.includes('accessNotConfigured')) {
      console.error('\n⚠️  GSC API may not be enabled. Enable it at:');
      console.error('https://console.cloud.google.com/apis/library/searchconsole.googleapis.com');
    }
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (command === 'auth') {
  getAuthUrl().then(url => {
    console.log('🔐 Authorization URL:\n');
    console.log(url);
    console.log('\n\n1. Open the URL above in your browser');
    console.log('2. Authorize access');
    console.log('3. Copy the "code" parameter from the redirect URL');
    console.log('4. Run: npx tsx scripts/gsc-api.ts callback <CODE>');
  });
} else if (command === 'callback') {
  const code = args[1];
  if (!code) {
    console.error('Usage: npx tsx scripts/gsc-api.ts callback <CODE>');
    process.exit(1);
  }
  getTokenFromCode(code);
} else if (command === 'report') {
  fetchSearchAnalytics();
} else {
  console.log('Usage:');
  console.log('  npx tsx scripts/gsc-api.ts auth      # Get authorization URL');
  console.log('  npx tsx scripts/gsc-api.ts callback <CODE>  # Exchange code for token');
  console.log('  npx tsx scripts/gsc-api.ts report    # Fetch latest GSC data');
}
