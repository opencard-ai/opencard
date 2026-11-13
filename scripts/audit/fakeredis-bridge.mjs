import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

const python = String.raw`
import sys, json, fakeredis
r = fakeredis.FakeRedis(decode_responses=True)
for line in sys.stdin:
    try:
        q = json.loads(line)
        op = q.get('op', 'eval')
        if op == 'eval': value = r.eval(q['script'], len(q['keys']), *q['keys'], *q['args'])
        elif op == 'raw_get': value = r.get(q['key'])
        elif op == 'raw_set': value = r.set(q['key'], q['value'])
        elif op == 'keys': value = sorted(r.keys(q.get('pattern', '*')))
        else: raise ValueError('unknown operation')
        print(json.dumps({'id': q['id'], 'ok': value}), flush=True)
    except Exception as e:
        print(json.dumps({'id': q.get('id'), 'err': str(e)}), flush=True)
`;
export function createFakeredisBridge() {
  if (!process.env.FAKEREDIS_PYTHON) throw new Error('FAKEREDIS_PYTHON required');
  const child = spawn(process.env.FAKEREDIS_PYTHON, ['-u', '-c', python], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let sequence = 0, dead;
  const fail = (error) => {
    dead = error;
    for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(error); }
    pending.clear();
  };
  child.on('error', fail);
  child.on('exit', (code, signal) => fail(new Error(`fakeredis child exited: ${code ?? signal}`)));
  child.stdin.on('error', fail);
  child.stderr.resume();
  createInterface({ input: child.stdout }).on('line', line => {
    try {
      const reply = JSON.parse(line), call = pending.get(reply.id);
      if (!call) return;
      clearTimeout(call.timer); pending.delete(reply.id);
      if ('err' in reply) call.reject(new Error(reply.err)); else call.resolve(reply.ok);
    } catch (e) { fail(e); child.kill('SIGKILL'); }
  });
  function request(message) {
    if (dead) return Promise.reject(dead);
    return new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { fail(new Error('fakeredis call timeout (5s)')); child.kill('SIGKILL'); }, 5000);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(JSON.stringify({ ...message, id }) + '\n', error => { if (error) fail(error); });
    });
  }
  return { child, request, eval: (script, keys, args) => request({ script, keys, args }), close: () => { fail(new Error('fakeredis bridge closed')); child.kill('SIGKILL'); } };
}
