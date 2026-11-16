/** Display names only: removed product details must not be republished. */
export const removedCards: readonly {
  id: string;
  name: string;
  removedOn: string;
  alternatives: readonly string[];
}[] = [
  {
    id: "robinhood-gold",
    name: "Robinhood Gold Card",
    removedOn: "2026-11-05",
    alternatives: [
      "citi-double-cash",
      "wells-fargo-active-cash",
      "fidelity-rewards-visa-signature",
      "chase-freedom-unlimited",
    ],
  },
];

export function getRemovedCard(id: string) {
  return removedCards.find((card) => card.id === id);
}
