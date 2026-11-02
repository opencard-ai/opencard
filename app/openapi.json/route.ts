import { openApiSpec } from "@/lib/openapi-spec";
import { PUBLIC_HEADERS } from "@/lib/developer-api";

export const dynamic = "force-static";

export function GET() {
  return new Response(JSON.stringify(openApiSpec, null, 2), { headers: PUBLIC_HEADERS });
}
