import { boundedJson, currentWelcomeOffers, InputError, PUBLIC_HEADERS, preflight } from "@/lib/developer-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  try {
    const result = currentWelcomeOffers({
      issuer: sp.get("issuer") ?? undefined,
      min_estimated_value: sp.get("min_estimated_value") ?? undefined,
      elevated_only: sp.get("elevated_only") ?? undefined,
      limit: sp.get("limit") ?? undefined,
    });
    return new Response(boundedJson(result), { headers: PUBLIC_HEADERS });
  } catch (e) {
    if (e instanceof InputError) return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: PUBLIC_HEADERS });
    throw e;
  }
}

export function OPTIONS() {
  return preflight("GET, OPTIONS");
}
