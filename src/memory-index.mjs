/**
 * @kradon/memory — MemoryIndex
 *
 * Knowledge index management: CRUD operations on MEMORY.md INDEX block.
 * Auto-dedup, confidence scoring, hit tracking.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parseIndex, serializeIndex, replaceIndexBlock, hasIndexBlock, calcConfidence } from './index-parser.mjs';
import { INDEX_START, INDEX_END, MEMORY_FILENAME } from './utils/constants.mjs';

export class MemoryIndex {
  /**
   * @param {string} rootDir - Root directory for memory storage
   * @param {Object} [options]
   * @param {string} [options.deptPath='departments'] - Subdirectory name for departments/namespaces
   */
  constructor(rootDir, options = {}) {
    this._rootDir = rootDir;
    this._deptPath = options.deptPath || 'departments';
  }

  /**
   * Get path to a department's directory.
   * @param {string} deptId
   * @returns {string}
   */
  _getDeptDir(deptId) {
    return join(this._rootDir, this._deptPath, deptId);
  }

  /**
   * Get path to a department's MEMORY.md.
   * @param {string} deptId
   * @returns {string}
   */
  _getMemoryPath(deptId) {
    return join(this._getDeptDir(deptId), MEMORY_FILENAME);
  }

  /**
   * Read MEMORY.md content, returning empty string if not exists.
   * @param {string} deptId
   * @returns {string}
   */
  _readMemory(deptId) {
    const memPath = this._getMemoryPath(deptId);
    if (!existsSync(memPath)) return '';
    return readFileSync(memPath, 'utf8');
  }

  /**
   * Write MEMORY.md, creating directories if needed.
   * @param {string} deptId
   * @param {string} content
   */
  _writeMemory(deptId, content) {
    const deptDir = this._getDeptDir(deptId);
    if (!existsSync(deptDir)) mkdirSync(deptDir, { recursive: true });
    writeFileSync(this._getMemoryPath(deptId), content, 'utf8');
  }

  /**
   * Initialize a new MEMORY.md with empty INDEX block.
   * @param {string} deptId
   * @param {Map} [entries] - Optional initial entries
   */
  _initMemoryFile(deptId, entries = new Map()) {
    const indexBlock = `${INDEX_START}\n${serializeIndex(entries)}\n${INDEX_END}`;
    const content = `# ${deptId} · Memory\n\n${indexBlock}\n\n---\n\n## Details\n`;
    this._writeMemory(deptId, content);
  }

  /**
   * Write or update knowledge entries. Auto-deduplicates by id.
   * @param {string} deptId - Department/namespace ID
   * @param {Array<{id: string, desc: string, tags?: string}>} newEntries
   * @returns {number} Number of actually new entries added
   */
  update(deptId, newEntries) {
    if (!newEntries || newEntries.length === 0) return 0;

    const today = new Date().toISOString().slice(0, 10);
    let content = this._readMemory(deptId);

    if (hasIndexBlock(content)) {
      const existing = parseIndex(content);
      const toAdd = newEntries.filter(e => !existing.has(e.id));
      if (toAdd.length === 0) return 0;

      for (const e of toAdd) {
        existing.set(e.id, {
          id: e.id,
          desc: e.desc,
          tags: e.tags || '',
          use_count: 1,
          confidence: 'low',
          last_used: today,
        });
      }

      content = replaceIndexBlock(content, existing);
      this._writeMemory(deptId, content);
      return toAdd.length;
    } else {
      // No INDEX block: create new MEMORY.md
      const entries = new Map();
      for (const e of newEntries) {
        entries.set(e.id, {
          id: e.id,
          desc: e.desc,
          tags: e.tags || '',
          use_count: 1,
          confidence: 'low',
          last_used: today,
        });
      }

      // Preserve existing content as details section
      const indexBlock = `${INDEX_START}\n${serializeIndex(entries)}\n${INDEX_END}`;
      const detailSection = content
        ? `\n\n---\n\n## Details\n\n${content}`
        : '\n\n---\n\n## Details\n';
      this._writeMemory(deptId, `# ${deptId} · Memory\n\n${indexBlock}${detailSection}`);
      return newEntries.length;
    }
  }

  /**
   * Record a RECALL hit: increment use_count, update confidence and last_used.
   * @param {string} deptId
   * @param {string[]} matchedIds - IDs of entries that were recalled
   */
  recordHit(deptId, matchedIds) {
    if (!matchedIds || matchedIds.length === 0) return;

    const content = this._readMemory(deptId);
    if (!hasIndexBlock(content)) return;

    const entries = parseIndex(content);
    const today = new Date().toISOString().slice(0, 10);
    let changed = false;

    for (const id of matchedIds) {
      if (entries.has(id)) {
        const e = entries.get(id);
        e.use_count = (e.use_count || 1) + 1;
        e.confidence = calcConfidence(e.use_count);
        e.last_used = today;
        changed = true;
      }
    }

    if (changed) {
      this._writeMemory(deptId, replaceIndexBlock(content, entries));
    }
  }

  /**
   * List all entries for a department.
   * @param {string} deptId
   * @returns {Array<{id, desc, tags, use_count, confidence, last_used}>}
   */
  list(deptId) {
    const content = this._readMemory(deptId);
    if (!content) return [];
    const entries = parseIndex(content);
    return [...entries.values()];
  }

  /**
   * Get a single entry by id.
   * @param {string} deptId
   * @param {string} entryId
   * @returns {{id, desc, tags, use_count, confidence, last_used}|null}
   */
  get(deptId, entryId) {
    const content = this._readMemory(deptId);
    if (!content) return null;
    const entries = parseIndex(content);
    return entries.get(entryId) || null;
  }

  /**
   * Remove an entry by id.
   * @param {string} deptId
   * @param {string} entryId
   * @returns {boolean} true if removed, false if not found
   */
  remove(deptId, entryId) {
    const content = this._readMemory(deptId);
    if (!hasIndexBlock(content)) return false;

    const entries = parseIndex(content);
    if (!entries.has(entryId)) return false;

    entries.delete(entryId);
    this._writeMemory(deptId, replaceIndexBlock(content, entries));
    return true;
  }
}
