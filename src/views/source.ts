import * as app from '../app.js';
import { state } from '../app.js';
import { fmtDate, h } from '../dom.js';
import { isStale, workingText, workingVersion } from '../model.js';
import { textStats } from '../sections.js';
import { errorBox } from './common.js';

const BAD_CHAR = String.fromCharCode(0xfffd);

const INJECTION_RE =
  /(ignore|disregard|forget)\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\s+(instructions|prompts?)|you are now|system prompt|as an ai (model|assistant)/i;

function checks(text: string, source: { warnings: string[]; emptyPages: number[] }): string[] {
  const w = [...source.warnings];
  const st = textStats(text);
  if (st.chars < 1500) w.push('The text is short for an appraisal report. If sections or appendices are missing, the analysis can only cover what is here.');
  if (INJECTION_RE.test(text)) {
    w.push('The text contains instruction-like phrases (e.g. “ignore previous instructions”). They will be treated as document content, not as commands.');
  }
  if (text.includes(BAD_CHAR) && !w.some((x) => x.includes('could not be decoded'))) w.push('The text contains characters that could not be decoded. Check for recognition errors.');
  return w;
}

function analyzePanel() {
  const s = state.session!;
  const st = state.status;
  const busy = state.ui.analyzing;
  const err = state.ui.analyzeError;
  const version = workingVersion(s);
  const demoAvail = app.demoAnalysisAvailable(s);
  const live = !!st?.live;

  if (busy) {
    const secs = Math.floor((Date.now() - busy.startedAt) / 1000);
    return h(
      'div',
      { class: 'analyze-panel busy', 'aria-live': 'polite' },
      h('div', { class: 'row' }, h('span', { class: 'spinner' }), h('strong', null, ` Analyzing with Live AI — ${secs}s`)),
      h(
        'p',
        { class: 'small muted' },
        'The model reads the whole report, checks sections and appendices against each other and drafts questions. This usually takes one to three minutes.',
      ),
      h('button', { class: 'btn btn-small', onclick: () => app.cancelAnalysis() }, 'Cancel'),
    );
  }

  return h(
    'div',
    { class: 'analyze-panel' },
    h(
      'p',
      { class: 'small' },
      'Analysis will use: ',
      h('strong', null, version === 'corrected' ? 'your corrected text' : 'the original extracted text'),
      ` (${textStats(workingText(s)).chars.toLocaleString('en-US')} characters).`,
    ),
    s.analysis && isStale(s)
      ? h('p', { class: 'small warn-text' }, 'The text has changed since the last analysis. Its questions refer to the earlier version.')
      : null,
    s.analysis && !isStale(s)
      ? h('p', { class: 'small muted' }, `Last analyzed ${fmtDate(s.analysis.createdAt)} (${s.analysis.mode === 'demo' ? 'Demo, preloaded' : 'Live AI'}).`)
      : null,
    err ? errorBox(err, () => app.requestAnalysis('live')) : null,
    h(
      'div',
      { class: 'row wrap' },
      live
        ? h('button', { class: 'btn btn-primary', onclick: () => app.requestAnalysis('live') }, s.analysis ? 'Analyze report again' : 'Analyze report')
        : null,
      demoAvail
        ? h(
            'button',
            { class: `btn ${live ? '' : 'btn-primary'}`, onclick: () => app.requestAnalysis('demo') },
            'Open preloaded analysis (Demo)',
          )
        : null,
      s.analysis ? h('button', { class: 'btn btn-ghost', onclick: () => app.go('workspace') }, 'Back to questions →') : null,
    ),
    !live && !demoAvail
      ? h(
          'p',
          { class: 'small warn-text' },
          s.demoId
            ? 'The preloaded analysis only matches the unedited demo text. Discard your corrections to use it, or connect Live AI.'
            : 'Live AI is not configured on this server, so this document cannot be analyzed. Preloaded analyses exist only for the three demo reports; they are never shown for your own documents.',
        )
      : null,
    s.demoId && live && demoAvail
      ? h('p', { class: 'small muted' }, 'This is a demo report: you can open the prepared analysis or run a real analysis with Live AI.')
      : null,
  );
}

