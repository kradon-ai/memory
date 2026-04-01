/**
 * Multi-Department — Isolated memory per department
 *
 * Run: node examples/multi-dept.mjs
 */

import { createMemorySystem } from '../src/index.mjs';
import { rmSync } from 'fs';

const mem = createMemorySystem('./demo-data', { watchFiles: false });

// Department A: Engineering
mem.index.update('engineering', [
  { id: 'API-GATEWAY', desc: 'API gateway rate limiting rules', tags: '#infra' },
  { id: 'CI-PIPELINE', desc: 'GitHub Actions CI/CD pipeline config', tags: '#devops' },
]);

// Department B: Product
mem.index.update('product', [
  { id: 'ROADMAP-Q2', desc: 'Q2 roadmap: auth revamp + analytics dashboard', tags: '#planning' },
  { id: 'USER-RESEARCH', desc: 'User interviews: top pain point is onboarding', tags: '#research' },
]);

console.log('Engineering entries:', mem.index.list('engineering').length);
console.log('Product entries:', mem.index.list('product').length);

// Cross-department search (finds results from all departments)
mem.search.init();
const all = await mem.search.query('API', { mode: 'keyword' });
console.log('\nSearch "API" across all departments:');
for (const r of all) {
  console.log(`  [${r.deptId}/${r.source}] score=${r.score}`);
}

// Filtered search (only engineering)
const engOnly = await mem.search.query('API', { deptId: 'engineering', mode: 'keyword' });
console.log(`\nFiltered to engineering: ${engOnly.length} results`);

mem.search.stop();
rmSync('./demo-data', { recursive: true, force: true });
console.log('Done.');
