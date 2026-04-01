/**
 * Integration Tests (T31-T34)
 */

import { strict as assert } from 'assert';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createMemorySystem, MemoryIndex, MemorySearch, SessionCompressor, KnowledgeAging } from '../src/index.mjs';

const TEST_ROOT = join(import.meta.dirname || '.', '_test_tmp_integration');

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

async function runTests() {
  const results = [];

  // T31: 完整生命周期 → 写入→搜索→命中→权重升级→老化→归档
  results.push(await test('T31 完整生命周期', async () => {
    setup();
    const mem = createMemorySystem(TEST_ROOT, { watchFiles: false });

    // 1. 写入
    mem.index.update('dept-tech', [
      { id: 'T-AUTH', desc: 'User authentication flow', tags: '#auth' },
      { id: 'T-DB', desc: 'Database optimization', tags: '#database' },
    ]);
    assert.equal(mem.index.list('dept-tech').length, 2, 'Should have 2 entries');

    // 2. 搜索
    mem.search.init();
    const results = await mem.search.query('authentication', { deptId: 'dept-tech', mode: 'keyword' });
    assert.ok(results.length > 0, 'Should find auth entry');

    // 3. 命中 + 权重升级
    for (let i = 0; i < 4; i++) mem.index.recordHit('dept-tech', ['T-AUTH']);
    const auth = mem.index.get('dept-tech', 'T-AUTH');
    assert.equal(auth.use_count, 5);
    assert.equal(auth.confidence, 'high');

    // 4. 老化（entries are fresh, should not be stale）
    const agingResult = mem.aging.scan('dept-tech');
    assert.equal(agingResult.staleMarked, 0, 'Fresh entries should not be stale');

    mem.search.stop();
    teardown();
  }));

  // T32: 多部门并行操作
  results.push(await test('T32 多部门并行操作', () => {
    setup();
    const mem = createMemorySystem(TEST_ROOT, { watchFiles: false });

    // Write to two departments
    mem.index.update('dept-tech', [{ id: 'TECH-1', desc: 'tech entry', tags: '' }]);
    mem.index.update('dept-product', [{ id: 'PROD-1', desc: 'product entry', tags: '' }]);

    // Verify isolation
    assert.equal(mem.index.list('dept-tech').length, 1);
    assert.equal(mem.index.list('dept-product').length, 1);
    assert.equal(mem.index.get('dept-tech', 'PROD-1'), null);
    assert.equal(mem.index.get('dept-product', 'TECH-1'), null);

    // Hit in one dept shouldn't affect other
    mem.index.recordHit('dept-tech', ['TECH-1']);
    assert.equal(mem.index.get('dept-tech', 'TECH-1').use_count, 2);
    assert.equal(mem.index.get('dept-product', 'PROD-1').use_count, 1);
    teardown();
  }));

  // T33: 大数据量（1000条） → 性能在合理时间内
  results.push(await test('T33 大数据量性能', async () => {
    setup();
    const mem = createMemorySystem(TEST_ROOT, { watchFiles: false });

    // Write 1000 entries
    const entries = [];
    for (let i = 0; i < 1000; i++) {
      entries.push({ id: `K-${String(i).padStart(4, '0')}`, desc: `Entry number ${i} about topic ${i % 10}`, tags: `#tag${i % 5}` });
    }

    const writeStart = Date.now();
    mem.index.update('dept-perf', entries);
    const writeTime = Date.now() - writeStart;

    assert.equal(mem.index.list('dept-perf').length, 1000, 'Should have 1000 entries');

    // Search performance
    mem.search.init();
    const searchStart = Date.now();
    const results = await mem.search.query('topic number entry', { deptId: 'dept-perf', mode: 'keyword' });
    const searchTime = Date.now() - searchStart;

    assert.ok(results.length > 0, 'Should return results');
    assert.ok(searchTime < 5000, `Search should complete in <5s, took ${searchTime}ms`);

    mem.search.stop();
    teardown();
  }));

  // T34: createMemorySystem工厂 → 四模块正确初始化
  results.push(await test('T34 createMemorySystem工厂', () => {
    setup();
    const mem = createMemorySystem(TEST_ROOT, { watchFiles: false });

    assert.ok(mem.index instanceof MemoryIndex, 'index should be MemoryIndex');
    assert.ok(mem.search instanceof MemorySearch, 'search should be MemorySearch');
    assert.ok(mem.compressor instanceof SessionCompressor, 'compressor should be SessionCompressor');
    assert.ok(mem.aging instanceof KnowledgeAging, 'aging should be KnowledgeAging');

    // With LLM option
    const memWithLLM = createMemorySystem(TEST_ROOT, {
      llmSearch: async () => '1',
      watchFiles: false,
    });
    memWithLLM.search.init();
    assert.equal(memWithLLM.search.status().llmEnabled, true);
    memWithLLM.search.stop();
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

console.log('\n=== Integration Tests ===\n');
runTests().then(results => {
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
});
