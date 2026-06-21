import { NextRequest, NextResponse } from "next/server";
import { getCardById } from "@/lib/cards";
import { getPlaceVerdict, getCardstayPlace } from "@/lib/cardstay/data";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cardsFromSearchParams(searchParams: URLSearchParams) {
  const ids = searchParams.get("card_ids") || searchParams.get("cards") || "";
  return ids
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => getCardById(id))
    .filter((card): card is NonNullable<typeof card> => card !== null);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ placeId: string }> }) {
  try {
    const { placeId } = await params;
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const cards = cardsFromSearchParams(searchParams);
    const place = getCardstayPlace(placeId);

    if (!place) {
      return NextResponse.json({ error: "Place not found" }, { status: 404 });
    }

    const walletCards = cards.length > 0 ? cards : [];
    const verdict = getPlaceVerdict(place.place_id, walletCards);

    return NextResponse.json({
      place,
      verdict,
      cards: walletCards.map((card) => ({ card_id: card.card_id, name: card.name, issuer: card.issuer })),
    });
  } catch (err) {
    console.error("stay/place error:", err);
    return NextResponse.json({ error: "Failed to fetch place" }, { status: 500 });
  }
}
