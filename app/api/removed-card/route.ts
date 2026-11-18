import type { NextRequest } from "next/server";
import { getCardById, isClosedToNewApplicants } from "@/lib/cards";
import { locales, type Locale } from "@/lib/i18n";
import { isIndexableCard } from "@/lib/indexable-cards";
import { getNotFoundLinks } from "@/lib/not-found";
import { removedCardCopy } from "@/lib/removed-card-copy";
import { getRemovedCard } from "@/lib/removed-cards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Intentionally no Vary on RSC/Next-Router-*; the response is identical for all of them.
const goneHeaders = {
  "Content-Type": "text/html; charset=utf-8",
  "X-Robots-Tag": "noindex",
  "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function fallbackHtml(locale: Locale, card: NonNullable<ReturnType<typeof getRemovedCard>>) {
  const copy = removedCardCopy[locale];
  const alternatives = card.alternatives.flatMap((id) => {
    const alternative = getCardById(id);
    return alternative && isIndexableCard(alternative) && !isClosedToNewApplicants(alternative)
      ? [alternative] : [];
  });
  const links = getNotFoundLinks(locale).filter(({ href }) =>
    [`/${locale}/find`, `/${locale}#cards-section`, `/${locale}`].includes(href));
  return `<!doctype html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8">
<meta name="robots" content="noindex"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(copy.title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:0;background:#f8fafc;color:#0f172a}header,main{max-width:44rem;margin:auto;padding:2rem 1.5rem}header{font-weight:700}h1{font-size:2rem}p{line-height:1.6}ul{padding-left:1.5rem}li{margin:1rem 0}a{color:#1d4ed8;text-underline-offset:3px}a:focus-visible{outline:2px solid;outline-offset:4px}</style>
</head><body><header>OpenCard</header><main>
<h1>${escapeHtml(copy.heading)}</h1><p>${escapeHtml(copy.description(card.name))}</p>
${alternatives.length ? `<h2>${escapeHtml(copy.alternatives)}</h2><ul>${alternatives.map((alternative) =>
    `<li><a href="${escapeHtml(`/${locale}/cards/${alternative.card_id}`)}">${escapeHtml(alternative.name)} — ${escapeHtml(alternative.issuer)}</a></li>`
  ).join("")}</ul>` : ""}
<nav><ul>${links.map(({ href, label }) => `<li><a href="${escapeHtml(href)}">${escapeHtml(label)}</a></li>`).join("")}</ul></nav>
</main></body></html>`;
}

export async function GET(req: NextRequest) {
  // Next.js can expose the original URL here after a middleware rewrite.
  // Its path is authoritative; query parameters on a public card URL are arbitrary.
  const cardPath = req.nextUrl.pathname.match(/^\/([^/]+)\/cards\/([^/]+)\/?$/);
  const lang = cardPath ? cardPath[1] : req.nextUrl.searchParams.get("lang");
  const id = cardPath ? cardPath[2] : req.nextUrl.searchParams.get("id");
  const locale = locales.find((value) => value === lang);
  const card = getRemovedCard(id ?? "");
  if (!locale || !card) {
    return new Response("Not found", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" },
    });
  }

  const allowedHosts = [
    "opencardai.com",
    "www.opencardai.com",
    process.env.VERCEL_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
  ].filter(Boolean);
  const canSelfFetch = allowedHosts.includes(req.nextUrl.host) ||
    /^(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(req.nextUrl.host);
  if (!canSelfFetch) {
    return new Response(fallbackHtml(locale, card), { status: 410, headers: goneHeaders });
  }

  // Fetch a full document even for RSC/prefetch requests, so the client hard-navigates.
  // Do not forward request headers or cookies, or the render response's Set-Cookie.
  try {
    const rendered = await fetch(`${req.nextUrl.origin}/${locale}/removed-card/${card.id}`, {
      headers: { "x-opencard-removed-render": "1" },
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5000),
    });
    if (rendered.status === 200 && /^text\/html(?:;|$)/i.test(rendered.headers.get("content-type") ?? "")) {
      const html = await rendered.text();
      if (html.includes('id="removed-card-heading"')) {
        return new Response(html, { status: 410, headers: goneHeaders });
      }
    } else {
      await rendered.body?.cancel();
    }
  } catch {
    // Preview protection, timeouts, and render failures still get a useful 410 body.
  }
  return new Response(fallbackHtml(locale, card), { status: 410, headers: goneHeaders });
}
