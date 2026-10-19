import type { CreditCard } from "@/lib/cards";

/**
 * foreign_transaction_fee defaults to 0 in many records, so 0 alone is not
 * evidence. Only claim "no FX fee" when the record is tagged for it.
 *
 * Kept in its own dependency-free module so client components (compare table)
 * and server code (card pages, recommender) share one guard.
 */
export function knownNoForeignFee(card: Pick<CreditCard, "foreign_transaction_fee" | "tags">): boolean {
  return card.foreign_transaction_fee === 0 && (card.tags || []).includes("no-foreign-transaction-fee");
}
