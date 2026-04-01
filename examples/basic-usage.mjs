/**
 * Basic Usage — 3 lines to get started
 *
 * Run: node examples/basic-usage.mjs
 */

import { createMemorySystem } from '../src/index.mjs';

// 1. Create memory system (uses ./demo-data as storage root)
const mem = createMemorySystem('./demo-data', { watchFiles: false });

// 2. Store knowledge entries
mem.index.update('my-project', [
  { id: 'AUTH-FLOW', desc: 'JWT authentication with refresh tokens', tags: '#auth #security' },
  { id: 'DB-POOL',  desc: 'PostgreSQL connection pool config (max 20)', tags: '#database #config' },
  { id: 'CACHE-TTL', desc: 'Redis cache TTL set to 300s for API responses', tags: '#cache #performance' },
]);

console.log('Stored 3 entries.');

// 3. Record usage hits (simulates knowledge being recalled)
mem.index.recordHit('my-project', ['AUTH-FLOW']);
mem.index.recordHit('my-project', ['AUTH-FLOW']);
mem.index.recordHit('my-project', ['AUTH-FLOW']);

// 4. Check the results
const entries = mem.index.list('my-project');
for (const e of entries) {
  console.log(`  ${e.id}: use_count=${e.use_count}, confidence=${e.confidence}`);
}

// 5. Search
mem.search.init();
const results = await mem.search.query('authentication token', { mode: 'keyword' });
console.log('\nSearch "authentication token":');
for (const r of results) {
  console.log(`  [${r.source}] score=${r.score} — ${r.text.slice(0, 80)}...`);
}

mem.search.stop();

// Cleanup demo files
import { rmSync } from 'fs';
rmSync('./demo-data', { recursive: true, force: true });
console.log('\nDone. Demo data cleaned up.');
