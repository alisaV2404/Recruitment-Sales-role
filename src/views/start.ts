import * as app from '../app.js';
import { state } from '../app.js';
import { fmtDate, h } from '../dom.js';
import { draftInput } from './common.js';

function fileInput() {
  return h('input', {
    type: 'file',
    id: 'file-input',
    class: 'visually-hidden',
    accept: '.txt,.md,.pdf,.json,text/plain,application/pdf,application/json',
    onchange: (e: Event) => {
      const input = e.target as HTMLInputElement;
      const f = input.files?.[0];
      input.value = '';
      if (f) void app.startFile(f);
    },
  });
}

function dropZone() {
  const loading = state.ui.loadingFile;
  return h(
    'label',
    {
      class: 'dropzone',
      for: 'file-input',
      ondragover: (e: DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.add('over');
      },
      ondragleave: (e: DragEvent) => (e.currentTarget as HTMLElement).classList.remove('over'),
      ondrop: (e: DragEvent) => {
        e.preventDefault();
        (e.currentTarget as HTMLElement).classList.remove('over');
        const f = e.dataTransfer?.files?.[0];
        if (f) void app.startFile(f);
      },
    },
    fileInput(),
    loading
      ? h('span', null, h('span', { class: 'spinner' }), ` Reading ${loading}…`)
      : [
          h('strong', null, 'Upload a report'),
          h('span', { class: 'small' }, 'TXT or PDF (text-based). A saved review (JSON) can be imported here too.'),
          h('span', { class: 'btn btn-small' }, 'Choose file'),
        ],
  );
}

function modeCard() {
  const st = state.status;
  if (!st) return h('div', { class: 'mode-card' }, h('span', { class: 'spinner' }), ' Checking whether Live AI is available…');
  if (st.live) {
    return h(
      'div',
      { class: 'mode-card live' },
      h('strong', null, 'Live AI is connected. '),
      `Reports you upload or paste are analyzed by ${st.model}. The text is sent to the server for analysis only when you press “Analyze report”.`,
    );
  }
  return h(
    'div',
    { class: 'mode-card demo' },
    h('strong', null, 'Demo mode · Preloaded analysis. '),
    'Live AI is not configured on this server',
    st.reason ? ` (${st.reason})` : '',
    '. The three demo reports open with prepared, clearly labelled analyses. You can still load and read your own document, but it cannot be analyzed until a model key is configured.',
  );
}

export function startView() {
  const saved = state.saved;
  return h(
    'main',
    { class: 'start' },
    h(
      'section',
      { class: 'intro' },
      h('h1', null, 'Ask better questions about an appraisal.'),
      h(
        'p',
        { class: 'lede' },
        'Second Look reads an art appraisal report, follows its reasoning from data to conclusion, and drafts specific questions for its author — each tied to an exact quotation. You add the appraiser’s answers; it helps you see what they explain and what is still open.',
      ),
      h(
        'p',
        { class: 'small muted' },
        'It does not judge authenticity, set a value, or rate the appraiser. Nothing is sent to anyone: you copy or export the questions yourself.',
      ),
      modeCard(),
    ),
    state.ui.startError ? h('div', { class: 'error-box', role: 'alert' }, state.ui.startError) : null,
    h(
      'div',
      { class: 'start-grid' },
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Your report'),
        dropZone(),
        h('div', { class: 'or' }, h('span', null, 'or paste the text')),
        h('label', { class: 'field-label', for: 'paste-title' }, 'Title (optional)'),
        draftInput('paste-title', { id: 'paste-title', type: 'text', placeholder: 'e.g. Valuation of a landscape, March 2026' }),
        h('label', { class: 'field-label', for: 'paste-text' }, 'Report text'),
        draftInput('paste-text', { id: 'paste-text', rows: 9, placeholder: 'Paste the full text of the appraisal report, including tables and appendices…' }, true),
        h(
          'div',
          { class: 'row end' },
          h(
            'button',
            {
              class: 'btn btn-primary',
              onclick: () => app.startPaste(app.drafts.get('paste-title') ?? '', app.drafts.get('paste-text') ?? ''),
            },
            'Review text →',
          ),
        ),
      ),
      h(
        'section',
        { class: 'card' },
        h('h2', null, 'Demo reports ', h('span', { class: 'tag' }, 'Fictional')),
        h('p', { class: 'small muted' }, 'Invented works, people, firms and figures, written to show how the review works.'),
        ...app.DEMO_REPORTS.map((d, i) =>
          h(
            'article',
            { class: 'demo-item', key: d.id },
            h('div', { class: 'demo-num' }, String(i + 1)),
            h(
              'div',
              null,
              h('h3', null, d.title),
              h('p', { class: 'small muted' }, d.blurb),
              h('p', { class: 'small' }, d.focus),
            ),
            h('button', { class: 'btn btn-small', onclick: () => app.startDemo(d.id) }, 'Open'),
          ),
        ),
      ),
    ),
    saved.length
      ? h(
          'section',
          { class: 'card saved' },
          h('h2', null, 'Saved on this device'),
          h(
            'ul',
            { class: 'saved-list' },
            ...saved.map((e) =>
              h(
                'li',
                { key: e.id },
                h(
                  'div',
                  null,
                  h('strong', null, e.title),
                  h('span', { class: 'small muted' }, ` · ${e.kind === 'demo' ? 'Demo' : 'Your document'} · ${e.questions} question(s) · updated ${fmtDate(e.updatedAt)}`),
                ),
                h(
                  'div',
                  { class: 'row' },
                  h('button', { class: 'btn btn-small', onclick: () => app.openSaved(e.id) }, 'Open'),
                  h('button', { class: 'btn btn-small btn-ghost', onclick: () => app.deleteSaved(e.id, e.title) }, 'Delete'),
                ),
              ),
            ),
          ),
        )
      : null,
  );
}
