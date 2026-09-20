import test from 'node:test';
import assert from 'node:assert/strict';
import { hiltonAnniversaryHint as hint, hiltonEmailSection, reminderInstances } from '../lib/hilton-anniversary';
const id = 'amex-hilton-surpass';
test('first and later review windows, year rollover, invalid dates and excluded products', () => {
  const sep = new Date('2026-09-20T16:00:00Z');
  assert.equal(hint(id, {year:2025,month:9}, sep)?.stage,'anniversary');
  assert.equal(hint(id, {year:2025,month:10}, sep)?.stage,'before');
  assert.equal(hint(id, {year:2026,month:9}, sep),null);
  assert.equal(hint(id, {year:2025,month:11}, sep),null);
  assert.equal(hint(id, {year:2025,month:8}, sep),null);
  assert.equal(hint(id, {year:2027,month:9}, sep),null);
  assert.equal(hint(id, {year:2025,month:13}, sep),null);
  assert.equal(hint(id, undefined, sep),null);
  assert.equal(hint('amex-hilton-honors-biz', {year:2025,month:9}, sep),null);
  assert.equal(hint(id, {year:2026,month:1}, new Date('2026-12-01Z'))?.key,'2026-1:2027:before');
  assert.equal(hint(id, {year:2025,month:9}, new Date('2027-09-01Z'))?.key,'2025-9:2027:anniversary');
});
test('email supports legacy and separate active copies and escapes names', () => {
  assert.deepEqual(reminderInstances({cards:[id]}),[{instance_id:id,card_id:id}]);
  assert.deepEqual(reminderInstances({card_instances:[{instance_id:'one',card_id:id},{instance_id:'closed',card_id:id,status:'closed'}]}),[{instance_id:'one',card_id:id}]);
  const html=hiltonEmailSection([{key:'private-id',name:'<script>Card</script>',date:'2025-09',hint:{stage:'anniversary',key:'x'}}], 'zh', 'https://opencardai.com');
  assert(!html.includes('<script>'));assert(!html.includes('private-id'));
  assert(html.includes('/zh/my-cards#my-cards-ai'));assert(html.includes('本月是開卡週年月'));
  assert.equal(hiltonEmailSection([], 'en', 'https://opencardai.com'),'');
});
