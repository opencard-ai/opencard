/** Official read-only API adapter, explicit credentials, never reads process.env. */
export function createVercelDeploymentReader({ token, projectId = 'opencard', slug = 'opencard-ais-projects', fetchImpl = globalThis.fetch, timeoutMs = 20000 }) {
  if (typeof token !== 'string' || !token) throw new Error('Vercel read credential required; promotion blocked');
  return async mergeSha => {
    if (!/^[0-9a-f]{40}$/.test(mergeSha)) throw new Error('invalid merge SHA');
    const url = new URL('https://api.vercel.com/v7/deployments');
    for (const [key, value] of Object.entries({ projectId, target: 'production', sha: mergeSha, slug, limit: '100' })) url.searchParams.set(key, value);
    const controller = new AbortController();
    let timer;
    try {
      const data = await Promise.race([(async () => {
        const response = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        if (!response.ok) throw new Error();
        return response.json();
      })(), new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error()); }, timeoutMs); })]);
      if (!Array.isArray(data.deployments)) throw new Error();
      return data.deployments;
    } catch { throw new Error('Vercel production evidence unavailable'); }
    finally { clearTimeout(timer); }
  };
}
