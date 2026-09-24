// Programmatic verification that a quoted fragment really occurs in the analyzed text.
// Matching is exact after normalizing whitespace, typographic quotes, dashes and table pipes.
// A quote may contain an ellipsis ("..." or "…"); then every part must occur, in order.

export interface QuoteLocation {
  found: boolean;
  start: number; // offset in the original (non-normalized) text
  end: number;
  ambiguous: boolean; // the fragment occurs more than once; the first occurrence is used
  reason: string | null;
}

interface NormalizedText {
  norm: string;
  map: number[]; // map[i] = index in original text of normalized char i
}

const MIN_PART_LENGTH = 8;

function normChar(ch: string): string {
  switch (ch) {
    case '‘':
    case '’':
    case '‚':
    case '′':
      return "'";
    case '“':
    case '”':
    case '„':
    case '″':
      return '"';
    case '‐':
    case '‑':
    case '‒':
    case '–':
    case '—':
    case '―':
    case '−':
      return '-';
    case '×':
      return 'x';
    case '|':
      return ' ';
    default:
      return ch;
  }
}

function isSpace(ch: string): boolean {
  return /\s/.test(ch) || ch === ' ';
}

export function normalize(text: string): NormalizedText {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  let spaceIndex = 0;
  for (let i = 0; i < text.length; i++) {
    const c = normChar(text[i]);
    if (isSpace(c)) {
      if (!pendingSpace) spaceIndex = i;
      pendingSpace = true;
      continue;
    }
    if (pendingSpace && chars.length > 0) {
      chars.push(' ');
      map.push(spaceIndex);
    }
    pendingSpace = false;
    chars.push(c);
    map.push(i);
  }
  return { norm: chars.join(''), map };
}

export function normalizeForCompare(text: string): string {
  return normalize(text).norm;
}

const cache = new Map<string, NormalizedText>();

function normalizedCached(text: string): NormalizedText {
  const hit = cache.get(text);
  if (hit) return hit;
  const n = normalize(text);
  if (cache.size > 20) cache.clear();
  cache.set(text, n);
  return n;
}

function splitOnEllipsis(quote: string): string[] {
  return quote
    .split(/\s*(?:\.\.\.|…|\[\.\.\.\])\s*/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function stripWrappingQuotes(q: string): string {
  const t = q.trim();
  const m = /^["'“‘](.*)["'”’]$/s.exec(t);
  return m ? m[1] : t;
}

export function locateQuote(text: string, quote: string | null | undefined): QuoteLocation {
  const none = (reason: string): QuoteLocation => ({ found: false, start: -1, end: -1, ambiguous: false, reason });
  if (!quote || !quote.trim()) return none('No quotation supplied.');
  const { norm, map } = normalizedCached(text);
  const parts = splitOnEllipsis(stripWrappingQuotes(quote)).map((p) => normalize(p).norm);
  if (parts.length === 0) return none('Empty quotation.');
  if (parts.some((p) => p.length < MIN_PART_LENGTH)) return none('Quotation too short to verify reliably.');

  let cursor = 0;
  let firstStart = -1;
  let lastEnd = -1;
  let ambiguous = false;
  for (let i = 0; i < parts.length; i++) {
    const idx = norm.indexOf(parts[i], cursor);
    if (idx < 0) {
      return none(
        parts.length > 1
          ? 'One part of the quotation was not found in the analyzed text.'
          : 'The quotation was not found in the analyzed text.',
      );
    }
    if (i === 0) {
      firstStart = idx;
      if (parts.length === 1 && norm.indexOf(parts[i], idx + 1) >= 0) ambiguous = true;
    }
    lastEnd = idx + parts[i].length;
    cursor = lastEnd;
  }
  const start = map[firstStart];
  const end = map[lastEnd - 1] + 1;
  return { found: true, start, end, ambiguous, reason: null };
}

// Simple non-cryptographic content hash (FNV-1a, 32-bit, hex) used to detect edits after analysis.
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0') + ':' + text.length.toString(36);
}
