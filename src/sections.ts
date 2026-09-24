// Structure detection for report text: headings (for navigation), page markers and tables.
// Page numbers are only reported when the text itself carries page markers.

export type LineKind = 'heading' | 'page' | 'table' | 'blank' | 'text';

export interface Line {
  index: number;
  start: number;
  end: number;
  text: string;
  kind: LineKind;
  page: number | null;
}

export interface Section {
  id: string;
  title: string;
  start: number;
  page: number | null;
}

export interface DocStructure {
  lines: Line[];
  sections: Section[];
  hasPages: boolean;
  pageCount: number;
}

const PAGE_RE = /^\s*-{2,}\s*Page\s+(\d+)\s*-{2,}\s*$/i;
const TABLE_RE = /^\s*\|.*\|\s*$/;

export function isHeading(line: string): boolean {
  const t = line.trim();
  if (t.length < 3 || t.length > 90) return false;
  if (/^(APPENDIX|Appendix|ANNEX|Annex|SCHEDULE|Schedule|EXHIBIT|Exhibit)\b/.test(t) && t.length <= 90) return true;
  if (/^(SECTION|Section)\s+\d+/.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 4 && letters === letters.toUpperCase() && !/[.:;,]$/.test(t)) return true;
  if (/^\d+(\.\d+)*\.?\s+[A-Z][^.!?]{2,70}$/.test(t) && !/[.:;,]$/.test(t)) return true;
  return false;
}

export function analyzeStructure(text: string): DocStructure {
  const lines: Line[] = [];
  const sections: Section[] = [];
  let pos = 0;
  let page: number | null = null;
  let maxPage = 0;
  const raw = text.split('\n');
  raw.forEach((ln, i) => {
    const start = pos;
    const end = pos + ln.length;
    pos = end + 1;
    let kind: LineKind = 'text';
    const pm = PAGE_RE.exec(ln);
    if (pm) {
      page = parseInt(pm[1], 10);
      maxPage = Math.max(maxPage, page);
      kind = 'page';
    } else if (!ln.trim()) kind = 'blank';
    else if (TABLE_RE.test(ln)) kind = 'table';
    else if (isHeading(ln)) kind = 'heading';
    lines.push({ index: i, start, end, text: ln, kind, page });
    if (kind === 'heading') sections.push({ id: `sec-${i}`, title: ln.trim(), start, page });
  });
  return { lines, sections, hasPages: maxPage > 0, pageCount: maxPage };
}

export function sectionAt(structure: DocStructure, offset: number): Section | null {
  let found: Section | null = null;
  for (const s of structure.sections) {
    if (s.start <= offset) found = s;
    else break;
  }
  return found;
}

export function pageAt(structure: DocStructure, offset: number): number | null {
  if (!structure.hasPages) return null;
  let page: number | null = null;
  for (const l of structure.lines) {
    if (l.start > offset) break;
    if (l.kind === 'page') page = l.page;
  }
  return page;
}

export function textStats(text: string) {
  const words = (text.match(/\S+/g) ?? []).length;
  const lines = text ? text.split('\n').length : 0;
  return { chars: text.length, words, lines };
}
