/**
 * MemorySearch Tests (T11-T20)
 */

import { strict as assert } from 'assert';
import { mkdirSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { MemorySearch, tokenize } from '../src/index.mjs';

const TEST_ROOT = join(import.meta.dirname || '.', '_test_tmp_search');

function setup() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

function teardown() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
}

function createDeptMemory(deptId, content) {
  const deptDir = join(TEST_ROOT, 'departments', deptId);
  mkdirSync(deptDir, { recursive: true });
  writeFileSync(join(deptDir, 'MEMORY.md'), content, 'utf8');
}

async function runTests() {
  const results = [];

  // T11: keyword搜索 → TF-IDF排序正确
  results.push(await test('T11 keyword搜索TF-IDF排序', async () => {
    setup();
    createDeptMemory('dept-tech', [
      '# Tech Memory',
      '',
      '## Authentication',
      'User authentication flow with JWT tokens. Login and session management.',
      '',
      '## Database',
      'Database optimization and indexing strategies for PostgreSQL.',
    ].join('\n'));

    const search = new MemorySearch(TEST_ROOT, { watchFiles: false });
    search.init();

    const results = await search.query('authentication login', { mode: 'keyword' });
    assert.ok(results.length > 0, 'Should return results');
    assert.ok(results[0].text.includes('authentication') || results[0].text.includes('Authentication'),
      'Top result should be about authentication');
    search.stop();
    teardown();
  }));

  // T12: 中文分词 → unigram+bigram
  results.push(await test('T12 中文分词unigram+bigram', () => {
    const tokens = tokenize('用户认证');
    assert.ok(tokens.includes('用'), 'Should have unigram 用');
    assert.ok(tokens.includes('户'), 'Should have unigram 户');
    assert.ok(tokens.includes('用户'), 'Should have bigram 用户');
    assert.ok(tokens.includes('认证'), 'Should have bigram 认证');
  }));

  // T13: 英文保留 → 英文单词不被拆分
  results.push(await test('T13 英文单词不拆分', () => {
    const tokens = tokenize('hello world test');
    assert.ok(tokens.includes('hello'), 'Should have word hello');
    assert.ok(tokens.includes('world'), 'Should have word world');
    assert.ok(!tokens.includes('hel'), 'Should not split English words');
  }));

  // T14: 部门过滤 → 只返回指定部门结果
  results.push(await test('T14 部门过滤', async () => {
    setup();
    createDeptMemory('dept-tech', '# Tech\n\nDatabase optimization PostgreSQL indexing performance.');
    createDeptMemory('dept-product', '# Product\n\nProduct roadmap and feature planning for Q2.');

    const search = new MemorySearch(TEST_ROOT, { watchFiles: false });
    search.init();

    const techResults = await search.query('optimization', { deptId: 'dept-tech', mode: 'keyword' });
    for (const r of techResults) {
      assert.ok(r.deptId === 'dept-tech' || r.deptId === '_global',
        `Result should be from dept-tech or _global, got ${r.deptId}`);
    }
    search.stop();
    teardown();
  }));

  // T15: hybrid模式（无LLM） → 降级为keyword
  results.push(await test('T15 hybrid无LLM降级为keyword', async () => {
    setup();
    createDeptMemory('dept-tech', '# Tech\n\nUser authentication JWT tokens login flow.');

    const search = new MemorySearch(TEST_ROOT, { watchFiles: false });
    search.init();

    const results = await search.query('authentication', { mode: 'hybrid' });
    assert.ok(results.length > 0, 'Should still return results without LLM');
    assert.equal(results[0].method, 'tfidf', 'Method should be tfidf when no LLM');
    search.stop();
    teardown();
  }));

  // T16: hybrid模式（有LLM） → TF-IDF+LLM合并
  results.push(await test('T16 hybrid有LLM合并去重', async () => {
    setup();
    createDeptMemory('dept-tech', [
      '# Tech Memory',
      '',
      '## Section 1',
      'Authentication and login flow with JWT.',
      '',
      '## Section 2',
      'Database indexing and query optimization.',
      '',
      '## Section 3',
      'API rate limiting and throttling.',
    ].join('\n'));

    const mockLLM = async (prompt) => '1,2';
    const search = new MemorySearch(TEST_ROOT, { llmSearch: mockLLM, watchFiles: false });
    search.init();

    const results = await search.query('authentication', { mode: 'hybrid' });
    assert.ok(results.length > 0, 'Should return results');
    search.stop();
    teardown();
  }));

  // T17: getRelevant格式化 → Markdown, maxChars
  results.push(await test('T17 getRelevant格式化输出', async () => {
    setup();
    createDeptMemory('dept-tech', '# Tech\n\nUser authentication JWT tokens login session management flow.');

    const search = new MemorySearch(TEST_ROOT, { watchFiles: false });
    search.init();

    const result = await search.getRelevant('authentication', 'dept-tech', { maxChars: 5000 });
    assert.ok(result.includes('## Relevant Memory'), 'Should have header');
    assert.ok(result.includes('###'), 'Should have section markers');

    // Test maxChars limit
    const short = await search.getRelevant('authentication', 'dept-tech', { maxChars: 50 });
    assert.ok(short.length <= 200, 'Should respect maxChars approximately');
    search.stop();
    teardown();
  }));

  // T18: 文件监控 — 修改后索引更新（简化测试：rebuild）
  results.push(await test('T18 rebuild重建索引', async () => {
    setup();
    createDeptMemory('dept-tech', '# Tech\n\nOriginal content about databases.');

    const search = new MemorySearch(TEST_ROOT, { watchFiles: false });
    search.init();

    const before = await search.query('authentication', { mode: 'keyword' });
    assert.equal(before.length, 0, 'No auth results initially');

    // Modify file and rebuild
    createDeptMemory('dept-tech', '# Tech\n\nAuthentication and JWT token management.');
    search.rebuild();

    const after = await search.query('authentication', { mode: 'keyword' });
    assert.ok(after.length > 0, 'Should find auth after rebuild');
    search.stop();
    teardown();
  }));

  // T19: stop关闭监控
  results.push(await test('T19 stop释放资源', () => {
    setup();
    const search = new MemorySearch(TEST_ROOT, { watchFiles: false });
    search.init();
    assert.ok(search.status().initialized);
    search.stop();
    assert.ok(!search.status().initialized);
    teardown();
  }));

  // T20: status字段完整
  results.push(await test('T20 status字段完整', () => {
    setup();
    createDeptMemory('dept-tech', '# Tech\n\nSome content here.');
    createDeptMemory('dept-product', '# Product\n\nMore content.');

    const search = new MemorySearch(TEST_ROOT, { watchFiles: false });
    search.init();

    const status = search.status();
    assert.equal(status.initialized, true);
    assert.ok(typeof status.totalChunks === 'number');
    assert.ok(typeof status.totalTerms === 'number');
    assert.equal(status.llmEnabled, false);
    assert.ok(Array.isArray(status.departments));
    assert.ok(status.departments.includes('dept-tech'));
    assert.ok(status.departments.includes('dept-product'));
    search.stop();
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

console.log('\n=== MemorySearch Tests ===\n');
runTests().then(results => {
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
});
