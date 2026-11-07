/** Staged offer transport contract, NOT connected to the legacy publisher.
 * Deliberately no git-push fallback. Full production integration is a separate phase.
 */
export async function callOfferPrHelper({ helper, mode, sha, invoke }) {
  if (typeof helper !== 'string' || !helper.trim()) throw new Error('PR helper required; direct main push forbidden');
  if (!['merge', 'rollback'].includes(mode) || !/^[0-9a-f]{40}$/.test(sha)) throw new Error('invalid helper request');
  const result = await invoke(helper, [mode, sha]);
  if (result.code !== 0) throw new Error('PR helper failed; no direct-push fallback');
  const matches = [...result.stdout.matchAll(/^MERGED_SHA=([0-9a-f]{40})$/gm)];
  if (matches.length !== 1) throw new Error('helper merge receipt missing or ambiguous');
  return { mergeSha: matches[0][1] };
}
