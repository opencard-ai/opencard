import { localizedAlternates } from "@/lib/seo";
import type { Metadata } from "next";
import Link from "next/link";
import { locales, type Locale } from "@/lib/i18n";
import { currentWelcomeOffers, DISCLOSURE, LICENSE, MAX_LIMIT } from "@/lib/developer-api";
import AffiliateDisclosure from "@/app/components/AffiliateDisclosure";

export const dynamic = "force-static";
export const revalidate = 3600;

type Props = { params: Promise<{ lang: string }> };

export async function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang } = await params;
  return {
    title: "OpenCard for Developers: Card Data API and MCP Server",
    description: "Read-only access to OpenCard's US credit card data: JSON API, OpenAPI 3.1 spec, and an MCP server with search_cards, get_card and current_welcome_offers.",
    alternates: localizedAlternates(lang, "/developers"),
    // Developer docs are English-only; translated URLs stay out of the index.
    robots: lang === "en" ? undefined : { index: false, follow: true },
  };
}

const MCP_CONFIG = `{
  "mcpServers": {
    "opencard": {
      "type": "http",
      "url": "https://opencardai.com/api/mcp"
    }
  }
}`;

const CURL_LIST = `curl -s https://opencardai.com/api/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`;

const CURL_CALL = `curl -s https://opencardai.com/api/mcp \\
  -H 'Content-Type: application/json' \\
  -H 'Accept: application/json, text/event-stream' \\
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call",
       "params":{"name":"search_cards","arguments":{"query":"travel","max_annual_fee":100,"limit":5}}}'`;

const ENDPOINTS: [string, string][] = [
  ["GET /api/public/cards?q=&issuer=&network=&max_annual_fee=&no_foreign_transaction_fee=&tag=&include_discontinued=&limit=", "Search cards. Returns summaries with a link to each card page."],
  ["GET /api/public/cards/{card_id}", "Full public record for one card: fees, welcome offer, earning rates, credits, benefits, insurance, sources."],
  ["GET /api/public/welcome-offers?issuer=&min_estimated_value=&elevated_only=&limit=", "Current welcome offers on cards open to new applicants, sorted by estimated value."],
  ["POST /api/mcp", "MCP server (Streamable HTTP, stateless JSON-RPC 2.0)."],
  ["GET /openapi.json", "OpenAPI 3.1 spec for the endpoints above."],
  ["GET /llms.txt", "Site summary for language models."],
];

function Code({ children }: { children: string }) {
  return <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-sm leading-relaxed text-slate-100"><code>{children}</code></pre>;
}

export default async function DevelopersPage({ params }: Props) {
  const { lang } = await params;
  const locale = (locales as readonly string[]).includes(lang) ? (lang as Locale) : "en";
  const sample = currentWelcomeOffers({ limit: 3 }).offers;

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <article className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900 mb-4">OpenCard for developers</h1>
        <p className="text-lg text-slate-600 leading-relaxed mb-10">
          Read-only access to the same US credit card data that powers opencardai.com: fees, welcome offers, earning rates and benefits.
          No API key. Every response includes a link to the card page and an attribution line.
        </p>

        <div className="space-y-10">
          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">MCP server</h2>
            <p className="text-slate-600 leading-relaxed">
              Connect an AI assistant or agent to <code className="rounded bg-slate-100 px-1">https://opencardai.com/api/mcp</code> (Streamable HTTP).
              Tools: <code>search_cards</code>, <code>get_card</code>, <code>current_welcome_offers</code>. All tools are read-only.
            </p>
            <Code>{MCP_CONFIG}</Code>
            <Code>{CURL_LIST}</Code>
            <Code>{CURL_CALL}</Code>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">JSON endpoints</h2>
            <ul className="space-y-3">
              {ENDPOINTS.map(([path, body]) => (
                <li key={path} className="rounded-xl border border-slate-200 p-4">
                  <code className="block break-all text-sm font-semibold text-slate-800">{path}</code>
                  <p className="mt-1 text-slate-600">{body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-slate-600">
              Full schema: <a href="/openapi.json" className="font-semibold text-blue-600 hover:text-blue-700">/openapi.json</a>. Results are capped at {MAX_LIMIT} items per request.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Example: current welcome offers</h2>
            <AffiliateDisclosure lang={locale} className="block mb-3" />
            <ul className="space-y-2">
              {sample.map((o) => (
                <li key={o.card_id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-slate-200 p-4">
                  <Link href={`/${lang}/cards/${o.card_id}`} className="font-semibold text-blue-600 hover:text-blue-700">{o.name}</Link>
                  <span className="text-slate-600">{o.offer}{o.estimated_value_usd ? ` · est. $${o.estimated_value_usd.toLocaleString("en-US")}` : ""}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-slate-500">{DISCLOSURE}</p>
          </section>

          <section>
            <h2 className="text-xl font-bold text-slate-800 mb-2">License and terms of use</h2>
            <p className="text-slate-600 leading-relaxed mb-3">
              The card data is licensed under{" "}
              <a href={LICENSE.url} className="font-semibold text-blue-600 hover:text-blue-700" rel="license noopener" target="_blank">Creative Commons Attribution 4.0 (CC BY 4.0)</a>.
              Commercial use is allowed. You must credit OpenCard and link back to{" "}
              <a href="https://opencardai.com" className="font-semibold text-blue-600 hover:text-blue-700">https://opencardai.com</a>, for example:
              {" "}<code className="rounded bg-slate-100 px-1">Data: OpenCard (opencardai.com), CC BY 4.0</code>.
            </p>
            <p className="text-slate-600 leading-relaxed">
              Where possible, link to the OpenCard card page (the <code>url</code> field) when you display a card. Offers change often, so tell users to confirm terms with the issuer.
              Please cache responses and keep request rates modest. To report an error, email data@opencardai.com with an official source.
              See our <Link href={`/${lang}/methodology`} className="font-semibold text-blue-600 hover:text-blue-700">methodology</Link> and <Link href={`/${lang}/terms`} className="font-semibold text-blue-600 hover:text-blue-700">terms</Link>.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
