/**
 * @kradon/memory — MEMORY.md INDEX block parser & serializer
 *
 * Parses the Markdown table between INDEX markers into structured entries,
 * and serializes entries back to Markdown table format.
 */

import { INDEX_START, INDEX_END } from './utils/constants.mjs';

/**
 * Calculate confidence level from use_count.
 * @param {number} useCount
 * @returns {'low'|'medium'|'high'}
 */
export function calcConfidence(useCount) {
  if (useCount >= 5) return 'high';
  if (useCount >= 3) return 'medium';
  return 'low';
}

/**
 * Parse MEMORY.md content, extracting entries from the INDEX block.
 * @param {string} content - Full MEMORY.md content
 * @returns {Map<string, {id: string, desc: string, tags: string, use_count: number, confidence: string, last_used: string}>}
 */
export function parseIndex(content) {
  const entries = new Map();
  const match = content.match(new RegExp(`${escapeRegExp(INDEX_START)}([\\s\\S]*?)${escapeRegExp(INDEX_END)}`));
  if (!match) return entries;

  for (const line of match[1].split('\n')) {
    if (!line.startsWith('|')) continue;
    // Split by | but keep empty cells (don't filter(Boolean) — tags can be empty)
    const raw = line.split('|').map(s => s.trim());
    // Remove leading/trailing empty strings from | borders
    const cells = raw.slice(1, raw.length - 1);
    if (cells.length < 2 || cells[0] === 'id' || /^[-]+$/.test(cells[0])) continue;

    const id = cells[0];
    const desc = cells[1] || '';
    const tags = cells[2] || '';
    const useCount = cells[3] ? parseInt(cells[3]) || 1 : 1;
    const confidence = cells[4] || calcConfidence(useCount);
    const lastUsed = cells[5] || '';

    entries.set(id, { id, desc, tags, use_count: useCount, confidence, last_used: lastUsed });
  }

  return entries;
}

/**
 * Serialize entries Map to INDEX table rows (Markdown).
 * Sorted by confidence (high→low), then by use_count descending.
 * @param {Map} entries
 * @returns {string}
 */
export function serializeIndex(entries) {
  const header = '| id | desc | tags | use_count | confidence | last_used |';
  const sep = '|---|---|---|---|---|---|';
  const order = { high: 3, medium: 2, low: 1 };

  const rows = [...entries.values()]
    .sort((a, b) => {
      const diff = (order[b.confidence] || 1) - (order[a.confidence] || 1);
      return diff !== 0 ? diff : (b.use_count - a.use_count);
    })
    .map(e => `| ${e.id} | ${e.desc} | ${e.tags} | ${e.use_count} | ${e.confidence} | ${e.last_used} |`);

  return [header, sep, ...rows].join('\n');
}

/**
 * Replace the INDEX block in content with new serialized entries.
 * @param {string} content - Full MEMORY.md content
 * @param {Map} entries - Updated entries
 * @returns {string} Updated content
 */
export function replaceIndexBlock(content, entries) {
  const newBlock = `${INDEX_START}\n${serializeIndex(entries)}\n${INDEX_END}`;
  const re = new RegExp(`${escapeRegExp(INDEX_START)}[\\s\\S]*?${escapeRegExp(INDEX_END)}`);
  return content.replace(re, newBlock);
}

/**
 * Check if content contains an INDEX block.
 * @param {string} content
 * @returns {boolean}
 */
export function hasIndexBlock(content) {
  return content.includes(INDEX_START) && content.includes(INDEX_END);
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
