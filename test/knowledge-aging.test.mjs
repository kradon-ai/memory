/**
 * KnowledgeAging Tests (T26-T30)
 */

import { strict as assert } from 'assert';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { KnowledgeAging } from '../src/index.mjs';

const TEST_ROOT = join(import.meta.dirname || '.', '_test_tmp_aging');

function setup() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

function teardown() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
}

function daysBefore(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function createMemoryWithEntries(deptId, entries) {
  const deptDir = join(TEST_ROOT, 'departments', deptId);
  mkdirSync(deptDir, { recursive: true });

  const header = '| id | desc | tags | use_count | confidence | last_used |';
  const sep = '|---|---|---|---|---|---|';
  const rows = entries.map(e =>
    `| ${e.id} | ${e.desc} | ${e.tags || ''} | ${e.use_count || 1} | ${e.confidence || 'low'} | ${e.last_used} |`
  );

  const content = [
    `# ${deptId} · Memory`,
    '',
    '<!-- SKILL_INDEX_START -->',
    header, sep, ...rows,
    '<!-- SKILL_INDEX_END -->',
    '',
    '---',
    '',
    '## Details',
  ].join('\n');

  writeFileSync(join(deptDir, 'MEMORY.md'), content, 'utf8');
}

async function runTests() {
  const results = [];

  // T26: 90天未用 → stale
  results.push(await test('T26 90天未用标记stale', () => {
    setup();
    createMemoryWithEntries('dept-a', [
      { id: 'K1', desc: 'old entry', tags: '', last_used: daysBefore(95) },
      { id: 'K2', desc: 'recent entry', tags: '', last_used: daysBefore(10) },
    ]);

    const aging = new KnowledgeAging(TEST_ROOT);
    const result = aging.scan('dept-a');

    assert.equal(result.staleMarked, 1, 'Should mark 1 stale');
    const content = readFileSync(join(TEST_ROOT, 'departments', 'dept-a', 'MEMORY.md'), 'utf8');
    assert.ok(content.includes('#stale'), 'Should have #stale tag');
    // K2 should not be stale
    const k2Line = content.split('\n').find(l => l.includes('K2'));
    assert.ok(!k2Line.includes('#stale'), 'K2 should not be stale');
    teardown();
  }));

  // T27: 180天未用 → archive
  results.push(await test('T27 180天未用归档', () => {
    setup();
    createMemoryWithEntries('dept-a', [
      { id: 'K1', desc: 'very old', tags: '', last_used: daysBefore(200) },
      { id: 'K2', desc: 'recent', tags: '', last_used: daysBefore(5) },
    ]);

    const aging = new KnowledgeAging(TEST_ROOT);
    const result = aging.scan('dept-a');

    assert.equal(result.archived, 1, 'Should archive 1');
    const content = readFileSync(join(TEST_ROOT, 'departments', 'dept-a', 'MEMORY.md'), 'utf8');
    assert.ok(content.includes('<!-- ARCHIVE_START -->'), 'Should have ARCHIVE block');
    assert.ok(content.includes('K1'), 'K1 should be in archive section');
    // K1 should NOT be in INDEX
    const indexMatch = content.match(/<!-- SKILL_INDEX_START -->([\s\S]*?)<!-- SKILL_INDEX_END -->/);
    assert.ok(indexMatch, 'INDEX block should exist');
    assert.ok(!indexMatch[1].includes('K1'), 'K1 should not be in INDEX');
    assert.ok(indexMatch[1].includes('K2'), 'K2 should still be in INDEX');
    teardown();
  }));

  // T28: stale条目被使用后恢复
  results.push(await test('T28 stale恢复', () => {
    setup();
    createMemoryWithEntries('dept-a', [
      { id: 'K1', desc: 'was stale now used', tags: '#stale', last_used: daysBefore(5) },
    ]);

    const aging = new KnowledgeAging(TEST_ROOT);
    const result = aging.scan('dept-a');

    assert.equal(result.unstaleMarked, 1, 'Should unstale 1');
    const content = readFileSync(join(TEST_ROOT, 'departments', 'dept-a', 'MEMORY.md'), 'utf8');
    assert.ok(!content.includes('#stale'), '#stale should be removed');
    teardown();
  }));

  // T29: 自定义阈值
  results.push(await test('T29 自定义阈值', () => {
    setup();
    createMemoryWithEntries('dept-a', [
      { id: 'K1', desc: 'custom stale', tags: '', last_used: daysBefore(35) },
    ]);

    const aging = new KnowledgeAging(TEST_ROOT);

    // Default 90 days: 35-day entry should NOT be stale
    const r1 = aging.scan('dept-a');
    assert.equal(r1.staleMarked, 0, 'Default: not stale at 35 days');

    // Reset
    createMemoryWithEntries('dept-a', [
      { id: 'K1', desc: 'custom stale', tags: '', last_used: daysBefore(35) },
    ]);

    // Custom 30 days: 35-day entry SHOULD be stale
    const r2 = aging.scan('dept-a', { staleAfterDays: 30 });
    assert.equal(r2.staleMarked, 1, 'Custom 30d: stale at 35 days');
    teardown();
  }));

  // T30: scanAll多部门
  results.push(await test('T30 scanAll多部门', () => {
    setup();
    createMemoryWithEntries('dept-a', [
      { id: 'A1', desc: 'old a', tags: '', last_used: daysBefore(100) },
    ]);
    createMemoryWithEntries('dept-b', [
      { id: 'B1', desc: 'old b', tags: '', last_used: daysBefore(100) },
    ]);

    const aging = new KnowledgeAging(TEST_ROOT);
    const results = aging.scanAll();

    assert.ok(results['dept-a'], 'dept-a results should exist');
    assert.ok(results['dept-b'], 'dept-b results should exist');
    assert.equal(results['dept-a'].staleMarked, 1);
    assert.equal(results['dept-b'].staleMarked, 1);
    teardown();
  }));

  return results;
}

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return { name, pass: true };
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    return { name, pass: false, error: err.message };
  }
}

console.log('\n=== KnowledgeAging Tests ===\n');
runTests().then(results => {
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
});
