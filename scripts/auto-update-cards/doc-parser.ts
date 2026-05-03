/**
 * Parses Doctor of Credit RSS feed to find credit card related items.
 */

import { get } from "node:https";
import { decode } from "html-entities";

export interface DocItem {
  title: string;
  url: string;
  pubDate: string;
  categories: string[];
}

const DOC_RSS_URL = "https://www.doctorofcredit.com/feed/";

function fetchHttps(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, { headers: { "User-Agent": "OpenCard/1.0 (credit card research bot)", Accept: "*/*" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchHttps(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

function parseRSS(xml: string): DocItem[] {
  const items: DocItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const titleM = item.match(/<title>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/title>/);
    const links = [...item.matchAll(/<link>(.*?)<\/link>/g)].map((m) => m[1]);
    const link = links[links.length - 1] || links[0] || "";
    const dateM = item.match(/<pubDate>(.*?)<\/pubDate>/);
    const cats = [...item.matchAll(/<category>(?:<!\[CDATA\[(.*?)\]\]>|(.*?))<\/category>/g)].map(
      (m) => m[1] || m[2]
    );

    if (titleM) {
      const rawTitle = decode(titleM[1] || titleM[2] || "");
      items.push({
        title: rawTitle.trim(),
        url: link.trim(),
        pubDate: dateM ? dateM[1] : "",
        categories: cats.map((c) => decode(c).trim()).filter(Boolean),
      });
    }
  }
  return items;
}

/** Keywords strongly associated with credit card offers */
const CC_KEYWORDS = [
  "credit card",
  "card",
  "bonus",
  "offer",
  "welcome offer",
  "increased offer",
  "elevated",
  "annual fee",
  "chase",
  "amex",
  "american express",
  "capital one",
  "discover",
  "citi",
  "barclays",
  "wells fargo",
  "marriott",
  "hilton",
  "delta",
  "united",
  "southwest",
  "alaska",
  "jetblue",
  "membership rewards",
  "ultimate rewards",
  "thankyou points",
  "bonvoy",
  "free night",
  "statement credit",
];

function isCreditCardRelated(item: DocItem): boolean {
  const text = [item.title, ...item.categories].join(" ").toLowerCase();
  return CC_KEYWORDS.some((kw) => text.includes(kw));
}

/**
 * Fetches DoC RSS and returns credit-card related items from the last `days` days.
 */
export async function parseDocRss(days: number = 7): Promise<DocItem[]> {
  console.log(`   Fetching DoC RSS (${DOC_RSS_URL})...`);
  const xml = await fetchHttps(DOC_RSS_URL);
  const allItems = parseRSS(xml);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffMs = cutoff.getTime();

  return allItems.filter((item) => {
    if (!item.pubDate) return false;
    const pubMs = new Date(item.pubDate).getTime();
    if (isNaN(pubMs)) return false;
    if (pubMs < cutoffMs) return false;
    return isCreditCardRelated(item);
  });
}
