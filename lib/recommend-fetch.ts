/**
 * Single round-trip to /api/recommend with one automatic retry on
 * cold-start failures (JSON parse error or 5xx with non-JSON body).
 *
 * Why: Vercel Fluid Compute spins down idle functions, and the first
 * MiniMax call after a cold start can take long enough that mobile
 * Safari aborts the fetch or Vercel returns an HTML 504. Both surface
 * to .then(res => res.json()) as a parse error, which the widgets
 * previously rendered as a generic "Something went wrong" message —
 * making the user manually re-send (which then succeeds because the
 * function is warm). This helper does that retry for them.
 */

export interface RecommendBody {
  message: string;
  messages: { role: "user" | "assistant"; content: string }[];
  locale: string;
  existingCards: string[];
}

const RETRY_DELAY_MS = 1500;

async function once(body: RecommendBody): Promise<{ reply: string }> {
  const res = await fetch("/api/recommend", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // Throws on non-JSON body (Vercel's HTML 504 page) so the caller can retry.
  return await res.json();
}

export async function fetchRecommend(body: RecommendBody): Promise<{ reply: string }> {
  try {
    return await once(body);
  } catch {
    // Cold-start retry. If this also fails, let the caller's catch handle it.
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    return await once(body);
  }
}
