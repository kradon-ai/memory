/**
 * Custom Aging Strategy — Control when knowledge goes stale/archived
 *
 * Run: node examples/custom-aging.mjs
 */

import { createMemorySystem } from '../src/index.mjs';
import { writeFileSync, mkdirSync, rmSync } from 'fs';

const mem = createMemorySystem('./demo-data', { watchFiles: false });

// Create entries with various ages via direct file manipulation
const deptDir = './demo-data/departments/my-team';
mkdirSync(deptDir, { recursive: true });

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

writeFileSync(`${deptDir}/MEMORY.md`, `# my-team · Memory

<!-- SKILL_INDEX_START -->
| id | desc | tags | use_count | confidence | last_used |
|---|---|---|---|---|---|
| FRESH | Used yesterday | #active | 5 | high | ${daysAgo(1)} |
| AGING | Not used in a while | #old | 2 | low | ${daysAgo(45)} |
| STALE | Quite old | #forgotten | 1 | low | ${daysAgo(100)} |
| ANCIENT | Very old entry | #dust | 1 | low | ${daysAgo(200)} |
<!-- SKILL_INDEX_END -->

---

## Details
`, 'utf8');

console.log('=== Default aging (90d stale, 180d archive) ===');
const r1 = mem.aging.scan('my-team');
console.log(r1);
// STALE → #stale tag added, ANCIENT → archived

console.log('\n=== Custom aging (30d stale, 60d archive) ===');
// Reset the file first
writeFileSync(`${deptDir}/MEMORY.md`, `# my-team · Memory

<!-- SKILL_INDEX_START -->
| id | desc | tags | use_count | confidence | last_used |
|---|---|---|---|---|---|
| FRESH | Used yesterday | #active | 5 | high | ${daysAgo(1)} |
| AGING | Not used in a while | #old | 2 | low | ${daysAgo(45)} |
| STALE | Quite old | #forgotten | 1 | low | ${daysAgo(100)} |
| ANCIENT | Very old entry | #dust | 1 | low | ${daysAgo(200)} |
<!-- SKILL_INDEX_END -->

---

## Details
`, 'utf8');

const r2 = mem.aging.scan('my-team', {
  staleAfterDays: 30,
  archiveAfterDays: 60,
});
console.log(r2);
// AGING → #stale, STALE + ANCIENT → archived

// Scan all departments at once
const allResults = mem.aging.scanAll({ staleAfterDays: 30, archiveAfterDays: 60 });
console.log('\nscanAll results:', allResults);

rmSync('./demo-data', { recursive: true, force: true });
console.log('\nDone.');
