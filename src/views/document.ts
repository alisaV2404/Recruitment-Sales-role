// Renders report text line by line with highlighted, clickable quotation ranges.

import { h } from '../dom.js';
import { structureOf } from '../model.js';
import type { Line } from '../sections.js';

export interface Highlight {
  start: number;
  end: number;
  qid: string;
  idx: number;
  kind: 'question' | 'contradiction' | 'partial';
}

function segments(a: number, b: number, text: string, base: number, hls: Highlight[], active: string | null, onPick: (qid: string, idx: number) => void) {
  const inRange = hls.filter((x) => x.start < b && x.end > a);
  if (!inRange.length) return [text.slice(a - base, b - base)];
  const points = new Set<number>([a, b]);
  for (const x of inRange) {
    if (x.start > a && x.start < b) points.add(x.start);
    if (x.end > a && x.end < b) points.add(x.end);
  }
  const sorted = [...points].sort((p, q) => p - q);
  const out: (HTMLElement | string)[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const s = sorted[i];
    const e = sorted[i + 1];
    const chunk = text.slice(s - base, e - base);
    const cover = inRange.filter((x) => x.start <= s && x.end >= e);
    if (!cover.length) {
      out.push(chunk);
      continue;
    }
    const isActive = cover.some((x) => x.qid === active);
    const primary = cover.find((x) => x.qid === active) ?? cover.find((x) => x.kind === 'contradiction') ?? cover[0];
    const anchor = cover.find((x) => x.start === s);
    const cls = ['hl', `hl-${primary.kind}`, isActive ? 'hl-active' : ''].join(' ');
    out.push(
      h(
        'mark',
        {
          class: cls,
          'data-hl': anchor ? `${anchor.qid}-${anchor.idx}` : undefined,
          title: `Linked to question ${cover.map((c) => c.qid.replace('q', '#')).join(', ')}`,
          onclick: () => onPick(primary.qid, primary.idx),
        },
        chunk,
      ),
    );
  }
  return out;
}

function tableBlock(rows: Line[], text: string, hls: Highlight[], active: string | null, onPick: (qid: string, idx: number) => void) {
  const trs = rows.map((ln, r) => {
    const pipes: number[] = [];
    for (let i = 0; i < ln.text.length; i++) if (ln.text[i] === '|') pipes.push(i);
    const cells: HTMLElement[] = [];
    for (let c = 0; c < pipes.length - 1; c++) {
      const a = ln.start + pipes[c] + 1;
      const b = ln.start + pipes[c + 1];
      cells.push(h(r === 0 ? 'th' : 'td', null, ...segments(a, b, text, 0, hls, active, onPick)));
    }
    return h('tr', null, ...cells);
  });
  return h('div', { class: 'doc-table-wrap' }, h('table', { class: 'doc-table' }, h('tbody', null, ...trs)));
}

export function documentBody(text: string, hls: Highlight[], active: string | null, onPick: (qid: string, idx: number) => void) {
  const st = structureOf(text);
  const blocks: HTMLElement[] = [];
  const lines = st.lines;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (ln.kind === 'table') {
      const rows = [ln];
      while (i + 1 < lines.length && lines[i + 1].kind === 'table') rows.push(lines[++i]);
      blocks.push(tableBlock(rows, text, hls, active, onPick));
      continue;
    }
    if (ln.kind === 'page') {
      blocks.push(h('div', { class: 'doc-page', id: `page-${ln.page}` }, h('span', null, `Page ${ln.page}`)));
      continue;
    }
    if (ln.kind === 'blank') {
      blocks.push(h('div', { class: 'doc-gap' }));
      continue;
    }
    blocks.push(
      h(
        'div',
        { class: ln.kind === 'heading' ? 'doc-heading' : 'doc-line', id: ln.kind === 'heading' ? `sec-${ln.index}` : undefined },
        ...segments(ln.start, ln.end, text, 0, hls, active, onPick),
      ),
    );
  }
  return h('div', { class: 'doc-body' }, ...blocks);
}

export function sectionNav(text: string) {
  const st = structureOf(text);
  if (!st.sections.length) return h('p', { class: 'small muted nav-empty' }, 'No section headings detected.');
  return h(
    'ol',
    { class: 'sec-nav' },
    ...st.sections.map((s) =>
      h(
        'li',
        null,
        h(
          'button',
          {
            class: 'link',
            onclick: () => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
          },
          s.title.length > 48 ? s.title.slice(0, 46) + '…' : s.title,
        ),
      ),
    ),
  );
}
