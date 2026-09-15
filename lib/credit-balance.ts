type Credit = { credit_key?: string; amount?: number; frequency: string; is_free_night?: boolean };

/** Current-period tracked credit balances in cents, not monthly/annualized value. */
export function creditBalance(
  instanceId: string,
  credits: Credit[],
  uses: ReadonlyMap<string, { used_amount: number }>,
  periodKey: (frequency: string) => string | null,
) {
  let totalCents = 0;
  let remainingCents = 0;
  const cents = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100)) : 0;
  for (const credit of credits) {
    if (credit.is_free_night || !credit.credit_key) continue;
    const period = periodKey(credit.frequency);
    if (!period) continue;
    const amount = cents(credit.amount || 0);
    const used = cents(uses.get(`${instanceId}:${credit.credit_key}:${period}`)?.used_amount || 0);
    totalCents += amount;
    remainingCents += Math.max(0, amount - used);
  }
  return { totalCents, remainingCents };
}
