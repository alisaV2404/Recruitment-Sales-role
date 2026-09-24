import * as app from '../app.js';
import { state } from '../app.js';
import { h } from '../dom.js';
import { counts } from '../model.js';
import { summaryBody } from '../summary.js';

function importButton() {
  return h(
    'label',
    { class: 'btn btn-small btn-ghost', for: 'import-json' },
    'Import review (JSON)',
    h('input', {
      id: 'import-json',
      type: 'file',
      accept: '.json,application/json',
      class: 'visually-hidden',
      onchange: (e: Event) => {
        const input = e.target as HTMLInputElement;
        const f = input.files?.[0];
        input.value = '';
        if (f) void app.importJson(f).then(() => state.ui.startError && app.toast(state.ui.startError));
      },
    }),
  );
}

export function summaryView() {
  const s = state.session!;
  const c = counts(s.analysis);
  return h(
    'main',
    { class: 'summary' },
    h(
      'div',
      { class: 'summary-actions no-print' },
      h(
        'div',
        null,
        h('h1', null, 'Review summary'),
        h('p', { class: 'small muted' }, `${c.included} question(s) included · ${c.open} open · ${c.resolved} resolved. Choose questions with “Include in summary” on each card.`),
      ),
      h(
        'div',
        { class: 'row wrap' },
        h('button', { class: 'btn btn-small', onclick: () => app.go('workspace') }, '← Back to questions'),
        h('button', { class: 'btn btn-small btn-primary', onclick: () => void app.copyQuestions() }, 'Copy questions'),
        h('button', { class: 'btn btn-small', onclick: () => app.downloadSummary() }, 'Download HTML'),
        h('button', { class: 'btn btn-small', onclick: () => app.printSummary() }, 'Print'),
        h('button', { class: 'btn btn-small', onclick: () => app.exportJson() }, 'Export review (JSON)'),
        importButton(),
      ),
    ),
    h('article', { class: 'summary-doc', html: summaryBody(s) }),
  );
}
