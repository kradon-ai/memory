/**
 * @kradon/memory — Default configuration constants
 */

export const CHUNK_SIZE = 300;
export const CHUNK_OVERLAP = 50;
export const MAX_SEARCH_RESULTS = 10;
export const REBUILD_DEBOUNCE_MS = 3000;

export const STALE_AFTER_DAYS = 90;
export const ARCHIVE_AFTER_DAYS = 180;

export const WEEK_THRESHOLD_DAYS = 7;
export const ARCHIVE_THRESHOLD_DAYS = 30;

export const INDEX_START = '<!-- SKILL_INDEX_START -->';
export const INDEX_END = '<!-- SKILL_INDEX_END -->';
export const ARCHIVE_START = '<!-- ARCHIVE_START -->';
export const ARCHIVE_END = '<!-- ARCHIVE_END -->';

export const MEMORY_FILENAME = 'MEMORY.md';
export const STATUS_FILENAME = 'STATUS.md';
export const SESSIONS_DIR = 'sessions';
export const ARCHIVE_DIR = 'archive';
