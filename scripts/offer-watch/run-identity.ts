/** Stable business slot; attempt identity must NOT be used as the publication key. */
export function offerRunIdentity(ptDate: string, slot: 'morning' | 'evening' | 'daily', attemptId: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ptDate) || new Date(`${ptDate}T12:00:00Z`).toISOString().slice(0, 10) !== ptDate || !['morning', 'evening', 'daily'].includes(slot) || !/^[A-Za-z0-9_-]{1,100}$/.test(attemptId)) throw new Error('explicit PT date/slot/attempt identity required');
  return { runId: `offer-${ptDate}-${slot}`, attemptId, timeZone: 'America/Los_Angeles' as const };
}
