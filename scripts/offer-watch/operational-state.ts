/** Actual optional durable publication bridge; never selected by the existing CLI automatically. */
import { emptyLedger } from './gate';
import { upsertLedger } from './state';
import { publish, type AppliedCard, type PublishConfig, type PublishDeps, type PublishResult } from './publish-core';
import { createOfferPrTransport } from './pr-transport';
import { validateBundle, type OperationalState } from './state-snapshot';
import type { createRedisOfferState } from './redis-state';
type DurableState = ReturnType<typeof createRedisOfferState>;
const validate = (value: OperationalState): OperationalState => {
  const checked = validateBundle({ ...value, fixtureOnly: true, fixtureId: 'schema-validation-only', journals: [], claims: {} });
  return { schema: 1, ledger: checked.ledger, history: checked.history, daily: checked.daily };
};
const eventKey = (event: PublishResult['events'][number]) => JSON.stringify([event.type, event.card_id, event.commit ?? null, event.revert_commits ?? []]);
export async function persistPublication(state: DurableState, result: PublishResult, now: string) {
  // No automatic retry of the external publication on a CAS conflict/uncertain response.
  if (!result.ledger.length && !result.events.length) return;
  await state.lease.assert();
  const doc = await state.read<OperationalState>('operational');
  const current = doc ? validate(doc.value) : { schema: 1 as const, ledger: emptyLedger(), history: [], daily: {} };
  const seen = new Set(current.history.map(eventKey));
  const history = [...current.history];
  for (const event of result.events) if (!seen.has(eventKey(event))) { history.push(event); seen.add(eventKey(event)); }
  const next = validate({ ...current, ledger: upsertLedger(current.ledger, result.ledger, now), history });
  await state.cas('operational', doc?.version ?? 0, next);
}
export async function publishWithDurableState(applied: AppliedCard[], config: PublishConfig, deps: Omit<PublishDeps, 'transport'>, options: {
  state: DurableState; publish?: boolean; productionEnable?: boolean; ownerEpoch?: string; runId?: string;
  fetchDeployments: Parameters<typeof createOfferPrTransport>[0]['fetchDeployments'];
}): Promise<PublishResult> {
  if (options.publish !== true || options.productionEnable !== true || !options.ownerEpoch || !options.runId) throw new Error('durable publication disabled before lease/state access');
  const { state } = options;
  await state.lease.acquire();
  try {
    const transport = createOfferPrTransport({ ...options, publish: true, productionEnable: true, run: deps.run, store: state.journal(), lease: { assert: () => state.lease.renew() } });
    await transport.authorize();
    const result = await publish(applied, config, { ...deps, transport });
    try { await persistPublication(state, result, deps.now().toISOString()); }
    catch { return { ...result, status: 'uncertain', detail: 'remote outcome may exist; durable operational CAS failed; reconcile same slot, never republish blindly' }; }
    return result;
  } finally {
    // No watcher. If the session is lost, release does not issue another write.
    try { await state.lease.release(); } catch { /* bounded server TTL remains; do not steal/reacquire */ }
  }
}
