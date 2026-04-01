/**
 * SessionCompressor Tests (T21-T25)
 */

import { strict as assert } from 'assert';
import { mkdirSync, rmSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { SessionCompressor } from '../src/index.mjs';

const TEST_ROOT = join(import.meta.dirname || '.', '_test_tmp_session');

function setup() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
  mkdirSync(TEST_ROOT, { recursive: true });
}

function teardown() {
  rmSync(TEST_ROOT, { recursive: true, force: true });
}

function createSessionFile(deptId, filename, content) {
  const sessDir = join(TEST_ROOT, 'departments', deptId, 'sessions');
  mkdirSync(sessDir, { recursive: true });
  writeFileSync(join(sessDir, filename), content, 'utf8');
}

function daysBefore(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

async function runTests() {
  const results = [];

  // T21: 7天前日记压缩 → 生成week-YYYY-WNN.md
  results.push(await test('T21 7天前日记压缩为周汇总', () => {
    setup();
    const date8 = daysBefore(8);
    const date9 = daysBefore(9);
    createSessionFile('dept-a', `${date8}-abc123.md`, '---\ntitle: session1\n---\nSession 1 content about auth.');
    createSessionFile('dept-a', `${date9}-def456.md`, '---\ntitle: session2\n---\nSession 2 content about database.');

    const compressor = new SessionCompressor(TEST_ROOT);
    const result = compressor.compress('dept-a');

    assert.ok(result.weeksCreated >= 1, `Should create at least 1 week file, got ${result.weeksCreated}`);
    assert.ok(result.newWeekFiles.length >= 1, 'Should have new week files');

    const sessDir = join(TEST_ROOT, 'departments', 'dept-a', 'sessions');
    const files = readdirSync(sessDir);
    const weekFiles = files.filter(f => f.startsWith('week-'));
    assert.ok(weekFiles.length >= 1, 'Week file should exist');

    // Original daily files should be removed
    assert.ok(!existsSync(join(sessDir, `${date8}-abc123.md`)), 'Daily file should be deleted');
    teardown();
  }));

  // T22: 30天前周汇总归档 → 移至archive/
  results.push(await test('T22 30天前周汇总归档', () => {
    setup();
    // Create a week file from ~35 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 35);
    const year = oldDate.getFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayNum = oldDate.getUTCDay() || 7;
    const d = new Date(Date.UTC(oldDate.getFullYear(), oldDate.getMonth(), oldDate.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    const weekKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
    const weekFilename = `week-${weekKey}.md`;

    const sessDir = join(TEST_ROOT, 'departments', 'dept-a', 'sessions');
    mkdirSync(sessDir, { recursive: true });
    writeFileSync(join(sessDir, weekFilename), `# Weekly Summary: ${weekKey}\n\nOld content.`, 'utf8');

    const compressor = new SessionCompressor(TEST_ROOT);
    const result = compressor.compress('dept-a');

    assert.ok(result.weeksArchived >= 1, `Should archive at least 1, got ${result.weeksArchived}`);
    const archiveDir = join(sessDir, 'archive');
    assert.ok(existsSync(archiveDir), 'Archive dir should exist');
    assert.ok(existsSync(join(archiveDir, weekFilename)), 'Week file should be in archive');
    assert.ok(!existsSync(join(sessDir, weekFilename)), 'Week file should be removed from sessions');
    teardown();
  }));

  // T23: 当天文件不动
  results.push(await test('T23 当天文件不压缩', () => {
    setup();
    const today = new Date().toISOString().slice(0, 10);
    createSessionFile('dept-a', `${today}-today123.md`, 'Today session content.');

    const compressor = new SessionCompressor(TEST_ROOT);
    const result = compressor.compress('dept-a');

    assert.equal(result.weeksCreated, 0, 'Should not create week files');
    const sessDir = join(TEST_ROOT, 'departments', 'dept-a', 'sessions');
    assert.ok(existsSync(join(sessDir, `${today}-today123.md`)), 'Today file should remain');
    teardown();
  }));

  // T24: 空目录 → 无错误
  results.push(await test('T24 空目录无错误', () => {
    setup();
    const compressor = new SessionCompressor(TEST_ROOT);
    const result = compressor.compress('nonexistent-dept');
    assert.equal(result.weeksCreated, 0);
    assert.equal(result.weeksArchived, 0);
    assert.deepEqual(result.newWeekFiles, []);
    teardown();
  }));

  // T25: 自定义阈值 → weekThresholdDays=3
  results.push(await test('T25 自定义阈值', () => {
    setup();
    const date4 = daysBefore(4);
    createSessionFile('dept-a', `${date4}-custom.md`, 'Custom threshold content.');

    const compressor = new SessionCompressor(TEST_ROOT);

    // Default 7 days: 4-day-old file should NOT be compressed
    const result1 = compressor.compress('dept-a');
    assert.equal(result1.weeksCreated, 0, 'Default 7-day threshold: 4-day file untouched');

    // Custom 3 days: 4-day-old file SHOULD be compressed
    const result2 = compressor.compress('dept-a', { weekThresholdDays: 3 });
    assert.ok(result2.weeksCreated >= 1, 'Custom 3-day threshold: 4-day file compressed');
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

console.log('\n=== SessionCompressor Tests ===\n');
runTests().then(results => {
  const passed = results.filter(r => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  if (passed < results.length) process.exit(1);
});
