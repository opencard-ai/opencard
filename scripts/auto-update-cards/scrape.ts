/**
 * Scrapes a card's issuer website with a multi-step fallback chain:
 *  1. Primary: card.sources[0].url (HEAD first to validate)
 *  2. Fallback A: news.json DoC items matching the card name
 *  3. Fallback B: DuckDuckGo Lite search
 *  4. Cloudflare retry: Playwright screenshot + DOM extraction
 */

import { get } from "node:https";
import type { Card } from "./cards-loader";

export interface ScrapeResult {
  html?: string;
  fallbackUrl?: string; // which URL was used
  source: "primary" | "doc" | "duckduckgo" | "playwright" | "none";
  error?: string;
}

const MOZILLA_UA = "Mozilla/5.0 (compatible; OpenCard/1.0; +https://opencardai.com) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const CLOUDFLARE_KEYWORDS = ["cf-browser-verification", "cloudflare", "Checking your browser"];

function fetchHtml(url: string, timeoutMs = 15000): Promise<{ html: string; status: number }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout fetching ${url}`)), timeoutMs);
    get(url, { headers: { "User-Agent": MOZILLA_UA, Accept: "text/html,*/*" } }, (res) => {
      clearTimeout(timer);
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect once
        fetchHtml(res.headers.location, timeoutMs).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve({ html: data, status: res.statusCode || 0 }));
    }).on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function headCheck(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    get(url, { method: "HEAD", headers: { "User-Agent": MOZILLA_UA } }, (res) => {
      resolve(res.statusCode === 200);
    }).on("error", () => resolve(false));
  });
}

function isCloudflarePage(html: string): boolean {
  return CLOUDFLARE_KEYWORDS.some((kw) => html.toLowerCase().includes(kw));
}

/**
 * Reject HTML that obviously isn't a real issuer terms page. The 2026-05-04
 * schedule run failed because the DDG fallback resolved to DuckDuckGo's own
 * homepage and one issuer page returned the unrendered template (`{{{...}}}`)
 * — both got passed to the LLM and burned MiniMax credits returning low-
 * confidence garbage. Fail fast here instead.
 */
function isLikelyValidIssuerHtml(
  html: string,
  card: Card
): { ok: boolean; reason?: string } {
  const lower = html.toLowerCase();

  if (/duckduckgo\.com|lite\.duckduckgo|<title>[^<]*duckduckgo/i.test(html)) {
    return { ok: false, reason: "DuckDuckGo content (search page, not issuer terms)" };
  }
  if (/\{\{\{[^}]+\}\}\}|\{\{[a-z][^}]*\}\}/i.test(html)) {
    return { ok: false, reason: "unrendered template tokens (server-side render failed)" };
  }

  const cardWords = card.name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const issuerWords = card.issuer
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const hasKeyword =
    cardWords.some((w) => lower.includes(w)) ||
    issuerWords.some((w) => lower.includes(w));
  if (!hasKeyword) {
    return { ok: false, reason: "HTML doesn't mention card name or issuer" };
  }

  return { ok: true };
}

/**
 * Try DuckDuckGo Lite search for issuer URL
 */
async function searchIssuerUrl(card: Card): Promise<string | null> {
  const query = encodeURIComponent(`${card.name} ${card.issuer} credit card terms`);
  const searchUrl = `https://lite.duckduckgo.com/lite/?q=${query}`;

  try {
    const { html } = await fetchHtml(searchUrl);
    const issuerDomain = card.issuer.toLowerCase().replace(/\s+/g, "");
    const linkMatch = html.match(/href="(https?:\/\/[^"]*?)"/g) || [];

    // Pull out every external URL, dropping DDG's own redirector / asset links.
    // Without this filter the fallback can hand back a DDG-internal URL whose
    // body is just the search homepage, which the LLM then tries to extract
    // from (see 2026-05-04 schedule run for the burn).
    const externalUrls = linkMatch
      .map((raw) => raw.match(/href="(https?:\/\/[^"]*)"/)?.[1])
      .filter((u): u is string => Boolean(u))
      .filter((u) => !/(?:^|\/\/)[^/]*duckduckgo\.com/i.test(u));

    for (const url of externalUrls) {
      if (url.includes(issuerDomain)) return url;
    }
    return externalUrls[0] || null;
  } catch {
    // Search failed
  }
  return null;
}

