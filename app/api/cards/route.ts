import { getAllCards } from "@/lib/cards";
import { NextResponse } from "next/server";

export const dynamic = "force-static";

export async function GET() {
  const cards = getAllCards();

  // Group by issuer
  const grouped: Record<string, { card_id: string; name: string; annual_fee: number }[]> = {};
  for (const card of cards) {
    if (!grouped[card.issuer]) grouped[card.issuer] = [];
    grouped[card.issuer].push({
      card_id: card.card_id,
      name: card.name,
      annual_fee: card.annual_fee,
    });
  }

  // Sort issuers and cards alphabetically
  const issuers = Object.keys(grouped).sort();
  const result: { issuer: string; cards: { card_id: string; name: string; annual_fee: number }[] }[] = [];
  for (const issuer of issuers) {
    result.push({
      issuer,
      cards: grouped[issuer].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return NextResponse.json(result);
}
