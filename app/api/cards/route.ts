import { getAllCards } from "@/lib/cards";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // Default to full data (true), use ?summary=1 for grouped issuer summary
  const summary = searchParams.get("summary") === "1";
  const issuer = searchParams.get("issuer");
  const cardId = searchParams.get("card_id");
  const cards = getAllCards();

  // Filter by card_id if provided - always returns full data
  if (cardId) {
    const card = cards.find(c => c.card_id === cardId);
    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }
    return NextResponse.json(card);
  }

  // Filter by issuer if provided
  const filtered = issuer
    ? cards.filter(c => c.issuer.toLowerCase() === issuer.toLowerCase())
    : cards;

  if (summary) {
    // Full mode: return complete card data for all filtered cards
    const result = filtered.map(card => ({
      card_id: card.card_id,
      name: card.name,
      issuer: card.issuer,
      network: card.network,
      annual_fee: card.annual_fee,
      foreign_transaction_fee: card.foreign_transaction_fee,
      credit_required: card.credit_required,
      welcome_offer: card.welcome_offer || null,
      earning_rates: card.earning_rates,
      recurring_credits: card.recurring_credits || [],
      travel_benefits: card.travel_benefits,
      insurance: card.insurance,
      hotel_program: card.hotel_program || null,
      tags: card.tags,
      last_updated: card.last_updated,
      status: card.status || "active",
    }));
    return NextResponse.json(result);
  }

  // Summary mode (default): group by issuer
  const grouped: Record<string, { card_id: string; name: string; annual_fee: number; issuer: string }[]> = {};
  for (const card of filtered) {
    if (!grouped[card.issuer]) grouped[card.issuer] = [];
    grouped[card.issuer].push({
      card_id: card.card_id,
      name: card.name,
      annual_fee: card.annual_fee,
      issuer: card.issuer,
    });
  }

  const issuers = Object.keys(grouped).sort();
  const result: { issuer: string; cards: { card_id: string; name: string; annual_fee: number; issuer: string }[] }[] = [];
  for (const iss of issuers) {
    result.push({
      issuer: iss,
      cards: grouped[iss].sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  return NextResponse.json(result);
}
