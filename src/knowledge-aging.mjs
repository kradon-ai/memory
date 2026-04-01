/**
 * @kradon/memory — KnowledgeAging
 *
 * Scans knowledge entries for staleness:
 *   - 90+ days unused → #stale tag
 *   - 180+ days unused → archived (removed from INDEX, moved to ARCHIVE block)
 *   - Recently used stale entries → #stale tag removed
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parseIndex, serializeIndex } from './index-parser.mjs';
import {
  INDEX_START, INDEX_END, ARCHIVE_START, ARCHIVE_END,
  MEMORY_FILENAME, STALE_AFTER_DAYS, ARCHIVE_AFTER_DAYS,
} from './utils/constants.mjs';

export class KnowledgeAging {
  /**
   * @param {string} rootDir
   * @param {Object} [options]
   * @param {string} [options.deptPath='departments']
   */
  constructor(rootDir, options = {}) {
    this._rootDir = rootDir;
    this._deptPath = options.deptPath || 'departments';
  }

  /**
   * Scan a single department for stale/archivable entries.
   * @param {string} deptId
   * @param {Object} [options]
   * @param {number} [options.staleAfterDays=90]
   * @param {number} [options.archiveAfterDays=180]
   * @returns {{ staleMarked: number, unstaleMarked: number, archived: number }}
   */
  scan(deptId, options = {}) {
    const staleThreshold = options.staleAfterDays ?? STALE_AFTER_DAYS;
    const archiveThreshold = options.archiveAfterDays ?? ARCHIVE_AFTER_DAYS;
    const result = { staleMarked: 0, unstaleMarked: 0, archived: 0 };

    const memPath = join(this._rootDir, this._deptPath, deptId, MEMORY_FILENAME);
    if (!existsSync(memPath)) return result;

    let content;
    try { content = readFileSync(memPath, 'utf8'); } catch { return result; }
    if (!content.includes(INDEX_START)) return result;

    const entries = parseIndex(content);
    const today = new Date();
    const toArchive = [];

    for (const [id, e] of entries) {
      if (!e.last_used) continue;
      const lastDate = new Date(e.last_used);
      if (isNaN(lastDate.getTime())) continue;
      const daysSince = Math.floor((today - lastDate) / 86400000);

      if (daysSince >= archiveThreshold) {
        toArchive.push(e);
        entries.delete(id);
        result.archived++;
      } else if (daysSince >= staleThreshold) {
        if (!e.tags.includes('#stale')) {
          e.tags = (e.tags.trim() + ' #stale').trim();
          result.staleMarked++;
        }
      } else {
        if (e.tags.includes('#stale')) {
          e.tags = e.tags.replace(/#stale\s*/g, '').trim();
          result.unstaleMarked++;
        }
      }
    }

    // Rewrite INDEX block
    const newBlock = `${INDEX_START}\n${serializeIndex(entries)}\n${INDEX_END}`;
    content = content.replace(
      new RegExp(`${escapeRegExp(INDEX_START)}[\\s\\S]*?${escapeRegExp(INDEX_END)}`),
      newBlock
    );

    // Handle archived entries
    if (toArchive.length > 0) {
      const archiveLines = toArchive.map(e =>
        `- **${e.id}** (archived ${e.last_used}) ${e.desc} ${e.tags}`
      ).join('\n');

      if (content.includes(ARCHIVE_START)) {
        content = content.replace(
          new RegExp(`${escapeRegExp(ARCHIVE_START)}([\\s\\S]*?)${escapeRegExp(ARCHIVE_END)}`),
          (_, body) => `${ARCHIVE_START}${body.trimEnd()}\n${archiveLines}\n${ARCHIVE_END}`
        );
      } else {
        content += `\n\n---\n\n## Archived Knowledge (unused 180+ days)\n\n${ARCHIVE_START}\n${archiveLines}\n${ARCHIVE_END}\n`;
      }
    }

    writeFileSync(memPath, content, 'utf8');
    return result;
  }

  /**
   * Scan all departments.
   * @param {Object} [options] - Same as scan()
   * @returns {Object} Map of deptId → scan results
   */
  scanAll(options = {}) {
    const results = {};
    const deptDir = join(this._rootDir, this._deptPath);
    if (!existsSync(deptDir)) return results;

    for (const deptId of readdirSync(deptDir)) {
      const deptPath = join(deptDir, deptId);
      if (!statSync(deptPath).isDirectory()) continue;
      results[deptId] = this.scan(deptId, options);
    }

    return results;
  }
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
