import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { loadGscAuth } from './gsc-auth';
import * as cohorts from './gsc-cohorts';

for (const cloud of [false, true]) for (const alert of [false, true]) test(`daily entry point builds cohorts, sitemap metrics and report without live credentials (cloud=${cloud}, alert=${alert})`, async () => {
  const retained = 'https://opencardai.com/en/cards/chase-sapphire-reserve';
  const excluded = 'https://opencardai.com/es/cards/amex-blue-cash-everyday';
  const files = new Map<string, string>();
  if (cloud) {
    files.set('/state/history.json', JSON.stringify(Array.from({ length: 30 }, () => ({ date: 'synthetic' }))));
    files.set('/state/cohort-baseline.json', JSON.stringify({ capturedAt: '2026-11-01T00:00:00Z', indexableUrls: [retained] }));
  }
  const output: string[] = [];
  const errors: string[] = [];
  const fakeProcess = { cwd: () => '/fixture', env: cloud ? { GSC_STATE_DIR: '/state', GSC_SERVICE_ACCOUNT_JSON: JSON.stringify({ client_id: 'synthetic', refresh_token: 'synthetic', site_url: 'https://example.test' }) } : {}, argv: cloud ? ['node', 'script', '--out-dir', '/out', '--weekly'] : [], exitCode: 0 };
  const row = (keys: string[]) => ({ keys, clicks: 0, impressions: 100, ctr: 0, position: 8 });
  const modules: Record<string, unknown> = {
    googleapis: { google: {
      auth: { OAuth2: class { setCredentials() {} } },
      searchconsole: () => ({
        searchanalytics: { query: async ({ requestBody }: any) => ({ data: { rows:
          alert && !requestBody.dimensions && requestBody.startDate === '2026-11-08' ? [{ ...row([]), clicks: 100, impressions: 1000 }] : requestBody.dimensions?.length === 2
            ? [row(['retained query', retained]), row(['excluded query', excluded])]
            : requestBody.dimensions ? [row([retained]), row([excluded])] : [row([])],
        } }) },
        sitemaps: { list: async () => ({ data: { sitemap: [{
          contents: [{ type: 'web', submitted: 14, indexed: 10 }],
          errors: 0, warnings: alert ? 1 : 0,
        }] } }) },
      }),
    } },
    fs: {
      mkdirSync: () => {},
      readFileSync: (name: string) => name.endsWith('.gsc-token.json') ? '{}' : files.get(name),
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
    './gsc-auth': { loadGscAuth: (google: any) => cloud ? loadGscAuth(google, fakeProcess.env) : { auth: {}, siteUrl: 'https://opencardai.com' } },
  };
  const source = fs.readFileSync(path.join(process.cwd(), 'scripts/gsc-daily.ts'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  await vm.runInNewContext(compiled, {
    exports: {}, process: fakeProcess,
    Date: class extends Date { constructor(value?: string | number) { super(value ?? '2026-11-23T02:00:00Z'); } },
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency: ${name}`);
      return modules[name];
    },
    console: { log: (line: string) => output.push(line), error: (...args: unknown[]) => errors.push(args.join(' ')) },
  });
  assert.deepEqual(errors, []);
  assert.equal(fakeProcess.exitCode, alert ? 1 : 0);
  const history = JSON.parse(files.get(cloud ? '/state/history.json' : '/fixture/.gsc-report-history.json')!);
  const report = history.at(-1);
  assert.equal(history.length, cloud ? 30 : 1);
  assert.equal(report.sitemap.submitted, 14);
  assert.equal(report.cohorts.retained.current.impressions, 100);
  assert.equal(report.cohorts.excluded.current.impressions, 100);
  assert.deepEqual(report.opportunities.map((item: any) => item.url), [retained]);
  assert.ok(files.has(cloud ? '/state/cohort-baseline.json' : '/fixture/.gsc-cohort-baseline.json'));
  assert.match(output.join(''), /GSC Daily Report/);
  assert.equal(report.date, '2026-11-22');
  assert.equal(report.period.startDate, '2026-11-15');
  assert.equal(report.period.endDate, '2026-11-21');
  assert.equal(report.previousPeriod.startDate, '2026-11-08');
  assert.equal(report.previousPeriod.endDate, '2026-11-14');
  if (cloud) {
    assert.equal(files.get('/out/2026-11-22-daily.md'), output[0] + '\n');
    const daily = JSON.parse(files.get('/out/2026-11-22-daily.json')!);
    const weekly = JSON.parse(files.get('/out/2026-11-22-weekly.json')!);
    assert.deepEqual(weekly.period, daily.period);
    assert.deepEqual(weekly.previousPeriod, daily.previousPeriod);
    assert.equal(weekly.alerts.length, alert ? 3 : 0);
    assert.equal(report.cohortBaseline, '2026-11-01T00:00:00Z');
    assert.equal(JSON.parse(files.get('/state/cohort-baseline.json')!).capturedAt, '2026-11-01T00:00:00Z');
    assert.match(files.get('/out/2026-11-22-weekly.md')!, /GSC Weekly Summary/);
  }
});
