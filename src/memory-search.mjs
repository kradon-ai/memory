/**
 * @kradon/memory — MemorySearch
 *
 * Dual-path retrieval engine: TF-IDF keyword matching + optional LLM semantic reranking.
 * Zero external dependencies. Pure JS TF-IDF implementation.
 */

import { readFileSync, existsSync, readdirSync, statSync, watch } from 'fs';
import { join, basename } from 'path';
import { tokenize } from './utils/tokenizer.mjs';
import {
  CHUNK_SIZE, CHUNK_OVERLAP, MAX_SEARCH_RESULTS, REBUILD_DEBOUNCE_MS,
  MEMORY_FILENAME, STATUS_FILENAME,
} from './utils/constants.mjs';

export class MemorySearch {
  /**
   * @param {string} rootDir - Root directory for memory storage
   * @param {Object} [options]
   * @param {Function} [options.llmSearch] - LLM reranking function: async (prompt) => string
   * @param {string} [options.deptPath='departments'] - Subdirectory for departments
   * @param {string} [options.globalDir='_global'] - Global memory directory name
   * @param {number} [options.chunkSize=300]
   * @param {number} [options.chunkOverlap=50]
   * @param {number} [options.maxResults=10]
   * @param {boolean} [options.watchFiles=true]
   */
  constructor(rootDir, options = {}) {
    this._rootDir = rootDir;
    this._deptPath = options.deptPath || 'departments';
    this._globalDir = options.globalDir || '_global';
    this._llmSearchFn = options.llmSearch || null;
    this._chunkSize = options.chunkSize || CHUNK_SIZE;
    this._chunkOverlap = options.chunkOverlap || CHUNK_OVERLAP;
    this._maxResults = options.maxResults || MAX_SEARCH_RESULTS;
    this._watchFiles = options.watchFiles !== false;

    this._chunks = [];
    this._idf = new Map();
    this._watcher = null;
    this._rebuildTimer = null;
    this._initialized = false;
  }

  /**
   * Initialize: build index and optionally start file watcher.
   */
  init() {
    this._buildIndex();
    if (this._watchFiles) this._startWatcher();
    this._initialized = true;
  }

  /**
   * Stop the search engine (release file watcher).
   */
  stop() {
    if (this._watcher) {
      this._watcher.close();
      this._watcher = null;
    }
    if (this._rebuildTimer) {
      clearTimeout(this._rebuildTimer);
      this._rebuildTimer = null;
    }
    this._initialized = false;
  }

