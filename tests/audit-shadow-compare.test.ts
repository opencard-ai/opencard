import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareFindings, findingKey, renderMarkdown, type Finding } from '../scripts/audit/shadow-compare-core';

const f = (card_id: string, severity: Finding['severity'], detail = 'x'): Finding => ({ card_id, type: 'broken_source_url', severity, detail });

test('audit shadow compare uses the weekly finding key and splits by severity', () => {
  assert.equal(findingKey({ ...f('a', 'high'), detail: ' a   b ' }), 'broken_source_url|a||a b');
  const r = compareFindings([f('a', 'high'), f('b', 'medium'), f('c', 'low')], [f('a', 'high'), f('d', 'medium')]);
  assert.deepEqual([r.cloud, r.mac, r.both, r.only_cloud.length, r.only_mac.length], [3, 2, 1, 2, 1]);
  assert.deepEqual(r.by_severity.medium, { both: 0, only_cloud: 1, only_mac: 1 });
  const md = renderMarkdown(r);
  assert.match(md, /cloud only \[medium\] broken_source_url b/);
  assert.doesNotMatch(md, /broken_source_url c:/);
});