export function sourceView() {
  const s = state.session!;
  const tab = state.ui.sourceTab;
  const text = workingText(s);
  const stats = textStats(text);
  const warnings = checks(text, s.source);
  const sourceLabel =
    s.source.type === 'demo'
      ? 'Demo report (fictional)'
      : s.source.type === 'pdf'
        ? `PDF · ${s.source.fileName}`
        : s.source.type === 'txt'
          ? `Text file · ${s.source.fileName}`
          : s.source.type === 'import'
            ? 'Imported review'
            : 'Pasted text';

  return h(
    'main',
    { class: 'source' },
    h(
      'div',
      { class: 'source-head' },
      h('label', { class: 'field-label', for: 'doc-title' }, 'Document title'),
      h('input', {
        id: 'doc-title',
        class: 'title-input',
        type: 'text',
        value: s.title,
        onchange: (e: Event) => app.setTitle((e.target as HTMLInputElement).value),
      }),
      h(
        'dl',
        { class: 'stats' },
        h('div', null, h('dt', null, 'Source'), h('dd', null, sourceLabel)),
        s.source.pageCount ? h('div', null, h('dt', null, 'Pages'), h('dd', null, `${s.source.pageCount}${s.source.emptyPages.length ? ` (${s.source.emptyPages.length} without text)` : ''}`)) : null,
        h('div', null, h('dt', null, 'Available text'), h('dd', null, `${stats.chars.toLocaleString('en-US')} characters · ${stats.words.toLocaleString('en-US')} words`)),
        h('div', null, h('dt', null, 'Version'), h('dd', null, s.correctedText !== null ? 'Corrected by you (original kept)' : 'Original extraction')),
      ),
    ),
    warnings.length
      ? h('div', { class: 'warnings' }, h('strong', null, 'Check before analysis'), h('ul', null, ...warnings.map((w) => h('li', null, w))))
      : null,
    h(
      'div',
      { class: 'source-grid' },
      h(
        'section',
        { class: 'card text-card' },
        h(
          'div',
          { class: 'tabs', role: 'tablist' },
          h('button', { role: 'tab', class: `tab${tab === 'original' ? ' active' : ''}`, 'aria-selected': String(tab === 'original'), onclick: () => app.setSourceTab('original') }, 'Original text'),
          h(
            'button',
            {
              role: 'tab',
              class: `tab${tab === 'corrected' ? ' active' : ''}`,
              'aria-selected': String(tab === 'corrected'),
              onclick: () => (s.correctedText === null ? app.beginCorrection() : app.setSourceTab('corrected')),
            },
            s.correctedText === null ? 'Correct recognition errors…' : 'Corrected text',
          ),
        ),
        tab === 'corrected' && s.correctedText !== null
          ? h(
              'div',
              null,
              h('p', { class: 'small muted' }, 'Edit the text to fix extraction errors. The original stays unchanged and can be restored.'),
              h('textarea', {
                class: 'source-text editable',
                'aria-label': 'Corrected report text',
                value: s.correctedText,
                spellcheck: 'false',
                oninput: (e: Event) => app.updateCorrection((e.target as HTMLTextAreaElement).value),
              }),
              h('div', { class: 'row end' }, h('button', { class: 'btn btn-small btn-ghost', onclick: () => app.discardCorrection() }, 'Discard corrections')),
            )
          : h('pre', { class: 'source-text', tabindex: '0', 'aria-label': 'Original extracted text' }, s.originalText),
      ),
      h(
        'aside',
        { class: 'source-side' },
        h('section', { class: 'card' }, h('h2', null, 'Analysis'), analyzePanel()),
        storageCard(),
      ),
    ),
  );
}

export function storageCard() {
  const s = state.session!;
  return h(
    'section',
    { class: 'card small-card' },
    h('h2', null, 'Storage'),
    s.kind === 'demo'
      ? h('p', { class: 'small muted' }, 'Demo sessions are saved automatically in this browser.')
      : s.savedOnDevice
        ? h('p', { class: 'small' }, 'Saved on this device. Changes are saved automatically in this browser only.')
        : h('p', { class: 'small muted' }, 'Not saved. Your document stays in this tab until you save it on this device or export it.'),
    h(
      'div',
      { class: 'row wrap' },
      s.kind === 'user' && !s.savedOnDevice ? h('button', { class: 'btn btn-small', onclick: () => app.saveOnDevice() }, 'Save on this device') : null,
      s.kind === 'user' && s.savedOnDevice ? h('button', { class: 'btn btn-small btn-ghost', onclick: () => app.stopSaving() }, 'Remove saved copy') : null,
      h('button', { class: 'btn btn-small btn-ghost danger-text', onclick: () => app.deleteSession() }, 'Delete session'),
    ),
  );
}
