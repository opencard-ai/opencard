import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = p => fs.readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const owners = JSON.parse(read('ops/runner-owner.json'));
const pins = {
  checkout: '11d5960a326750d5838078e36cf38b85af677262',
  'setup-node': '49933ea5288caeca8642d1e84afbd3f7d6820020',
  'upload-artifact': 'ea165f8d65b6e75b540449e92b4886f43607fa02',
  'download-artifact': 'd3f86a106a0bac45b974a628896c90dbdf5c8093',
};
for (const [job, slug, cron] of [['offer', 'offer-watch', '39 19 * * *'], ['audit', 'weekly-audit', '47 18 * * 1']]) test(`${job} cloud ownership, workflow permissions and transport invariants`, () => {
  const w = read(`.github/workflows/${slug}-cloud.yml`);
  assert.deepEqual([...w.matchAll(/- cron: '([^']+)'/g)].map(m => m[1]), [cron]);
  assert.doesNotMatch(w, /^\s*timezone:/m); assert.match(w, /2027-03-14/); assert.match(w, /2027-11-07/);
  assert.match(w, /^permissions:\n  contents: read$/m);
  const jobs = Object.fromEntries([...w.slice(w.indexOf('\njobs:\n')).matchAll(/^  ([a-z-]+):\n([\s\S]*?)(?=^  [a-z-]+:\n|$(?![\s\S]))/gm)].map(m => [m[1], m[2]]));
  assert.deepEqual(Object.keys(jobs), ['run', 'commit-state', 'notify', 'verdict']);
  for (const [name, block] of Object.entries(jobs)) {
    const condition = block.match(/^    if: (.*)$/m)?.[1];
    assert.ok(condition?.includes("github.event_name != 'pull_request' || github.event.pull_request.head.repo.full_name == github.repository"), name);
    assert.equal(/contents: write/.test(block), name === 'commit-state');
  }
  assert.equal([...w.matchAll(/contents: write/g)].length, 1);
  const ci = jobs['commit-state'].match(/^    if: (.*)$/m)[1];
  for (const gate of ["needs.run.outputs.mode == 'write'", "needs.run.outputs.daily_ok == 'true'", "needs.run.outputs.state_ready == 'true'", "github.ref == 'refs/heads/main'", "github.event_name != 'pull_request'"]) assert.ok(ci.includes(gate));
  assert.match(jobs['commit-state'], /ref: main/); assert.match(jobs['commit-state'], /ref: ops-state/);
  assert.match(jobs['commit-state'], /group: (offer-watch|weekly-audit)-state/);
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
  for (const secret of secrets) assert.ok(jobs.notify.includes(`${secret}: ` + '$' + `{{ github.event_name != 'pull_request' && secrets.${secret} || '' }}`));
  const send = jobs.notify.match(/^      send: (.*)$/m)[1];
  for (const gate of ["mode == 'write'", "needs.commit-state.outputs.committed == 'true'", "github.ref == 'refs/heads/main'", "github.event_name != 'pull_request'"]) assert.ok(send.includes(gate));
  assert.match(jobs.notify, /permissions:\n      contents: read/);
  assert.match(w, new RegExp(`${job.toUpperCase()}_EPOCH: ${owners[job].epoch}`));
  assert.deepEqual(owners[job], { owner: 'mac', productionEnabled: false, epoch: `${job}-20261115-1` });
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
