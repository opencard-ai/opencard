import { handleRpc, MAX_BODY_BYTES } from "@/lib/mcp-server";

export const dynamic = "force-dynamic";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}

export async function POST(request: Request) {
  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request too large" } }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }
  if (Array.isArray(body)) return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Batch requests are not supported" } }, 400);
  const res = handleRpc(body);
  if (res === null) return new Response(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  return json(res);
}

// Stateless server: no server-initiated SSE stream, no sessions to delete.
export async function GET() {
  return new Response("Method Not Allowed. POST JSON-RPC to this endpoint (MCP Streamable HTTP).", { status: 405, headers: { Allow: "POST" } });
}
export const DELETE = GET;
