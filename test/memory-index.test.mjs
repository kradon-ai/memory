/**
 * MemoryIndex Tests (T01-T10)
 */

import { strict as assert } from 'assert';
import { mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { MemoryIndex } from '../src/index.mjs';

const TEST_ROOT = join(import.meta.dirname || '.', '_test_tmp_index');

function setup() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

function teardown() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
}

async function runTests() {
  const results = [];

  // T01: 初始化空目录 → 自动创建MEMORY.md和INDEX区块
  results.push(await test('T01 初始化空目录自动创建MEMORY.md', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [{ id: 'K1', desc: 'test entry', tags: '#test' }]);
    const memPath = join(TEST_ROOT, 'departments', 'dept-a', 'MEMORY.md');
    assert.ok(existsSync(memPath), 'MEMORY.md should exist');
    const content = readFileSync(memPath, 'utf8');
    assert.ok(content.includes('<!-- SKILL_INDEX_START -->'), 'Should have INDEX_START');
    assert.ok(content.includes('<!-- SKILL_INDEX_END -->'), 'Should have INDEX_END');
    assert.ok(content.includes('K1'), 'Should contain entry K1');
    teardown();
  }));

  // T02: 写入新条目 → use_count=1, confidence=low
  results.push(await test('T02 写入新条目默认字段', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    const added = idx.update('dept-a', [
      { id: 'T-AUTH', desc: '用户认证流程重构', tags: '#auth #refactor' },
      { id: 'T-DB', desc: '数据库索引优化', tags: '#database' },
    ]);
    assert.equal(added, 2);
    const entries = idx.list('dept-a');
    assert.equal(entries.length, 2);
    const auth = entries.find(e => e.id === 'T-AUTH');
    assert.equal(auth.use_count, 1);
    assert.equal(auth.confidence, 'low');
    assert.ok(auth.last_used.match(/^\d{4}-\d{2}-\d{2}$/));
    teardown();
  }));

  // T03: 写入重复id → 自动去重
  results.push(await test('T03 写入重复id自动去重', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [{ id: 'K1', desc: 'first', tags: '' }]);
    const added = idx.update('dept-a', [
      { id: 'K1', desc: 'duplicate', tags: '' },
      { id: 'K2', desc: 'second', tags: '' },
    ]);
    assert.equal(added, 1, 'Only K2 should be added');
    const entries = idx.list('dept-a');
    assert.equal(entries.length, 2);
    const k1 = entries.find(e => e.id === 'K1');
    assert.equal(k1.desc, 'first', 'Original desc should be kept');
    teardown();
  }));

  // T04: recordHit → use_count递增, confidence升级, last_used更新
  results.push(await test('T04 recordHit递增use_count', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [{ id: 'K1', desc: 'test', tags: '' }]);
    idx.recordHit('dept-a', ['K1']);
    idx.recordHit('dept-a', ['K1']);
    const entry = idx.get('dept-a', 'K1');
    assert.equal(entry.use_count, 3);
    assert.equal(entry.confidence, 'medium');
    teardown();
  }));

  // T05: confidence自动升级 → ≥3 medium, ≥5 high
  results.push(await test('T05 confidence自动升级', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [{ id: 'K1', desc: 'test', tags: '' }]);
    // use_count starts at 1
    assert.equal(idx.get('dept-a', 'K1').confidence, 'low');
    idx.recordHit('dept-a', ['K1']); // 2
    assert.equal(idx.get('dept-a', 'K1').confidence, 'low');
    idx.recordHit('dept-a', ['K1']); // 3
    assert.equal(idx.get('dept-a', 'K1').confidence, 'medium');
    idx.recordHit('dept-a', ['K1']); // 4
    assert.equal(idx.get('dept-a', 'K1').confidence, 'medium');
    idx.recordHit('dept-a', ['K1']); // 5
    assert.equal(idx.get('dept-a', 'K1').confidence, 'high');
    teardown();
  }));

  // T06: list返回排序 → confidence降序，同级use_count降序
  results.push(await test('T06 list排序正确', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [
      { id: 'A', desc: 'low', tags: '' },
      { id: 'B', desc: 'low', tags: '' },
      { id: 'C', desc: 'low', tags: '' },
    ]);
    // Make C high (5 hits), B medium (3 hits), A stays low (1)
    for (let i = 0; i < 4; i++) idx.recordHit('dept-a', ['C']);
    for (let i = 0; i < 2; i++) idx.recordHit('dept-a', ['B']);
    const entries = idx.list('dept-a');
    assert.equal(entries[0].id, 'C', 'C (high) should be first');
    assert.equal(entries[1].id, 'B', 'B (medium) should be second');
    assert.equal(entries[2].id, 'A', 'A (low) should be third');
    teardown();
  }));

  // T07: get单条
  results.push(await test('T07 get单条返回完整字段', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [{ id: 'K1', desc: 'test desc', tags: '#tag1' }]);
    const entry = idx.get('dept-a', 'K1');
    assert.ok(entry);
    assert.equal(entry.id, 'K1');
    assert.equal(entry.desc, 'test desc');
    assert.equal(entry.tags, '#tag1');
    assert.equal(entry.use_count, 1);
    assert.equal(entry.confidence, 'low');
    // get non-existent
    assert.equal(idx.get('dept-a', 'NOPE'), null);
    teardown();
  }));

  // T08: remove删除
  results.push(await test('T08 remove正确删除', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [
      { id: 'K1', desc: 'keep', tags: '' },
      { id: 'K2', desc: 'remove', tags: '' },
    ]);
    const removed = idx.remove('dept-a', 'K2');
    assert.ok(removed);
    assert.equal(idx.list('dept-a').length, 1);
    assert.equal(idx.get('dept-a', 'K2'), null);
    // Remove non-existent
    assert.equal(idx.remove('dept-a', 'NOPE'), false);
    teardown();
  }));

  // T09: 多部门隔离
  results.push(await test('T09 多部门隔离', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    idx.update('dept-a', [{ id: 'A1', desc: 'dept a entry', tags: '' }]);
    idx.update('dept-b', [{ id: 'B1', desc: 'dept b entry', tags: '' }]);
    assert.equal(idx.list('dept-a').length, 1);
    assert.equal(idx.list('dept-b').length, 1);
    assert.equal(idx.get('dept-a', 'B1'), null);
    assert.equal(idx.get('dept-b', 'A1'), null);
    teardown();
  }));

  // T10: MEMORY.md格式兼容 → 有其他内容时只改INDEX区块
  results.push(await test('T10 保留非INDEX内容', () => {
    setup();
    const idx = new MemoryIndex(TEST_ROOT);
    // Create a file with extra content
    const deptDir = join(TEST_ROOT, 'departments', 'dept-a');
    mkdirSync(deptDir, { recursive: true });
    writeFileSync(join(deptDir, 'MEMORY.md'), [
      '# dept-a · Memory',
      '',
      '<!-- SKILL_INDEX_START -->',
      '| id | desc | tags | use_count | confidence | last_used |',
      '|---|---|---|---|---|---|',
      '| OLD | old entry | #old | 1 | low | 2026-01-01 |',
      '<!-- SKILL_INDEX_END -->',
      '',
      '---',
      '',
      '## Custom Section',
      '',
      'This content should be preserved.',
    ].join('\n'), 'utf8');

    idx.update('dept-a', [{ id: 'NEW', desc: 'new entry', tags: '#new' }]);
    const content = readFileSync(join(deptDir, 'MEMORY.md'), 'utf8');
    assert.ok(content.includes('Custom Section'), 'Custom section preserved');
    assert.ok(content.includes('This content should be preserved'), 'Custom content preserved');
    assert.ok(content.includes('OLD'), 'Old entry preserved');
    assert.ok(content.includes('NEW'), 'New entry added');
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

console.log('\n=== MemoryIndex Tests ===\n');
runTests().then(results => {
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
});
