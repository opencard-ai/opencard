export function assertSandboxPrefix(prefix: string) {
  if (!/^opencard:offer-state:\{sandbox-[a-z0-9-]{8,64}\}:$/.test(prefix)) throw new Error('explicit isolated sandbox Redis prefix required; production namespace prohibited');
}