export async function scrapeCard(card: Card): Promise<ScrapeResult> {
  // Step 1: Primary source
  const primaryUrl = card.sources?.[0]?.url;
  if (primaryUrl) {
    try {
      const ok = await headCheck(primaryUrl);
      if (ok) {
        const { html, status } = await fetchHtml(primaryUrl);
        if (status === 200 && html.length > 500 && !isCloudflarePage(html)) {
          const valid = isLikelyValidIssuerHtml(html, card);
          if (valid.ok) {
            return { html, fallbackUrl: primaryUrl, source: "primary" };
          }
          console.warn(`   ⚠️  Primary source rejected: ${valid.reason}`);
        }
      }
    } catch (err) {
      console.warn(`   ⚠️  Primary source failed: ${(err as Error).message}`);
    }
  }

  // Step 2: Fallback A — news.json DoC items
  try {
    const newsPath = `${process.cwd()}/data/news.json`;
    const { readFileSync } = await import("node:fs");
    if (await import("node:fs").then(fs => fs.existsSync(newsPath))) {
      const news = JSON.parse(readFileSync(newsPath, "utf8"));
      const lowerName = card.name.toLowerCase();
      const match = (news.items || []).find((item: { title?: string }) =>
        item.title?.toLowerCase().includes(lowerName.slice(0, 20))
      );
      if (match?.url) {
        try {
          const { html, status } = await fetchHtml(match.url);
          if (status === 200 && html.length > 500 && isLikelyValidIssuerHtml(html, card).ok) {
            return { html, fallbackUrl: match.url, source: "doc" };
          }
        } catch {
          // continue to next fallback
        }
      }
    }
  } catch {
    // news.json not available
  }

  // Step 3: Fallback B — DuckDuckGo search
  try {
    const searchUrl = await searchIssuerUrl(card);
    if (searchUrl) {
      const { html, status } = await fetchHtml(searchUrl);
      if (status === 200 && html.length > 500 && !isCloudflarePage(html)) {
        const valid = isLikelyValidIssuerHtml(html, card);
        if (valid.ok) {
          return { html, fallbackUrl: searchUrl, source: "duckduckgo" };
        }
        console.warn(`   ⚠️  DDG fallback rejected: ${valid.reason}`);
      }
    }
  } catch {
    // search failed
  }

  // Step 4: Playwright Cloudflare / JS-render retry. Always attempt — the
  // try/catch handles the case where playwright isn't installed (locally)
  // or chromium fails to launch. The previous gate
  // (`PLAYWRIGHT_CHROMIUM_PATH || !process.env.CI`) inverted the intent and
  // skipped Playwright in GitHub Actions even though the workflow runs
  // `npx playwright install chromium` first, which is exactly where we need
  // it most (amex.com et al server-side render `{{{HTML_ESCAPER}}}` templates
  // that only resolve after JS executes).
  if (primaryUrl) {
    try {
      const playwright = await import("playwright");
      const browser = await playwright.chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setExtraHTTPHeaders({ "User-Agent": MOZILLA_UA });
        await page.goto(primaryUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
        const html = await page.content();
        if (html.length > 500 && isLikelyValidIssuerHtml(html, card).ok) {
          return { html, fallbackUrl: primaryUrl, source: "playwright" };
        }
      } finally {
        await browser.close();
      }
    } catch {
      // playwright unavailable or chromium launch failed — fall through
    }
  }

  return { source: "none", error: "All scraping methods failed" };
}
