import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as cohorts from './gsc-cohorts';

async function runDaily(env: Record<string, string>) {
  const retained = 'https://opencardai.com/en/cards/chase-sapphire-reserve';
  const excluded = 'https://opencardai.com/es/cards/amex-blue-cash-everyday';
  const files = new Map<string, string>();
  const output: string[] = [];
  const errors: string[] = [];
  const fakeProcess = { cwd: () => '/fixture', env, exitCode: 0 };
  const reads: string[] = [];
  const row = (keys: string[]) => ({ keys, clicks: 0, impressions: 100, ctr: 0, position: 8 });
  const modules: Record<string, unknown> = {
    googleapis: { google: {
      auth: { OAuth2: class { setCredentials() {} } },
      searchconsole: () => ({
        searchanalytics: { query: async ({ requestBody }: any) => ({ data: { rows:
          requestBody.dimensions?.length === 2
            ? [row(['retained query', retained]), row(['excluded query', excluded])]
            : requestBody.dimensions ? [row([retained]), row([excluded])] : [row([])],
        } }) },
        sitemaps: { list: async () => ({ data: { sitemap: [{
          contents: [{ type: 'web', submitted: 14, indexed: 10 }],
          errors: 0, warnings: 0,
        }] } }) },
      }),
    } },
    fs: {
      readFileSync: (name: string) => (reads.push(name), name.endsWith('.gsc-token.json') ? '{}' : files.get(name)),
      existsSync: (name: string) => files.has(name),
      writeFileSync: (name: string, value: string) => files.set(name, value),
    },
    path,
    '../app/sitemap': () => [{ url: retained }],
    '../lib/cards': { getAllCards: () => [
      { card_id: 'chase-sapphire-reserve' }, { card_id: 'amex-blue-cash-everyday' },
    ] },
    '../lib/guides': { GUIDES: [] },
    './gsc-cohorts': cohorts,
  };
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts/gsc-daily.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  await vm.runInNewContext(compiled, {
    exports: {}, process: fakeProcess,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: { log: (line: string) => output.push(line), error: (...args: unknown[]) => errors.push(args.join(' ')) },
  });
  return { files, output, errors, fakeProcess, reads, retained };
}

test('daily entry point builds cohorts, sitemap metrics and report without live credentials', async () => {
  const { files, output, errors, fakeProcess, reads, retained } = await runDaily({});
  assert.ok(reads.includes('/fixture/.gsc-token.json'));
  assert.deepEqual(errors, []);
  assert.equal(fakeProcess.exitCode, 0);
  const [report] = JSON.parse(files.get('/fixture/.gsc-report-history.json')!);
  assert.equal(report.sitemap.submitted, 14);
  assert.equal(report.cohorts.retained.current.impressions, 100);
  assert.equal(report.cohorts.excluded.current.impressions, 100);
  assert.deepEqual(report.opportunities.map((item: any) => item.url), [retained]);
  assert.ok(files.has('/fixture/.gsc-cohort-baseline.json'));
  assert.match(output.join(''), /GSC Daily Report/);
});

test('portable state dir and token path overrides relocate state without touching cwd', async () => {
  const { files, errors, fakeProcess, reads } = await runDaily({ OPENCARD_GSC_STATE_DIR: '/state', OPENCARD_GSC_TOKEN_PATH: '/secrets/.gsc-token.json' });
  assert.deepEqual(errors, []);
  assert.equal(fakeProcess.exitCode, 0);
  assert.ok(reads.includes('/secrets/.gsc-token.json'));
  assert.ok(files.has('/state/.gsc-report-history.json'));
  assert.ok(files.has('/state/.gsc-cohort-baseline.json'));
  assert.ok(![...files.keys()].some(k => k.startsWith('/fixture/')));
});