  /**
   * Search memory with keyword, semantic, or hybrid mode.
   * @param {string} queryText
   * @param {Object} [options]
   * @param {string} [options.deptId] - Filter by department
   * @param {number} [options.limit]
   * @param {'keyword'|'semantic'|'hybrid'} [options.mode='hybrid']
   * @returns {Promise<Array<{id, deptId, source, text, score, method}>>}
   */
  async query(queryText, { deptId = null, limit = this._maxResults, mode = 'hybrid' } = {}) {
    if (!this._initialized || !queryText || !queryText.trim()) return [];

    let results = [];

    if (mode === 'keyword' || mode === 'hybrid') {
      results.push(...this._tfidfSearch(queryText, deptId, limit));
    }

    if ((mode === 'semantic' || mode === 'hybrid') && this._llmSearchFn) {
      const semanticResults = await this._llmSearch(queryText, deptId, Math.min(limit, 5));
      for (const sr of semanticResults) {
        const existing = results.find(r => r.id === sr.id);
        if (existing) {
          existing.score = Math.max(existing.score, sr.score);
          existing.method = 'hybrid';
        } else {
          results.push(sr);
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Get formatted relevant memory for LLM prompt injection.
   * @param {string} queryText
   * @param {string} [deptId]
   * @param {Object} [options]
   * @param {number} [options.maxChars=1500]
   * @returns {Promise<string>}
   */
  async getRelevant(queryText, deptId = null, { maxChars = 1500 } = {}) {
    if (!this._initialized) return '';
    const results = await this.query(queryText, { deptId, limit: 5, mode: 'keyword' });
    if (results.length === 0) return '';

    let combined = '\n## Relevant Memory (retrieved)\n';
    let totalLen = combined.length;

    for (const r of results) {
      const entry = `\n### [${r.source}] (score: ${r.score})\n${r.text}\n`;
      if (totalLen + entry.length > maxChars) break;
      combined += entry;
      totalLen += entry.length;
    }

    return combined;
  }

  /**
   * Manually rebuild the index.
   */
  rebuild() {
    this._buildIndex();
  }

  /**
   * Get engine status.
   */
  status() {
    return {
      initialized: this._initialized,
      totalChunks: this._chunks.length,
      totalTerms: this._idf.size,
      llmEnabled: !!this._llmSearchFn,
      departments: [...new Set(this._chunks.map(c => c.deptId))],
    };
  }

  // ==================== Internal ====================

  _scanFiles() {
    const files = [];
    const deptDir = join(this._rootDir, this._deptPath);

    if (existsSync(deptDir)) {
      for (const deptId of readdirSync(deptDir)) {
        const deptPath = join(deptDir, deptId);
        if (!statSync(deptPath).isDirectory()) continue;

        for (const filename of [MEMORY_FILENAME, STATUS_FILENAME, 'LEARNED.md']) {
          const filePath = join(deptPath, filename);
          if (existsSync(filePath)) {
            try {
              const content = readFileSync(filePath, 'utf8').trim();
              if (content) files.push({ deptId, source: filename, path: filePath, content });
            } catch { /* skip */ }
          }
        }
      }
    }

    // Global memory directory
    const globalDir = join(this._rootDir, this._globalDir);
    if (existsSync(globalDir)) {
      for (const filename of readdirSync(globalDir)) {
        if (!filename.endsWith('.md')) continue;
        const filePath = join(globalDir, filename);
        try {
          if (statSync(filePath).isFile()) {
            const content = readFileSync(filePath, 'utf8').trim();
            if (content && content.length > 10) {
              files.push({ deptId: '_global', source: filename, path: filePath, content });
            }
          }
        } catch { /* skip */ }
      }
    }

    return files;
  }

  _chunkText(text, deptId, source) {
    const chunks = [];
    const lines = text.split('\n');
    let current = '';
    let chunkIdx = 0;

    for (const line of lines) {
      if (line.startsWith('#') && current.length > 50) {
        chunks.push(this._makeChunk(current.trim(), deptId, source, chunkIdx++));
        current = line + '\n';
      } else {
        current += line + '\n';
        if (current.length >= this._chunkSize) {
          chunks.push(this._makeChunk(current.trim(), deptId, source, chunkIdx++));
          const overlapStart = Math.max(0, current.length - this._chunkOverlap);
          current = current.substring(overlapStart);
        }
      }
    }

    if (current.trim().length > 10) {
      chunks.push(this._makeChunk(current.trim(), deptId, source, chunkIdx));
    }

    return chunks;
  }

  _makeChunk(text, deptId, source, idx) {
    const tokens = tokenize(text);
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);

    const maxFreq = Math.max(...tf.values(), 1);
    for (const [k, v] of tf) tf.set(k, v / maxFreq);

    return { id: `${deptId}/${source}#${idx}`, deptId, source, text, tokens, tf };
  }

  _buildIndex() {
    const files = this._scanFiles();
    this._chunks = [];

    for (const file of files) {
      this._chunks.push(...this._chunkText(file.content, file.deptId, file.source));
    }

    // Compute IDF
    this._idf = new Map();
    const N = this._chunks.length || 1;
    const dfMap = new Map();

    for (const chunk of this._chunks) {
      const seenTokens = new Set(chunk.tokens);
      for (const t of seenTokens) dfMap.set(t, (dfMap.get(t) || 0) + 1);
    }

    for (const [term, df] of dfMap) {
      this._idf.set(term, Math.log(1 + N / df));
    }
  }

  _tfidfSearch(queryText, deptId, limit) {
    const queryTokens = tokenize(queryText);
    if (queryTokens.length === 0) return [];

    const scores = [];
    for (const chunk of this._chunks) {
      if (deptId && chunk.deptId !== deptId && chunk.deptId !== '_global') continue;

      let score = 0;
      for (const qt of queryTokens) {
        const tf = chunk.tf.get(qt) || 0;
        const idf = this._idf.get(qt) || 0;
        score += tf * idf;
      }

      if (score > 0) scores.push({ chunk, score });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit).map(s => ({
      id: s.chunk.id,
      deptId: s.chunk.deptId,
      source: s.chunk.source,
      text: s.chunk.text,
      score: Math.round(s.score * 100) / 100,
      method: 'tfidf',
    }));
  }

  async _llmSearch(queryText, deptId, limit) {
    const candidates = this._tfidfSearch(queryText, deptId, 20);
    if (candidates.length === 0) return [];

    const candidateTexts = candidates.map((c, i) =>
      `[${i + 1}] (${c.source}) ${c.text.slice(0, 200)}`
    ).join('\n\n');

    const prompt = `You are a memory retrieval assistant. The user query is: "${queryText}"

Below are ${candidates.length} candidate memory chunks. Select the ${limit} most relevant ones, ranked by relevance.
Return ONLY the numbers, comma-separated. Example: 3,1,7

Candidates:
${candidateTexts}

Most relevant numbers:`;

    try {
      const response = await this._llmSearchFn(prompt);
      if (!response) return candidates.slice(0, limit);

      const nums = response.match(/\d+/g);
      if (!nums) return candidates.slice(0, limit);

      const reranked = [];
      for (const n of nums) {
        const idx = parseInt(n, 10) - 1;
        if (idx >= 0 && idx < candidates.length) {
          const c = candidates[idx];
          c.method = 'llm-rerank';
          c.score = (limit - reranked.length) / limit;
          reranked.push(c);
        }
        if (reranked.length >= limit) break;
      }

      return reranked;
    } catch {
      return candidates.slice(0, limit);
    }
  }

  _startWatcher() {
    const deptDir = join(this._rootDir, this._deptPath);
    if (!existsSync(deptDir)) return;

    try {
      this._watcher = watch(deptDir, { recursive: true }, (event, filename) => {
        if (!filename || !filename.endsWith('.md')) return;
        if (this._rebuildTimer) clearTimeout(this._rebuildTimer);
        this._rebuildTimer = setTimeout(() => this._buildIndex(), REBUILD_DEBOUNCE_MS);
      });
      this._watcher.on('error', () => {});
    } catch { /* watch not supported on this platform */ }
  }
}
