import test from 'node:test';
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createPR } from '../scripts/auto-update-cards/pr';
import type { Card } from '../scripts/auto-update-cards/cards-loader';
import type { ExtractedData } from '../scripts/auto-update-cards/extract';

// These characterize the current lack of rollback. Every git/gh command is stubbed;
// fixture writes occur exclusively beneath os.tmpdir(). No repository is committed.
for (const stage of ['git commit', 'git push', 'gh pr create']) {
  test(`failure at ${stage} propagates but currently leaves the patched card and PR body`, async (t) => {
    const cwd = process.cwd();
    const dir = mkdtempSync(path.join(tmpdir(), 'auto-pr-failure-'));
    process.chdir(dir);
    t.after(() => { process.chdir(cwd); rmSync(dir, { recursive: true, force: true }); });
    const commands: string[] = [];
    t.mock.method(childProcess, 'execSync', (command: string) => {
      commands.push(command);
      if (command.startsWith(stage)) throw Object.assign(new Error('simulated failure'), { stdout: 'fixture failure detail' });
      if (command.startsWith('gh pr list')) return '';
      return Buffer.from('');
    });
    syncBuiltinESMExports();
    t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
    const card = { card_id: 'fixture', name: 'Fixture', annual_fee: 95, welcome_offer: null };
    mkdirSync(path.join(dir, 'data/cards'), { recursive: true });
    const file = path.join(dir, 'data/cards/fixture.json');
    writeFileSync(file, JSON.stringify(card));
    await assert.rejects(createPR(card as unknown as Card, {
      card_id: 'fixture', confidence: 1, source_url: '', scraped_at: '', changes: [
        { field: 'annual_fee', from: 95, to: 100 },
        { field: 'welcome_offer.bonus_points', from: null, to: 60000 },
      ],
    }, { confidence: 1, source_quote: '' } as ExtractedData, 'HIGH'),
    stage === 'gh pr create' ? /gh pr create failed: fixture failure detail/ : /simulated failure/);
    const after = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(after.annual_fee, 100);
    assert.equal(after.welcome_offer.bonus_points, 60000);
    assert.ok(after.last_updated);
    assert.equal(existsSync(path.join(dir, 'tmp/pr-body-fixture.txt')), true);
    assert.ok(commands.at(-1)?.startsWith(stage));
    assert.equal(commands.some(command => /git (restore|reset|revert)/.test(command)), false);
    if (stage === 'git commit') assert.equal(commands.some(command => command.startsWith('git push')), false);
    if (stage === 'git push') assert.equal(commands.some(command => command.startsWith('gh pr create')), false);
  });
}
