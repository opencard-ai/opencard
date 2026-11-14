import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const wf = fs.readFileSync('.github/workflows/weekly-audit-shadow.yml', 'utf8');

test('weekly audit shadow raises the HTTP header limit for the audit step only', () => {
  const step = wf.split(/\n      - /).find(s => s.includes('id: audit'));
  assert.ok(step, 'audit step present');
  assert.match(step!, /NODE_OPTIONS: --max-http-header-size=65536/);
  assert.equal(wf.match(/NODE_OPTIONS:/g)?.length, 1);
});

test('weekly audit shadow stays read-only and unscheduled', () => {
  assert.match(wf, /permissions:\n  contents: read\n/);
  assert.doesNotMatch(wf, /secrets\./);
  assert.doesNotMatch(wf, /^\s+schedule:/m);
});
