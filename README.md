# @kradon/memory

**Multi-Agent Memory System — Index, Search, Age, Compress**

> Structured knowledge management for AI agent systems.
> Zero dependencies. Works with any LLM. Human-readable Markdown storage.

## Why This Exists

Most AI agent frameworks treat memory as a flat text file or a vector database. Neither works well for multi-agent systems that need **structured, weighted, human-readable** knowledge management.

`@kradon/memory` provides four primitives that handle the full knowledge lifecycle:

| Primitive | What it does |
|---|---|
| **MemoryIndex** | CRUD with auto-dedup, confidence scoring, hit tracking |
| **MemorySearch** | TF-IDF keyword search + optional LLM semantic reranking |
| **SessionCompressor** | Daily journals → weekly summaries → archived |
| **KnowledgeAging** | 90-day stale marking, 180-day auto-archiving |

All data is stored in **Markdown files** — version-control friendly, human-readable, no database required.

## Quick Start

```bash
npm install @kradon/memory
```

```javascript
import { createMemorySystem } from '@kradon/memory';

const mem = createMemorySystem('./my-project');

// Store knowledge
mem.index.update('engineering', [
  { id: 'AUTH', desc: 'JWT auth with refresh tokens', tags: '#security' },
]);

// Search
mem.search.init();
const results = await mem.search.query('authentication');
```

## Features

- **Knowledge Index** — CRUD operations with auto-weighting and confidence scoring (low → medium → high)
- **Hybrid Search** — TF-IDF keyword matching + optional LLM reranking (bring your own LLM)
- **Session Compression** — Daily → Weekly → Archive, fully automatic lifecycle
- **Knowledge Aging** — 90-day stale marking, 180-day archiving (customizable thresholds)
- **Multi-Department** — Isolated memory per department/namespace, cross-department search
- **Human-Readable** — All data stored in Markdown tables, git-friendly, inspectable
- **LLM-Agnostic** — Works without any LLM; optionally inject any LLM for semantic search
- **Zero Dependencies** — Pure JavaScript, Node.js 18+, no native modules
- **Chinese + English** — Built-in tokenizer handles both Chinese (unigram+bigram) and English

## Architecture

```
Knowledge Lifecycle:

  WRITE → INDEX → SEARCH → HIT → WEIGHT UP → STALE → ARCHIVE
    │        │        │       │        │          │        │
    ▼        ▼        ▼       ▼        ▼          ▼        ▼
 update()  MEMORY.md  query() recordHit() confidence  #stale  ARCHIVE
                                          low→med→high  90d    180d
```

### Storage Structure

```
{rootDir}/
└── departments/
    ├── engineering/
    │   ├── MEMORY.md          ← Knowledge index (Markdown table)
    │   └── sessions/
    │       ├── 2026-04-01-abc.md  ← Daily session journal
    │       ├── week-2026-W14.md   ← Weekly summary (auto-compressed)
    │       └── archive/           ← Old weekly summaries
    └── product/
        ├── MEMORY.md
        └── sessions/
```

### INDEX Format (inside MEMORY.md)

```markdown
<!-- SKILL_INDEX_START -->
| id | desc | tags | use_count | confidence | last_used |
|---|---|---|---|---|---|
| AUTH | JWT auth with refresh tokens | #security | 5 | high | 2026-04-01 |
| DB-OPT | PostgreSQL query optimization | #database | 2 | low | 2026-03-28 |
<!-- SKILL_INDEX_END -->
```

## API Reference

### MemoryIndex

```javascript
import { MemoryIndex } from '@kradon/memory';

const index = new MemoryIndex(rootDir, { deptPath: 'departments' });

// Write entries (auto-dedup by id)
index.update('dept-id', [
  { id: 'KEY', desc: 'Description', tags: '#tag1 #tag2' }
]);

// Record usage hit → use_count++, confidence auto-upgrade
index.recordHit('dept-id', ['KEY']);

// Read
index.list('dept-id');          // → Array of all entries
index.get('dept-id', 'KEY');    // → Single entry or null

// Delete
index.remove('dept-id', 'KEY'); // → true/false
```

**Confidence levels:** `use_count < 3` → low, `3-4` → medium, `5+` → high

### MemorySearch

```javascript
import { MemorySearch } from '@kradon/memory';

const search = new MemorySearch(rootDir, {
  llmSearch: async (prompt) => callYourLLM(prompt),  // optional
  watchFiles: true,   // auto-rebuild index on file changes
  chunkSize: 300,     // characters per chunk
  chunkOverlap: 50,   // overlap between chunks
  maxResults: 10,     // default result limit
});

search.init();  // build index + start file watcher

// Search (three modes)
await search.query('search text', {
  deptId: 'engineering',  // optional: filter by department
  limit: 5,               // optional: max results
  mode: 'hybrid',         // 'keyword' | 'semantic' | 'hybrid'
});

// Get formatted memory for LLM prompt injection
await search.getRelevant('query', 'dept-id', { maxChars: 1500 });

search.rebuild();  // manually rebuild index
search.status();   // { initialized, totalChunks, totalTerms, llmEnabled, departments }
search.stop();     // release file watcher
```

### SessionCompressor

```javascript
import { SessionCompressor } from '@kradon/memory';

const compressor = new SessionCompressor(rootDir);

compressor.compress('dept-id', {
  weekThresholdDays: 7,     // days before daily→weekly (default: 7)
  archiveThresholdDays: 30, // days before weekly→archive (default: 30)
});
// → { weeksCreated, weeksArchived, newWeekFiles }
```

### KnowledgeAging

```javascript
import { KnowledgeAging } from '@kradon/memory';

const aging = new KnowledgeAging(rootDir);

aging.scan('dept-id', {
  staleAfterDays: 90,    // days before #stale tag (default: 90)
  archiveAfterDays: 180, // days before archive (default: 180)
});
// → { staleMarked, unstaleMarked, archived }

aging.scanAll();  // scan all departments
```

### Factory Function

```javascript
import { createMemorySystem } from '@kradon/memory';

const mem = createMemorySystem(rootDir, {
  llmSearch: async (prompt) => '...',  // optional
  deptPath: 'departments',             // optional
  watchFiles: true,                    // optional
});

mem.index       // MemoryIndex instance
mem.search      // MemorySearch instance
mem.compressor  // SessionCompressor instance
mem.aging       // KnowledgeAging instance
```

## Benchmarks

Tested with RECALL-based memory injection vs static full-file injection:

| Metric | Static Injection | RECALL Injection | Improvement |
|---|---|---|---|
| Token Usage | 906 avg | 781 avg | **-13.8%** |
| Precision | 18.0% | 23.2% | **+5.2 pts** |
| Recall | 68.3% | 95.0% | **+26.7 pts** |

## Examples

- [`basic-usage.mjs`](examples/basic-usage.mjs) — Store, search, and track knowledge in 10 lines
- [`multi-dept.mjs`](examples/multi-dept.mjs) — Isolated memory per department with cross-department search
- [`with-llm.mjs`](examples/with-llm.mjs) — Plug in any LLM for hybrid semantic+keyword search
- [`custom-aging.mjs`](examples/custom-aging.mjs) — Customize stale/archive thresholds

## Used in Production

> `@kradon/memory` powers the memory system of [Kradon](https://kradon.ai), an AI Company OS platform with 34/34 tests passing, managing multi-department knowledge across engineering, product, editorial, and more.

## License

MIT
