/**
 * @kradon/memory — Unified Entry Point
 *
 * Multi-Agent Memory System: Index, Search, Age, Compress.
 * Zero dependencies. Works with any LLM. Human-readable Markdown storage.
 */

import { MemoryIndex } from './memory-index.mjs';
import { MemorySearch } from './memory-search.mjs';
import { SessionCompressor } from './session-compress.mjs';
import { KnowledgeAging } from './knowledge-aging.mjs';

export { MemoryIndex, MemorySearch, SessionCompressor, KnowledgeAging };

// Utilities (advanced usage)
export { parseIndex, serializeIndex, replaceIndexBlock, hasIndexBlock, calcConfidence } from './index-parser.mjs';
export { tokenize } from './utils/tokenizer.mjs';

/**
 * Factory function: create a complete memory system with one call.
 *
 * @param {string} rootDir - Root directory for memory storage
 * @param {Object} [options]
 * @param {Function} [options.llmSearch] - LLM reranking function: async (prompt) => string
 * @param {string} [options.deptPath='departments'] - Subdirectory for departments
 * @param {string} [options.globalDir='_global'] - Global memory directory name
 * @param {boolean} [options.watchFiles=true] - Enable file watching for search index
 * @returns {{ index: MemoryIndex, search: MemorySearch, compressor: SessionCompressor, aging: KnowledgeAging }}
 */
export function createMemorySystem(rootDir, options = {}) {
  const { llmSearch, deptPath, globalDir, watchFiles, ...rest } = options;

  const index = new MemoryIndex(rootDir, { deptPath });
  const search = new MemorySearch(rootDir, {
    llmSearch, deptPath, globalDir, watchFiles, ...rest,
  });
  const compressor = new SessionCompressor(rootDir, { deptPath });
  const aging = new KnowledgeAging(rootDir, { deptPath });

  return { index, search, compressor, aging };
}
