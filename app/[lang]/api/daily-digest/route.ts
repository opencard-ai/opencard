import { get } from "node:https";

const SOURCES = [
  { name: "reddit_churning", type: "reddit" as const, url: "https://www.reddit.com/r/churning/new.json?limit=20&t=day" },
  { name: "reddit_creditcards", type: "reddit" as const, url: "https://www.reddit.com/r/CreditCards/new.json?limit=20&t=day" },
  { name: "doctor_of_credit", type: "rss" as const, url: "https://www.doctorofcredit.com/feed/" },
  { name: "doctor_of_credit_banking", type: "rss" as const, url: "https://www.doctorofcredit.com/category/banking/page/1/feed/" },
];

function fetchHttps(url: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    get(url, { headers: { "User-Agent": "OpenCard/1.0", Accept: "*/*" } }, (res) => {
      if (res.statusCode != null && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchHttps(res.headers.location).then(resolve).catch(reject);
        return;
      }
      let data = "";
      res.on("data", (d) => (data += d));
      res.on("end", () => resolve(data));
    }).on("error", reject);
  });
}

interface RedditPost {
  data: {
    title: string;
    url: string;
    permalink: string;
    stickied: boolean;
    score: number;
    num_comments: number;
    created_utc: number;
  };
}

function parseReddit(json: { data?: { children?: RedditPost[] } }, sub: string) {
  return (json?.data?.children || [])
    .filter((c) => !c.data.stickied)
    .map((c) => ({
      title: c.data.title,
      url: c.data.url?.startsWith("/r/") ? `https://reddit.com${c.data.url}` : c.data.url,
      permalink: `https://reddit.com${c.data.permalink}`,
      score: c.data.score,
      comments: c.data.num_comments,
      source: `r/${sub}`,
      ts: new Date(c.data.created_utc * 1000).toISOString(),
    }));
}

interface RSSItem {
  title: string;
  url: string;
  source: string;
  categories: string[];
  date: string | null;
  ts: string | null;
}

function parseRSS(xml: string): RSSItem[] {
  const items: RSSItem[] = [];
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
      items.push({
        title: (titleM[1] || titleM[2] || "")
          .replace(/&#8217;/g, "'").replace(/&amp;/g, "&").replace(/&#8211;/g, "–"),
        url: link.trim(),
        source: "Doctor of Credit",
        categories: cats,
        date: dateM ? dateM[1] : null,
        ts: dateM ? new Date(dateM[1]).toISOString() : null,
      });
    }
  }
  return items;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  const all: RSSItem[] = [];

  for (const src of SOURCES) {
    if (src.type === "reddit") {
      try {
        const text = await fetchHttps(src.url);
        const json = JSON.parse(text) as { data?: { children?: RedditPost[] } };
        const posts = parseReddit(json, src.name.replace("reddit_", ""));
        all.push(...posts.filter((p) => new Date(p.ts).getTime() > cutoff) as unknown as RSSItem[]);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        all.push({ title: `[${src.name}] fetch failed: ${msg}`, source: src.name, url: "", categories: [], date: null, ts: new Date().toISOString() });
      }
    } else if (src.type === "rss") {
      try {
        const xml = await fetchHttps(src.url);
        const items = parseRSS(xml).filter(
          (i) => !i.date || new Date(i.date).getTime() > cutoff
        );
        all.push(...items);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        all.push({ title: `[${src.name}] fetch failed: ${msg}`, source: src.name, url: "", categories: [], date: null, ts: new Date().toISOString() });
      }
    }
  }

  const prio: Record<string, number> = { "Doctor of Credit": 0, "r/churning": 1, "r/CreditCards": 2 };
  all.sort(
    (a, b) =>
      (prio[a.source] ?? 9) - (prio[b.source] ?? 9) ||
      ((b as unknown as { score?: number }).score || 0) - ((a as unknown as { score?: number }).score || 0)
  );

  return Response.json({ items: all, fetched: new Date().toISOString() });
}
