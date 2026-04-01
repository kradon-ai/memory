/**
 * LLM-Enhanced Search — Plug in any LLM for semantic reranking
 *
 * Run: node examples/with-llm.mjs
 *
 * This example shows how to inject an LLM function for hybrid search.
 * Replace the mock with your actual LLM API call.
 */

import { createMemorySystem } from '../src/index.mjs';
import { rmSync } from 'fs';

// Mock LLM function — replace with your actual LLM API
async function mockLLM(prompt) {
  // In production, call OpenAI/Anthropic/local model here:
  //   const response = await fetch('https://api.openai.com/v1/chat/completions', {...});
  //   return response.choices[0].message.content;

  // Mock: just return the first 3 candidates
  return '1,2,3';
}

const mem = createMemorySystem('./demo-data', {
  llmSearch: mockLLM,  // <-- inject LLM here
  watchFiles: false,
});

mem.index.update('docs', [
  { id: 'INSTALL', desc: 'Installation guide for macOS/Linux/Windows', tags: '#setup' },
  { id: 'AUTH', desc: 'Authentication: OAuth2 + JWT bearer tokens', tags: '#security' },
  { id: 'DEPLOY', desc: 'Deployment to AWS ECS with Fargate', tags: '#infra' },
  { id: 'MONITOR', desc: 'Monitoring with Grafana + Prometheus alerting', tags: '#observability' },
]);

mem.search.init();

// Hybrid mode: TF-IDF keyword matching + LLM semantic reranking
const results = await mem.search.query('how to set up the project', { mode: 'hybrid' });
console.log('Hybrid search results:');
for (const r of results) {
  console.log(`  [${r.method}] score=${r.score} — ${r.text.slice(0, 80)}...`);
}

// Get formatted memory for prompt injection
const relevant = await mem.search.getRelevant('authentication setup', 'docs', { maxChars: 2000 });
console.log('\nFormatted for LLM prompt:');
console.log(relevant);

// Status
console.log('Engine status:', mem.search.status());

mem.search.stop();
rmSync('./demo-data', { recursive: true, force: true });
console.log('Done.');
