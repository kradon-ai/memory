/**
 * @kradon/memory — Chinese + English hybrid tokenizer
 *
 * Zero-dependency tokenizer optimized for knowledge retrieval.
 * Chinese: unigram + bigram (no external NLP library needed).
 * English: whitespace split + lowercase.
 */

const PUNCT_RE = /[，。！？；：""''【】《》（）\[\]{}.,!?;:"'()\-_=+|\\/<>@#$%^&*~`\n\r\t]/g;

/**
 * Tokenize text into searchable terms.
 * @param {string} text - Input text
 * @returns {string[]} Array of tokens
 */
export function tokenize(text) {
  if (!text) return [];

  const tokens = [];
  const segments = text.toLowerCase()
    .replace(PUNCT_RE, ' ')
    .split(/\s+/)
    .filter(s => s.length > 0);

  for (const seg of segments) {
    // English words: keep as-is
    if (/^[a-z0-9]+$/i.test(seg)) {
      if (seg.length >= 2) tokens.push(seg);
      continue;
    }

    // Chinese: unigram + bigram
    const chars = [...seg];
    for (let i = 0; i < chars.length; i++) {
      if (chars[i].length > 0) tokens.push(chars[i]);
      if (i + 1 < chars.length) tokens.push(chars[i] + chars[i + 1]);
    }
  }

  return tokens;
}
