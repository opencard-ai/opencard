/** No synchronous child waits: async build callbacks must yield. Always stop in finally. */
export function leaseHeartbeat(lease: { renew(): Promise<void> }, intervalMs: number) {
  if (!Number.isFinite(intervalMs) || intervalMs < 1 || intervalMs > 100000) throw new Error('bounded explicit heartbeat interval required');
  let timer: ReturnType<typeof setTimeout> | undefined, stopped = false, failed = false;
  let pending: Promise<void> | undefined;
  const controller = new AbortController();
  const renew = async () => {
    if (failed || stopped) throw new Error('lease heartbeat unavailable');
    if (!pending) pending = lease.renew().catch(() => { failed = true; controller.abort(); throw new Error('lease renewal failed; subsequent writes prohibited'); }).finally(() => { pending = undefined; });
    await pending;
    if (failed || stopped) throw new Error('lease heartbeat unavailable');
  };
  const schedule = () => { if (!stopped && !failed) timer = setTimeout(() => { void renew().then(schedule).catch(() => {}); }, intervalMs); };
  schedule();
  return {
    signal: controller.signal,
    assert: renew,
    stop: async () => { stopped = true; if (timer) clearTimeout(timer); try { await pending; } catch { /* already poisoned */ } },
  };
}
