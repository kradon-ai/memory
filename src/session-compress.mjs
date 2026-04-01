/**
 * @kradon/memory — SessionCompressor
 *
 * Compresses session journals over time:
 *   - 7+ days old daily files → weekly summaries
 *   - 30+ days old weekly summaries → archive/
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { SESSIONS_DIR, ARCHIVE_DIR, WEEK_THRESHOLD_DAYS, ARCHIVE_THRESHOLD_DAYS } from './utils/constants.mjs';

export class SessionCompressor {
  /**
   * @param {string} rootDir - Root directory for memory storage
   * @param {Object} [options]
   * @param {string} [options.deptPath='departments']
   */
  constructor(rootDir, options = {}) {
    this._rootDir = rootDir;
    this._deptPath = options.deptPath || 'departments';
  }

  /**
   * Compress sessions for a given department/namespace.
   * @param {string} deptId
   * @param {Object} [options]
   * @param {number} [options.weekThresholdDays=7]
   * @param {number} [options.archiveThresholdDays=30]
   * @returns {{ weeksCreated: number, weeksArchived: number, newWeekFiles: string[] }}
   */
  compress(deptId, options = {}) {
    const weekThreshold = (options.weekThresholdDays ?? WEEK_THRESHOLD_DAYS) * 24 * 3600 * 1000;
    const archiveThreshold = (options.archiveThresholdDays ?? ARCHIVE_THRESHOLD_DAYS) * 24 * 3600 * 1000;

    const sessionsDir = join(this._rootDir, this._deptPath, deptId, SESSIONS_DIR);
    if (!existsSync(sessionsDir)) return { weeksCreated: 0, weeksArchived: 0, newWeekFiles: [] };

    const now = new Date();
    const dailyRe = /^(\d{4}-\d{2}-\d{2})-[a-zA-Z0-9]+\.md$/;
    const weeklyRe = /^week-(\d{4}-W\d{2})\.md$/;

    let files;
    try { files = readdirSync(sessionsDir); } catch { return { weeksCreated: 0, weeksArchived: 0, newWeekFiles: [] }; }

    // Step 1: Daily files past threshold → weekly summaries
    const weekBuckets = {};
    for (const file of files) {
      const m = file.match(dailyRe);
      if (!m) continue;
      const fileDate = new Date(m[1]);
      if (now - fileDate < weekThreshold) continue;

      const weekKey = this._getWeekKey(fileDate);
      if (!weekBuckets[weekKey]) weekBuckets[weekKey] = [];
      try {
        const content = readFileSync(join(sessionsDir, file), 'utf8').trim();
        const body = content.replace(/^---[\s\S]*?---\n?/, '').trim();
        weekBuckets[weekKey].push({ filename: file, body });
      } catch { /* skip corrupted */ }
    }

    let weeksCreated = 0;
    const newWeekFiles = [];
    for (const [weekKey, sessions] of Object.entries(weekBuckets)) {
      const weekFilename = `week-${weekKey}.md`;
      const weekFile = join(sessionsDir, weekFilename);
      if (!existsSync(weekFile)) {
        const combined = sessions.map(s => `### ${s.filename.replace('.md', '')}\n${s.body}`).join('\n\n---\n\n');
        writeFileSync(weekFile, `# Weekly Summary: ${weekKey}\n\n${combined}\n`, 'utf8');
        weeksCreated++;
        newWeekFiles.push(weekFilename);
      }
      // Clean up daily files regardless
      for (const s of sessions) {
        try { unlinkSync(join(sessionsDir, s.filename)); } catch { /* silent */ }
      }
    }

    // Step 2: Weekly files past archive threshold → archive/
    let weeksArchived = 0;
    const archiveDir = join(sessionsDir, ARCHIVE_DIR);

    for (const file of files) {
      const m = file.match(weeklyRe);
      if (!m) continue;

      const [year, week] = m[1].split('-W').map(Number);
      const jan4 = new Date(Date.UTC(year, 0, 4));
      const weekStart = new Date(jan4.getTime() - ((jan4.getUTCDay() || 7) - 1) * 86400000 + (week - 1) * 7 * 86400000);
      if (now - weekStart < archiveThreshold) continue;

      try {
        const content = readFileSync(join(sessionsDir, file), 'utf8').trim();
        mkdirSync(archiveDir, { recursive: true });
        writeFileSync(join(archiveDir, file), content, 'utf8');
        try { unlinkSync(join(sessionsDir, file)); } catch { /* silent */ }
        weeksArchived++;
      } catch { /* silent */ }
    }

    return { weeksCreated, weeksArchived, newWeekFiles };
  }

  _getWeekKey(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
  }
}
