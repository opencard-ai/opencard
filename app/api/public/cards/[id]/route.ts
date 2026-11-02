import { boundedJson, getCard, InputError, PUBLIC_HEADERS, preflight } from "@/lib/developer-api";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const result = getCard({ card_id: id });
    if (!result) return new Response(JSON.stringify({ error: "Card not found" }), { status: 404, headers: PUBLIC_HEADERS });
    return new Response(boundedJson(result), { headers: PUBLIC_HEADERS });
  } catch (e) {
    if (e instanceof InputError) return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: PUBLIC_HEADERS });
    throw e;
  }
}

export function OPTIONS() {
  return preflight("GET, OPTIONS");
}
