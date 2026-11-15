import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { sanitize } from './ops-notify-core.mjs';
const runScripts = block => [...block.matchAll(/^        run: \|\n((?:^          .*\n|^\n)*)/gm)].map(m => m[1].replace(/^          /gm, ''));
const read = p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const owners = JSON.parse(read('ops/runner-owner.json'));
const pins = {
  checkout: '11d5960a326750d5838078e36cf38b85af677262',
  'setup-node': '49933ea5288caeca8642d1e84afbd3f7d6820020',
  'upload-artifact': 'ea165f8d65b6e75b540449e92b4886f43607fa02',
  'download-artifact': 'd3f86a106a0bac45b974a628896c90dbdf5c8093',
};
for (const [job, slug, cron] of [['offer', 'offer-watch', '9 21 * * *'], ['audit', 'weekly-audit', '47 18 * * 1']]) test(`${job} cloud ownership, workflow permissions and transport invariants`, () => {
  const w = read(`.github/workflows/${slug}-cloud.yml`);
  assert.deepEqual([...w.matchAll(/- cron: '([^']+)'/g)].map(m => m[1]), [cron]);
  assert.doesNotMatch(w, /^\s*timezone:/m); assert.match(w, /2027-03-14/); assert.match(w, /2027-11-07/);
  assert.match(w, /^permissions:\n  contents: read$/m);
  const jobs = Object.fromEntries([...w.slice(w.indexOf('\njobs:\n')).matchAll(/^  ([a-z-]+):\n([\s\S]*?)(?=^  [a-z-]+:\n|$(?![\s\S]))/gm)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(jobs), ['run', 'commit-state', 'notify', 'failure-summary', 'failure-notify', 'verdict']);
  const forkGuard = "github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository";
  assert.equal(w.split(forkGuard).length - 1, 4);
  assert.ok(!w.replaceAll(forkGuard, '').includes("github.event_name != 'pull_request'"));

  for (const [name, block] of Object.entries(jobs)) {
    const condition = block.match(/^    if: (.*)$/m)?.[1];
    if (name.startsWith('failure-')) {
      assert.ok(condition?.includes("github.ref == 'refs/heads/main'"), name);
      assert.ok(condition?.includes("!startsWith(github.event_name, 'pull_request')"), name);
    } else assert.ok(condition?.includes("github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository"), name);
    assert.equal(/contents: write/.test(block), name === 'commit-state');
  }
  assert.equal([...w.matchAll(/contents: write/g)].length, 1);
  const ci = jobs['commit-state'].match(/^    if: (.*)$/m)[1];
  for (const gate of ["needs.run.outputs.mode == 'write'", "needs.run.outputs.daily_ok == 'true'", "needs.run.outputs.state_ready == 'true'", "github.ref == 'refs/heads/main'", "!startsWith(github.event_name, 'pull_request')"]) assert.ok(ci.includes(gate));
  assert.match(jobs['commit-state'], /ref: main/); assert.match(jobs['commit-state'], /ref: ops-state/);
  assert.match(jobs['commit-state'], /concurrency:\n      group: ops-state-write\n      cancel-in-progress: false/);
  assert.ok(w.includes(`group: ${slug}-cloud-` + '$' + '{{ github.ref }}'));
  assert.ok(jobs.run.includes('attempt: $' + '{{ github.run_attempt }}'));
  assert.match(jobs.run, /id: stage\n[^]*?if: always\(\) && steps.load.outcome == 'success' && steps.daily.outcome == 'success'/);
  assert.match(jobs.run, /daily_ok:.*steps.daily.outcome == 'success'/);
  for (const block of [jobs['commit-state'], jobs.notify, jobs.verdict]) {
    assert.doesNotMatch(block, /(?:name|summary_artifact):[^\n]*github.run_attempt/);
  }
  assert.ok(jobs['commit-state'].includes(`name: ${slug}-state-` + '$' + '{{ github.run_id }}-' + '$' + '{{ needs.run.outputs.attempt }}'));
  assert.ok(jobs.notify.includes(`summary_artifact: ${slug}-summary-` + '$' + '{{ github.run_id }}-' + '$' + '{{ needs.run.outputs.attempt }}'));
  const commit = jobs['commit-state'];
  assert.ok(commit.includes('GH_TOKEN: $' + '{{ github.token }}'));
  assert.match(commit, /contents\/ops\/runner-owner.json\?ref=main/);
  assert.ok(commit.includes(`mode=$(node src/scripts/ops-state/owner.mjs --file "$RUNNER_TEMP/commit-owner.json" --job ${job}`));
  assert.ok(commit.includes(`--epoch "$${job.toUpperCase()}_EPOCH" --event "$GITHUB_EVENT_NAME" --ref "$GITHUB_REF")`));
  assert.ok(commit.includes(`[[ "$mode" == write ]] || { echo 'ownership no longer permits write; refusing state commit' >&2; exit 1; }`));
  assert.ok(commit.indexOf('gh api') < commit.indexOf('mode=$(node'));
  assert.ok(commit.indexOf('[[ "$mode" == write ]]') < commit.indexOf('node src/scripts/ops-state/commit.mjs'));

  assert.doesNotMatch(w, /--force|push -f|\+refs/);
  if (job === 'offer') { assert.match(w, /--no-publish/); assert.doesNotMatch(w, /--publish\b/); }
  const secrets = [...new Set([...w.matchAll(/secrets\.([A-Z_]+)/g)].map(m => m[1]))].sort();
  assert.deepEqual(secrets, ['AGENTMAIL_API_KEY', 'AGENTMAIL_FROM_INBOX', 'OWNER_EMAIL']); assert.doesNotMatch(w, /secrets: inherit/);
  for (const block of [jobs.notify, jobs['failure-notify']]) for (const secret of secrets) assert.ok(block.includes(`${secret}: ` + '$' + `{{ !startsWith(github.event_name, 'pull_request') && secrets.${secret} || '' }}`));
  const send = jobs.notify.match(/^      send: (.*)$/m)[1];
  for (const gate of ["mode == 'write'", "needs.commit-state.outputs.committed == 'true'", "github.ref == 'refs/heads/main'", "!startsWith(github.event_name, 'pull_request')"]) assert.ok(send.includes(gate));
  assert.match(jobs.notify, /permissions:\n      contents: read/);
  assert.match(w, new RegExp(`${job.toUpperCase()}_EPOCH: ${owners[job].epoch}`));
  assert.deepEqual(owners[job], { owner: 'github-actions', productionEnabled: true, epoch: `${job}-20261115-1` });
  for (const m of w.matchAll(/uses: actions\/([^@\s]+)@([^\s]+)/g)) assert.equal(m[2], pins[m[1]], m[1]);
  for (const action of Object.keys(pins)) assert.ok(w.includes(`actions/${action}@${pins[action]}`));
  assert.match(jobs.run, /persist-credentials: false/);
  assert.match(jobs.run, /contents\/ops\/runner-owner.json\?ref=main/);
  assert.match(jobs.run, /\[\[ "\$GITHUB_EVENT_NAME" == pull_request\*/);
  assert.match(jobs.run, /git fetch --no-tags --depth=1 origin "\$STATE_SHA"/);
  assert.match(jobs.run, /assert-readonly\.sh/);
  assert.match(jobs.run, /continue-on-error: true/);
  assert.match(jobs.verdict, /needs: \[run, commit-state, notify\]/);
  assert.match(jobs.verdict, /if: always\(\)/);
  assert.ok(jobs.verdict.includes('test "$DAILY_OK" = true'));
});

for (const slug of ['offer-watch', 'weekly-audit']) test(`${slug} fixed failure mail guards, content and producer attempt`, () => {
  const w = read(`.github/workflows/${slug}-cloud.yml`);
  const summary = w.split('  failure-summary:\n')[1].split('  failure-notify:\n')[0];
  const notify = w.split('  failure-notify:\n')[1].split('  verdict:\n')[0];
  assert.match(summary, /needs: \[run, commit-state, notify\]/);
  const condition = summary.match(/^    if: (.*)$/m)[1];
  for (const gate of ["always()", "github.ref == 'refs/heads/main'", "!startsWith(github.event_name, 'pull_request')", "github.run_attempt == '1'"]) assert.ok(condition.includes(gate));
  for (const failure of ["needs.run.result != 'success'", "needs.run.outputs.daily_ok != 'true'", "needs.run.outputs.state_ready != 'true'", "needs.commit-state.result != 'success'", "needs.commit-state.result != 'skipped'", "needs.notify.result != 'success'"]) assert.ok(condition.includes(failure));
  for (const block of [summary, notify]) assert.match(block, /permissions:\n      contents: read/);
  assert.match(summary, /if: needs.run.result == 'success' && needs.run.outputs.daily_ok != 'true'/);
  assert.match(summary, /pt_date: \$\{\{ steps.summary.outputs.pt_date \}\}/);
  assert.match(summary, /attempt: \$\{\{ steps.summary.outputs.attempt \}\}/);
  assert.ok(summary.includes(`name: ${slug}-failure-` + '${{ github.run_id }}-${{ github.run_attempt }}'));
  assert.match(summary, /path: .*\/failure-summary\/failure.txt/);
  const scripts = runScripts(summary);
  assert.equal(scripts.length, 2);
  for (const script of scripts) {
    assert.doesNotMatch(script, /\$\{\{|steps\..*\.outputs|\blogs?\b|stderr|summary\.txt/i);
  }
  assert.doesNotMatch(summary, /needs\.[\w-]+\.outputs\.(?!mode\b|today\b|daily_ok\b|state_ready\b)/);
  const env = summary.split('        env:\n')[1].split('        shell:')[0];
  assert.deepEqual([...env.matchAll(/\$\{\{ (.*?) \}\}/g)].map(m => m[1]), ['needs.run.result', 'needs.run.outputs.daily_ok', 'needs.run.outputs.state_ready', 'needs.commit-state.result', 'needs.notify.result', 'needs.run.outputs.mode', 'needs.run.outputs.today']);
  assert.match(notify, /needs: failure-summary/);
  assert.ok(notify.match(/^    if: (.*)$/m)[1].includes("github.run_attempt == '1'"));
  assert.match(notify, /if: always\(\) && needs.failure-summary.result == 'success'/);
  assert.match(notify, /uses: \.\/\.github\/workflows\/ops-notify.yml/);
  assert.ok(notify.includes(`job: ${slug}`));
  assert.ok(notify.includes('pt_date: $' + '{{ needs.failure-summary.outputs.pt_date }}'));
  assert.ok(notify.includes(`summary_artifact: ${slug}-failure-` + '${{ github.run_id }}-${{ needs.failure-summary.outputs.attempt }}'));
  assert.match(notify, /summary_file: failure.txt/);
  assert.match(notify, /kind: failure/);
  const send = notify.match(/^      send: (.*)$/m)[1];
  for (const gate of ["github.ref == 'refs/heads/main'", "!startsWith(github.event_name, 'pull_request')"]) assert.ok(send.includes(gate));
  assert.doesNotMatch(notify, /continue-on-error/);
});

for (const slug of ['offer-watch', 'weekly-audit']) test(`${slug} fixed failure builder behavior`, () => {
  // Execute only the isolated fixed-text builder, never workflow computation or network commands.
  const summary = read(`.github/workflows/${slug}-cloud.yml`).split('  failure-summary:\n')[1].split('  failure-notify:\n')[0];
  const scripts = runScripts(summary);
  const cases = [
    { results: ['skipped', 'skipped', 'skipped'], mode: 'shadow', today: '2026-11-15', stages: 'run' },
    { results: ['failure', 'skipped', 'skipped'], mode: 'shadow', today: '2026-11-15', stages: 'run' },
    { results: ['success', 'cancelled', 'failure'], mode: 'write', today: '2026-11-15', stages: 'commit-state, notify' },
    { results: ['cancelled', 'skipped', 'cancelled'], mode: 'shadow', today: '', stages: 'run, notify' },
    { results: ['success', 'skipped', 'success'], mode: 'write', today: '2026-11-15', compute: true, stages: 'run (compute step)' },
    { results: ['success', 'skipped', 'skipped'], mode: 'shadow', today: '2026-11-15', stages: 'unknown' },
    { results: ['success', 'skipped', 'success'], mode: 'shadow', today: '2026-11-15', ready: 'false', stages: 'run (stage step)' },
    { results: ['success', 'skipped', 'success'], mode: 'shadow', today: '2026-11-15', ready: 'true\ninjected', stages: 'run (stage step)' },
    { results: ['success', 'skipped', 'success'], mode: 'shadow', today: '2026-11-15', daily: 'false', ready: 'false', compute: true, stages: 'run (compute step)' },
    { results: ['failure\ninjected', 'skipped', 'skipped'], mode: 'write; injected', today: '2026-11-15\ninjected', stages: 'unknown' },
  ];
  for (const c of cases) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-failure-'));
    try {
      const output = path.join(dir, 'outputs');
      const env = { ...process.env, RUNNER_TEMP: dir, GITHUB_OUTPUT: output, GITHUB_RUN_ATTEMPT: '7', DAILY_OK: c.daily ?? (c.compute ? 'false' : 'true'), STATE_READY: c.ready ?? 'true', RUN_RESULT: c.results[0], COMMIT_RESULT: c.results[1], NOTIFY_RESULT: c.results[2], MODE: c.mode, TODAY: c.today };
      if (c.compute) execFileSync('bash', ['-c', scripts[0]], { env, timeout: 3000 });
      execFileSync('bash', ['-c', scripts[1]], { env, timeout: 3000 });
      const content = fs.readFileSync(path.join(dir, 'failure-summary/failure.txt'), 'utf8');
      const date = !c.today ? execFileSync('date', ['+%F'], { env: { ...process.env, TZ: 'America/Los_Angeles' }, encoding: 'utf8', timeout: 3000 }).trim() : /^\d{4}-\d{2}-\d{2}$/.test(c.today) ? c.today : 'unknown';
      const mode = /^(shadow|write)$/.test(c.mode) ? c.mode : 'unknown';
      assert.equal(content, `FAILED: ${slug} cloud run (mode ${mode}), PT ${date}.\nFailed stage(s): ${c.stages}.\nSee the run link for details.\n`);
      assert.equal(sanitize(content), content.trim());
      assert.match(fs.readFileSync(output, 'utf8'), /^pt_date=\d{4}-\d{2}-\d{2}\nattempt=7\n$/);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('notification previews distinguish normal summaries from failure summaries', () => {
  assert.ok(read('.github/workflows/ops-notify.yml').includes("name: ops-notify-preview-${{ github.run_id }}-${{ github.run_attempt }}-${{ inputs.summary_file || 'summary.txt' }}"));
});

for (const slug of ['offer-watch', 'weekly-audit']) test(`${slug} every verdict failure triggers the failure condition`, () => {
  const w = read(`.github/workflows/${slug}-cloud.yml`);
  const summary = w.split('  failure-summary:\n')[1].split('  failure-notify:\n')[0];
  const [prefix, condition] = summary.match(/^    if: (.*)$/m)[1].split("github.run_attempt == '1' && ");
  assert.ok(prefix.includes("!startsWith(github.event_name, 'pull_request')"));
  assert.ok(condition, 'failure expression follows the attempt guard');
  const verdict = runScripts(w.split('  verdict:\n')[1])[0];
  // Enumerate all job results and boolean outputs, including absent outputs.
  for (const run of ['success', 'failure', 'cancelled', 'skipped'])
    for (const commit of ['success', 'failure', 'cancelled', 'skipped'])
      for (const notify of ['success', 'failure', 'cancelled', 'skipped'])
        for (const daily of ['true', 'false', ''])
          for (const ready of ['true', 'false', '']) {
            const values = { 'needs.run.result': run, 'needs.run.outputs.daily_ok': daily, 'needs.run.outputs.state_ready': ready, 'needs.commit-state.result': commit, 'needs.notify.result': notify };
            const expression = condition.replace(/needs\.[a-z._-]+/g, key => JSON.stringify(values[key]));
            const failed = !(daily === 'true' && ready === 'true' && run === 'success' && ['success', 'skipped'].includes(commit) && notify === 'success');
            assert.equal(Function(`return ${expression}`)(), failed, JSON.stringify(values));
          }
  for (const check of ['test "$DAILY_OK" = true', 'test "$STATE_READY" = true', 'test "$RUN_RESULT" = success', '[[ "$COMMIT_RESULT" == success || "$COMMIT_RESULT" == skipped ]]', 'test "$NOTIFY_RESULT" = success']) assert.ok(verdict.includes(check));
});

test('runner ownership preserves news and compact JSON format', () => {
  assert.equal(owners.version, 1);
  assert.deepEqual(owners.news, { owner: 'github-actions', productionEnabled: true, epoch: 'news-20261113-1' });
  assert.equal(read('ops/runner-owner.json'), JSON.stringify(owners) + '\n');
});

test('card validation runs automation tests immediately after unit tests', () => {
  assert.match(read('.github/workflows/validate-cards.yml'), /- name: Unit tests\n        run: npm test\n\n      - name: Automation tests\n        run: npm run test:automation\n/);
});
