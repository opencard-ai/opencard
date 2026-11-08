// Test-only loopback server speaking the Upstash REST protocol, backed by the fakeredis Lua bridge.
import http from 'node:http';
export function startFakeUpstash(bridge, { token = 'test-token-123', onRequest } = {}) {
  const calls = [];
  const enc = (v, b64) => v === null ? null : typeof v === 'string' ? (b64 ? Buffer.from(v).toString('base64') : v) : Array.isArray(v) ? v.map(x => enc(x, b64)) : v;
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const c of req) body += c;
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: 'unauthorized' });
    let cmd; try { cmd = JSON.parse(body); } catch { return send(400, { error: 'bad json' }); }
    calls.push({ method: req.method, path: req.url, cmd: cmd[0], cas: String(cmd[1]).includes('CONFLICT') });
    if (onRequest && (await onRequest(cmd, res)) === 'handled') return;
    if (String(cmd[0]).toUpperCase() !== 'EVAL') return send(400, { error: 'only EVAL allowed in fixture' });
    const n = Number(cmd[2]);
    try { const v = await bridge.request({ script: cmd[1], keys: cmd.slice(3, 3 + n), args: cmd.slice(3 + n) }); send(200, { result: enc(v, req.headers['upstash-encoding'] === 'base64') }); }
    catch (e) { send(400, { error: String(e.message) }); }
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ url: `http://127.0.0.1:${server.address().port}`, token, calls, close: () => new Promise(c => { server.closeAllConnections?.(); server.close(c); }) })));
}
