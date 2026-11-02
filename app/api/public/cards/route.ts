import { boundedJson, InputError, PUBLIC_HEADERS, searchCards } from "@/lib/developer-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  try {
    const result = searchCards({
      query: sp.get("q") ?? undefined,
      issuer: sp.get("issuer") ?? undefined,
      network: sp.get("network") ?? undefined,
      max_annual_fee: sp.get("max_annual_fee") ?? undefined,
      no_foreign_transaction_fee: sp.get("no_foreign_transaction_fee") ?? undefined,
      tag: sp.get("tag") ?? undefined,
      include_discontinued: sp.get("include_discontinued") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return new Response(boundedJson(result), { headers: PUBLIC_HEADERS });
  } catch (e) {
    if (e instanceof InputError) return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: PUBLIC_HEADERS });
    throw e;
  }
}
