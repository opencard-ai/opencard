import { NextRequest, NextResponse } from "next/server";
import { getCardById } from "@/lib/cards";
import { getCardstayPlaces, makePlaceVerdicts } from "@/lib/cardstay/data";
import type { ProgramKey } from "@/lib/cardstay/types";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PROGRAM_SET = new Set<ProgramKey>(["amex_fhr", "amex_thc", "chase_the_edit", "capital_one_premier_collection", "hilton_resort_credit", "hilton_free_night"]);

function parsePrograms(input: unknown): ProgramKey[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const programs = input.filter((value): value is ProgramKey => typeof value === "string" && PROGRAM_SET.has(value as ProgramKey));
  return programs.length ? programs : undefined;
}

function cardsFromRequest(body: Record<string, unknown>): string[] {
  if (Array.isArray(body.card_ids)) return body.card_ids.map(String);
  if (Array.isArray(body.cards)) return body.cards.map(String);
  return [];
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const email = typeof body.email === "string" && EMAIL_RE.test(body.email) ? body.email : null;
    const query = typeof body.query === "string" ? body.query : "";
    const programs = parsePrograms(body?.filters && typeof body.filters === "object" ? (body.filters as Record<string, unknown>).programs : body.programs);

    const cardIds = cardsFromRequest(body).filter(Boolean);
    const cards = cardIds.length > 0
      ? cardIds.map((id) => getCardById(id)).filter((card): card is NonNullable<typeof card> => card !== null)
      : [];

    const places = getCardstayPlaces();
    const verdicts = makePlaceVerdicts(cards, query, programs);

    return NextResponse.json({
      query,
      email,
      total_places: places.length,
      returned: verdicts.length,
      places: verdicts,
      source_places: places.map((place) => ({ place_id: place.place_id, slug: place.slug, name: place.name, city: place.city, programs: place.programs })),
    });
  } catch (err) {
    console.error("stay/search error:", err);
    return NextResponse.json({ error: "Failed to search stay places" }, { status: 500 });
  }
}
