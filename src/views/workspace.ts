import { ASSESSMENT_LABELS, CATEGORY_LABELS, FACT_LABELS, ReportFacts } from '../../shared/types.js';
import { locateQuote } from '../../shared/quotes.js';
import * as app from '../app.js';
import { state } from '../app.js';
import { fmtDate, h } from '../dom.js';
import {
  AnalysisRecord,
  counts,
  displayQuote,
  isEdited,
  isOpen,
  isStale,
  pendingFollowUp,
  qText,
  qTitle,
  QuestionState,
  questionQuotes,
  STATUS_LABELS,
  ThreadAnalysis,
  ThreadAnswer,
  verify,
  VerifiedQuote,
} from '../model.js';
import { draftInput, errorBox, kindBadge, statusBadge } from './common.js';
import { documentBody, Highlight, sectionNav } from './document.js';
import { storageCard } from './source.js';

// ---------------- helpers ----------------

function highlights(a: AnalysisRecord): Highlight[] {
  const out: Highlight[] = [];
  for (const q of a.questions) {
    if (q.status === 'dismissed') continue;
    questionQuotes(a, q).forEach((v, idx) => {
      if (v.loc.found) out.push({ start: v.loc.start, end: v.loc.end, qid: q.id, idx, kind: q.ai.kind === 'direct_contradiction' ? 'contradiction' : 'question' });
    });
    const pe = q.ai.partialExplanation;
    if (pe) {
      const loc = locateQuote(a.text, pe.quote);
      if (loc.found) out.push({ start: loc.start, end: loc.end, qid: q.id, idx: 100, kind: 'partial' });
    }
  }
  return out;
}

function where(v: VerifiedQuote): string {
  return [v.section, v.page ? `p. ${v.page}` : null].filter(Boolean).join(' · ') || 'Location in text';
}

function filtered(a: AnalysisRecord): QuestionState[] {
  const f = state.ui.filter;
  return a.questions.filter((q) => {
    switch (f) {
      case 'selected':
        return q.status === 'selected' || (q.include && q.status !== 'dismissed');
      case 'awaiting':
        return q.status === 'selected' || (!!pendingFollowUp(q) && isOpen(q));
      case 'resolved':
        return q.status === 'resolved';
      case 'dismissed':
        return q.status === 'dismissed';
      default:
        return true;
    }
  });
}

// ---------------- header ----------------

function wsHeader(a: AnalysisRecord) {
  const s = state.session!;
  const c = counts(a);
  const f = a.result.facts;
  const factVal = (k: keyof ReportFacts) => {
    const v = f[k];
    if (!v.value) return h('span', { class: 'muted' }, 'Not found');
    const ok = v.quote ? verify(a.text, v.quote).loc.found : false;
    return h('span', { title: ok ? 'Quoted from the report' : 'Source quotation not verified' }, v.value, ok ? null : h('sup', { class: 'muted' }, ' ?'));
  };
  return h(
    'div',
    { class: 'ws-head' },
    h(
      'div',
      { class: 'ws-title' },
      h('h1', null, s.title),
      h(
        'div',
        { class: 'ws-badges' },
        a.mode === 'demo'
          ? h('span', { class: 'pill pill-demo' }, h('span', { class: 'dot' }), 'Demo mode · Preloaded analysis')
          : h('span', { class: 'pill pill-live' }, h('span', { class: 'dot' }), `Live AI · ${a.model ?? ''}`),
        h('span', { class: 'small muted' }, `Analyzed ${fmtDate(a.createdAt)} · ${a.textVersion === 'corrected' ? 'corrected text' : 'original text'}`),
      ),
    ),
    h(
      'dl',
      { class: 'ws-stats' },
      h('div', null, h('dt', null, 'Stated value'), h('dd', null, factVal('concludedValue'))),
      h('div', null, h('dt', null, 'Valuation date'), h('dd', null, factVal('valuationDate'))),
      h('div', null, h('dt', null, 'Open'), h('dd', { class: 'num' }, String(c.open))),
      h('div', null, h('dt', null, 'Resolved'), h('dd', { class: 'num ok' }, String(c.resolved))),
    ),
    h('button', { class: 'btn btn-primary', onclick: () => app.go('summary') }, 'Prepare review summary'),
  );
}

function banners(a: AnalysisRecord) {
  const s = state.session!;
  const out: (HTMLElement | null)[] = [];
  if (s.kind === 'demo') out.push(h('div', { class: 'banner info' }, 'Fictional demonstration material. All names, works, documents and figures are invented.'));
  if (isStale(s)) {
    out.push(
      h(
        'div',
        { class: 'banner warn' },
        h('strong', null, 'Results may be out of date. '),
        'The report text was edited after this analysis. The document and quotations below show the analyzed version, not your latest edits. ',
        h('button', { class: 'btn btn-small', onclick: () => app.go('source') }, 'Review text and analyze again'),
      ),
    );
  }
  if (a.truncated) out.push(h('div', { class: 'banner warn' }, 'Only the beginning of this document was analyzed because it exceeds the size limit. See “Review scope”.'));
  if (s.source.emptyPages.length) {
    out.push(h('div', { class: 'banner warn' }, `Pages without extractable text were not analyzed: ${s.source.emptyPages.join(', ')}.`));
  }
  for (const w of a.warnings) out.push(h('div', { class: 'banner warn' }, w));
  return out;
}

// ---------------- right pane: overview ----------------

function quoteRef(a: AnalysisRecord, quote: string) {
  const v = verify(a.text, quote);
  return v.loc.found
    ? h('span', { class: 'small muted' }, where(v))
    : h('span', { class: 'small warn-text', title: 'This quotation could not be matched in the analyzed text.' }, 'unverified');
}

function overview(a: AnalysisRecord) {
  const r = a.result;
  const factRows = (Object.keys(FACT_LABELS) as (keyof ReportFacts)[]).map((k) =>
    h('tr', null, h('th', null, FACT_LABELS[k]), h('td', null, r.facts[k].value ?? h('span', { class: 'muted' }, 'Not found in the supplied report'), r.facts[k].quote && r.facts[k].value ? h('div', null, quoteRef(a, r.facts[k].quote!)) : null)),
  );
  return h(
    'details',
    { class: 'panel' },
    h('summary', null, h('strong', null, 'Report overview'), h('span', { class: 'small muted' }, ` · ${r.comparables.length} comparables, ${r.adjustments.length} adjustments, ${r.assumptions.length} assumptions`)),
    h('table', { class: 'kv' }, h('tbody', null, ...factRows)),
    r.conclusions.length ? h('h4', null, 'Key conclusions') : null,
    r.conclusions.length ? h('ul', { class: 'plain' }, ...r.conclusions.map((c) => h('li', null, c.text, ' ', quoteRef(a, c.quote)))) : null,
    r.comparables.length ? h('h4', null, 'Comparable sales') : null,
    r.comparables.length
      ? h(
          'div',
          { class: 'doc-table-wrap' },
          h(
            'table',
            { class: 'mini' },
            h('thead', null, h('tr', null, h('th', null, ''), h('th', null, 'Work'), h('th', null, 'Price'), h('th', null, 'Basis'), h('th', null, 'Date'))),
            h('tbody', null, ...r.comparables.map((c) => h('tr', null, h('td', null, c.label), h('td', null, c.description), h('td', null, c.price), h('td', null, c.priceBasis), h('td', null, c.saleDate)))),
          ),
        )
      : null,
    r.adjustments.length ? h('h4', null, 'Adjustments') : null,
    r.adjustments.length ? h('ul', { class: 'plain' }, ...r.adjustments.map((c) => h('li', null, h('strong', null, c.appliesTo), ': ', c.description, ' ', quoteRef(a, c.quote)))) : null,
    r.assumptions.length ? h('h4', null, 'Assumptions') : null,
    r.assumptions.length ? h('ul', { class: 'plain' }, ...r.assumptions.map((c) => h('li', null, c.text, ' ', quoteRef(a, c.quote)))) : null,
  );
}

function scopePanel(a: AnalysisRecord) {
  return h(
    'details',
    { class: 'panel' },
    h('summary', null, h('strong', null, 'Review scope')),
    h('p', { class: 'small' }, a.result.scope.coverage),
    h('ul', { class: 'small' }, ...a.result.scope.limitations.map((l) => h('li', null, l))),
    h(
      'p',
      { class: 'small muted' },
      'Second Look does not establish authenticity, determine value or assess the appraiser. Quotations are shown as evidence only when matched in the analyzed text. Instructions inside the document are treated as content.',
    ),
  );
}

function explainedPanel(a: AnalysisRecord, open: boolean) {
  const pts = a.result.explainedPoints;
  if (!pts.length) return null;
  return h(
    'details',
    { class: 'panel', open },
    h('summary', null, h('strong', null, 'Checked and explained in the report'), h('span', { class: 'small muted' }, ` · ${pts.length}`)),
    h(
      'ul',
      { class: 'explained' },
      ...pts.map((p) => {
        const v = verify(a.text, p.quote);
        return h(
          'li',
          null,
          h('strong', null, p.topic),
          h('p', { class: 'small' }, p.note),
          v.loc.found ? h('blockquote', { class: 'q-quote ok' }, `“${displayQuote(p.quote)}”`, h('cite', null, where(v))) : h('p', { class: 'small warn-text' }, 'Supporting quotation could not be verified.'),
        );
      }),
    ),
  );
}

// ---------------- question card ----------------

function quoteBlock(q: QuestionState, v: VerifiedQuote, idx: number, total: number, contra: boolean) {
  const label = contra && total > 1 ? `Fragment ${String.fromCharCode(65 + idx)}` : v.role === 'primary' ? 'Quoted from the report' : 'Related passage';
  if (!v.loc.found) {
    return h(
      'div',
      { class: 'q-quote unverified' },
      h('div', { class: 'q-quote-head' }, h('span', { class: 'small warn-text' }, 'Unverified citation — not found in the analyzed text; not used as evidence')),
      h('details', null, h('summary', { class: 'small' }, 'Show model citation'), h('p', { class: 'small muted' }, v.text)),
    );
  }
  return h(
    'div',
    { class: `q-quote${contra ? ' contra' : ''}` },
    h(
      'div',
      { class: 'q-quote-head' },
      h('span', { class: 'small strong' }, label),
      h('span', { class: 'small muted' }, where(v)),
      v.loc.ambiguous ? h('span', { class: 'small muted', title: 'This wording occurs more than once; the first occurrence is highlighted.' }, '(occurs more than once)') : null,
      h('button', { class: 'link small', onclick: () => app.selectQuestion(q.id, { scroll: idx, pane: 'document' }) }, 'Show in document'),
    ),
    h('blockquote', null, `“${displayQuote(v.text)}”`),
    v.note ? h('p', { class: 'small muted' }, v.note) : null,
  );
}

function statusActions(q: QuestionState) {
  const b = (label: string, fn: () => void, cls = 'btn btn-small') => h('button', { class: cls, onclick: fn }, label);
  const acts: HTMLElement[] = [];
  if (q.status === 'open') acts.push(b('Select for follow-up', () => app.setStatus(q.id, 'selected'), 'btn btn-small btn-accent'));
  if (q.status === 'selected') acts.push(b('Back to open', () => app.setStatus(q.id, 'open')));
  if (q.status !== 'resolved' && q.status !== 'dismissed') {
    acts.push(b('Mark resolved', () => app.setStatus(q.id, 'resolved'), 'btn btn-small btn-ok'));
    acts.push(b('Dismiss…', () => app.startDismiss(q.id)));
  } else {
    acts.push(b('Reopen', () => app.setStatus(q.id, q.thread.some((t) => t.type === 'answer') ? 'answered' : 'open')));
  }
  if (state.ui.editing !== q.id) acts.push(b('Edit wording', () => app.startEdit(q.id), 'btn btn-small btn-ghost'));
  if (isEdited(q)) acts.push(b('Revert to AI wording', () => app.revertEdit(q.id), 'btn btn-small btn-ghost'));
  return h(
    'div',
    { class: 'q-actions' },
    h('div', { class: 'row wrap' }, ...acts),
    h(
      'label',
      { class: 'check' },
      h('input', { type: 'checkbox', checked: q.include, disabled: q.status === 'dismissed', onchange: () => app.toggleInclude(q.id) }),
      ' Include in summary',
    ),
  );
}

function answerCorpus(ans: ThreadAnswer): string {
  return [ans.text, ...ans.attachments.map((x) => x.text)].join('\n\n');
}

function analysisEntry(a: AnalysisRecord, q: QuestionState, t: ThreadAnalysis, ans: ThreadAnswer | undefined, isLatest: boolean) {
  const r = t.result;
  const corpus = ans ? answerCorpus(ans) : '';
  const aq = (quote: string) =>
    ans && locateQuote(corpus, quote).found
      ? h('blockquote', { class: 'ans-quote' }, `“${quote}”`)
      : h('p', { class: 'small warn-text' }, 'Quoted wording not found in the answer (unverified).');
  const followAdded = q.thread.some((x) => x.type === 'followup' && x.fromAnalysisId === t.id);
  if (r.followUp.warranted && r.followUp.question && !followAdded && isLatest && !app.drafts.has(`follow-${q.id}`)) {
    app.drafts.set(`follow-${q.id}`, r.followUp.question);
  }
  const relLabel = { new: 'New — not in the report', consistent_with_report: 'Consistent with the report', conflicts_with_report: 'Conflicts with the report' } as const;
  return h(
    'div',
    { class: `entry analysis assess-${r.assessment}`, key: t.id },
    h(
      'div',
      { class: 'entry-head' },
      h('strong', null, 'Review of the answer'),
      h('span', { class: `badge assess-${r.assessment}` }, ASSESSMENT_LABELS[r.assessment]),
      h('span', { class: 'small muted' }, t.mode === 'demo' ? 'Demo · preloaded' : `Live AI · ${t.model ?? ''}`),
    ),
    h('p', null, r.summary),
    t.warnings.map((w) => h('p', { class: 'small warn-text' }, w)),
    r.explains.length
      ? h('div', { class: 'sub' }, h('h5', null, 'What the answer explains'), h('ul', { class: 'plain' }, ...r.explains.map((x) => h('li', null, x.point, aq(x.answerQuote)))))
      : null,
    r.newStatements.length
      ? h(
          'div',
          { class: 'sub' },
          h('h5', null, 'Statements in the answer'),
          h('p', { class: 'small muted' }, 'These are the appraiser’s statements. An answer is not independent confirmation of a fact.'),
          h(
            'ul',
            { class: 'plain' },
            ...r.newStatements.map((x) => {
              const rv = x.reportQuote ? verify(a.text, x.reportQuote) : null;
              return h(
                'li',
                null,
                h('span', { class: `rel rel-${x.relation}` }, relLabel[x.relation]),
                ' ',
                x.statement,
                aq(x.answerQuote),
                rv
                  ? rv.loc.found
                    ? h('div', { class: 'small' }, 'Report: ', h('q', null, x.reportQuote!), h('span', { class: 'muted' }, ` — ${where(rv)}`))
                    : h('p', { class: 'small warn-text' }, 'Referenced report passage could not be verified.')
                  : null,
              );
            }),
          ),
        )
      : null,
    r.unclear.length ? h('div', { class: 'sub' }, h('h5', null, 'Still unclear'), h('ul', { class: 'plain' }, ...r.unclear.map((u) => h('li', null, u)))) : null,
    h(
      'div',
      { class: 'sub' },
      h('h5', null, r.followUp.warranted ? 'Suggested follow-up' : 'Follow-up'),
      h('p', { class: 'small' }, r.followUp.reason),
      r.followUp.warranted && isLatest && !followAdded && isOpen(q)
        ? h(
            'div',
            { class: 'follow-form' },
            draftInput(`follow-${q.id}`, { rows: 3, 'aria-label': 'Follow-up question' }, true),
            h('button', { class: 'btn btn-small btn-accent', onclick: () => app.addFollowUp(q.id, t.id) }, 'Add follow-up question'),
          )
        : null,
      followAdded ? h('p', { class: 'small muted' }, 'Follow-up added below.') : null,
      !r.followUp.warranted && r.assessment === 'addresses' && isOpen(q) && isLatest
        ? h(
            'div',
            { class: 'resolve-hint' },
            h('span', { class: 'small' }, 'The answer appears to close this question. The decision is yours.'),
            h('button', { class: 'btn btn-small btn-ok', onclick: () => app.setStatus(q.id, 'resolved') }, 'Mark resolved'),
          )
        : null,
    ),
  );
}

function answerEntry(a: AnalysisRecord, q: QuestionState, t: ThreadAnswer) {
  const analyses = q.thread.filter((x): x is ThreadAnalysis => x.type === 'analysis' && x.answerId === t.id);
  const lastAnswer = [...q.thread].reverse().find((x) => x.type === 'answer');
  const isLatestAnswer = lastAnswer?.id === t.id;
  const busy = state.ui.answerBusy[q.id] && isLatestAnswer;
  const err = isLatestAnswer ? state.ui.answerError[q.id] : null;
  const mode = app.answerAnalysisMode(q.id, t);
  return h(
    'div',
    { class: 'entry-group', key: t.id },
    h(
      'div',
      { class: 'entry answer' },
      h('div', { class: 'entry-head' }, h('strong', null, t.respondsTo ? 'Appraiser’s answer to the follow-up' : 'Appraiser’s answer'), h('span', { class: 'small muted' }, `recorded ${fmtDate(t.at)}`)),
      h('p', { class: 'pre' }, t.text),
      ...t.attachments.map((x) => h('div', { class: 'attachment' }, h('strong', { class: 'small' }, `Attached explanation: ${x.label}`), h('p', { class: 'pre small' }, x.text))),
    ),
    ...analyses.map((x, i) => analysisEntry(a, q, x, t, isLatestAnswer && i === analyses.length - 1)),
    busy
      ? h('div', { class: 'entry busy' }, h('span', { class: 'spinner' }), ' Analyzing the answer against the report and the discussion…')
      : isLatestAnswer
        ? h(
            'div',
            { class: 'row wrap answer-tools' },
            mode && !(mode === 'demo' && analyses.length)
              ? h(
                  'button',
                  { class: `btn btn-small ${analyses.length ? 'btn-ghost' : 'btn-primary'}`, onclick: () => void app.runAnswerAnalysis(q.id, t.id) },
                  analyses.length ? 'Analyze again' : mode === 'demo' ? 'Analyze answer (Demo · preloaded)' : 'Analyze answer',
                )
              : analyses.length
                ? null
                : h(
                    'p',
                    { class: 'small muted' },
                    'Answer analysis needs Live AI, which is not configured. Preloaded reviews exist only for the unchanged sample replies. Your answer is saved; you can resolve or dismiss the question yourself.',
                  ),
          )
        : null,
    err ? errorBox(err, () => void app.runAnswerAnalysis(q.id, t.id)) : null,
  );
}

function answerForm(q: QuestionState) {
  if (!isOpen(q)) return null;
  const pending = pendingFollowUp(q);
  const n = state.ui.attachmentCount[q.id] ?? 0;
  const sample = app.sampleAnswerFor(q.id);
  const hasAnswer = q.thread.some((t) => t.type === 'answer');
  const attFields = [];
  for (let i = 0; i < n; i++) {
    attFields.push(
      h(
        'div',
        { class: 'attachment-field', key: `att-${q.id}-${i}` },
        draftInput(`attl-${q.id}-${i}`, { type: 'text', placeholder: 'Label, e.g. “Email of 3 July”', 'aria-label': 'Attachment label' }),
        draftInput(`attt-${q.id}-${i}`, { rows: 3, placeholder: 'Paste the additional explanation text…', 'aria-label': 'Attachment text' }, true),
        h('button', { class: 'link small', onclick: () => app.removeAttachmentField(q.id, i) }, 'Remove'),
      ),
    );
  }
  return h(
    'div',
    { class: 'answer-form' },
    h('h5', null, pending ? 'Add the appraiser’s answer to the follow-up' : hasAnswer ? 'Add a further answer' : 'Add the appraiser’s answer'),
    h('p', { class: 'small muted' }, 'Second Look does not contact anyone. Paste the reply you received.'),
    draftInput(`answer-${q.id}`, { rows: 4, placeholder: 'Paste the appraiser’s reply…', 'aria-label': 'Appraiser answer' }, true),
    ...attFields,
    h(
      'div',
      { class: 'row wrap' },
      h('button', { class: 'btn btn-small btn-primary', onclick: () => app.addAnswer(q.id) }, 'Save answer'),
      h('button', { class: 'btn btn-small btn-ghost', onclick: () => app.addAttachmentField(q.id) }, '+ Attach additional explanation'),
      sample && !hasAnswer ? h('button', { class: 'btn btn-small btn-ghost', onclick: () => app.insertSample(q.id) }, 'Insert sample reply (fictional)') : null,
    ),
  );
}

function thread(a: AnalysisRecord, q: QuestionState) {
  const items: (HTMLElement | null)[] = [];
  for (const t of q.thread) {
    if (t.type === 'answer') items.push(answerEntry(a, q, t));
    else if (t.type === 'followup')
      items.push(h('div', { class: 'entry followup', key: t.id }, h('div', { class: 'entry-head' }, h('strong', null, 'Follow-up question'), h('span', { class: 'small muted' }, fmtDate(t.at))), h('p', null, t.text)));
    else if (t.type === 'note')
      items.push(h('div', { class: 'entry note', key: t.id }, h('div', { class: 'entry-head' }, h('strong', null, 'Your note'), h('span', { class: 'small muted' }, fmtDate(t.at))), h('p', { class: 'pre' }, t.text)));
    else if (t.type === 'status')
      items.push(h('div', { class: 'log', key: t.id }, `${fmtDate(t.at)} · ${STATUS_LABELS[t.from]} → ${STATUS_LABELS[t.to]}${t.reason ? ` · “${t.reason}”` : ''}`));
  }
  return items;
}

function questionCard(a: AnalysisRecord, q: QuestionState, n: number) {
  const vq = questionQuotes(a, q);
  const contra = q.ai.kind === 'direct_contradiction';
  const noBasis = !vq.some((v) => v.loc.found);
  const editing = state.ui.editing === q.id;
  const pe = q.ai.partialExplanation;
  const peV = pe ? verify(a.text, pe.quote) : null;
  return h(
    'article',
    { class: `q-card open kind-${q.ai.kind} st-${q.status}`, key: `card-${q.id}`, id: `card-${q.id}` },
    h(
      'button',
      { class: 'q-card-head', onclick: () => app.selectQuestion(null), 'aria-expanded': 'true' },
      h('span', { class: 'q-num' }, `#${n}`),
      kindBadge(q.ai.kind),
      h('span', { class: 'cat' }, CATEGORY_LABELS[q.ai.category]),
      statusBadge(q.status),
    ),
    editing
      ? h(
          'div',
          { class: 'edit-form' },
          h('label', { class: 'field-label' }, 'Title'),
          draftInput(`title-${q.id}`, { type: 'text' }),
          h('label', { class: 'field-label' }, 'Question'),
          draftInput(`text-${q.id}`, { rows: 5 }, true),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn btn-small btn-primary', onclick: () => app.saveEdit(q.id) }, 'Save wording'),
            h('button', { class: 'btn btn-small', onclick: () => app.cancelEdit() }, 'Cancel'),
          ),
          h('p', { class: 'small muted' }, 'The quotations and the AI’s reasoning stay unchanged.'),
        )
      : [
          h('h3', { class: 'q-title' }, qTitle(q), isEdited(q) ? h('span', { class: 'tag' }, 'Edited') : null),
          h('p', { class: 'q-text' }, qText(q)),
        ],
    noBasis ? h('div', { class: 'banner warn small' }, 'No quotation for this question could be verified in the analyzed text. Treat it with caution.') : null,
    h('div', { class: 'q-section' }, h('h5', null, contra ? 'The two passages' : 'Basis in the report'), ...vq.map((v, i) => quoteBlock(q, v, i, vq.length, contra))),
    pe && peV
      ? h(
          'div',
          { class: 'q-section partial' },
          h('h5', null, 'Partly explained elsewhere in the report'),
          peV.loc.found
            ? h('div', { class: 'q-quote partial' }, h('div', { class: 'q-quote-head' }, h('span', { class: 'small muted' }, where(peV)), h('button', { class: 'link small', onclick: () => app.selectQuestion(q.id, { scroll: 100, pane: 'document' }) }, 'Show in document')), h('blockquote', null, `“${pe.quote}”`))
            : h('p', { class: 'small warn-text' }, 'The cited passage could not be verified in the analyzed text.'),
          h('p', { class: 'small' }, h('strong', null, 'Explains: '), pe.explains),
          h('p', { class: 'small' }, h('strong', null, 'Still unclear: '), pe.remainsUnclear),
        )
      : null,
    h(
      'dl',
      { class: 'q-why' },
      h('dt', null, 'Why it matters'),
      h('dd', null, q.ai.whyItMatters),
      h('dt', null, 'What it would clarify'),
      h('dd', null, q.ai.clarifies),
      h('dt', null, 'Checked elsewhere'),
      h('dd', { class: 'muted' }, q.ai.checkedElsewhere),
    ),
    q.status === 'dismissed' && q.dismissReason ? h('p', { class: 'small' }, h('strong', null, 'Dismissed: '), q.dismissReason) : null,
    statusActions(q),
    state.ui.dismissing === q.id
      ? h(
          'div',
          { class: 'dismiss-form' },
          h('label', { class: 'field-label' }, 'Why is this question not needed?'),
          draftInput(`dismiss-${q.id}`, { rows: 2, placeholder: 'e.g. Answered in the cover letter of 2 July' }, true),
          h(
            'div',
            { class: 'row' },
            h('button', { class: 'btn btn-small btn-danger', onclick: () => app.confirmDismiss(q.id) }, 'Dismiss question'),
            h('button', { class: 'btn btn-small', onclick: () => app.startDismiss(null) }, 'Cancel'),
          ),
        )
      : null,
    h(
      'div',
      { class: 'q-thread' },
      h('h4', null, 'Discussion with the appraiser'),
      ...thread(a, q),
      answerForm(q),
      h(
        'div',
        { class: 'note-form' },
        draftInput(`note-${q.id}`, { type: 'text', placeholder: 'Add a private note…', 'aria-label': 'Private note' }),
        h('button', { class: 'btn btn-small btn-ghost', onclick: () => app.addNote(q.id) }, 'Add note'),
      ),
    ),
  );
}

function questionRow(q: QuestionState, n: number) {
  const answered = q.thread.filter((t) => t.type === 'answer').length;
  return h(
    'button',
    { class: `q-row kind-${q.ai.kind} st-${q.status}`, key: `row-${q.id}`, onclick: () => app.selectQuestion(q.id, { scroll: 0 }) },
    h('span', { class: 'q-num' }, `#${n}`),
    h(
      'span',
      { class: 'q-row-main' },
      h('span', { class: 'q-row-title' }, qTitle(q)),
      h('span', { class: 'q-row-meta' }, kindBadge(q.ai.kind), h('span', { class: 'cat' }, CATEGORY_LABELS[q.ai.category]), answered ? h('span', { class: 'small muted' }, `${answered} answer(s)`) : null),
    ),
    statusBadge(q.status),
  );
}

function filters(a: AnalysisRecord) {
  const all = a.questions;
  const defs: [app.Filter, string][] = [
    ['all', 'All'],
    ['selected', 'Selected'],
    ['awaiting', 'Awaiting answer'],
    ['resolved', 'Resolved'],
    ['dismissed', 'Dismissed'],
  ];
  const cur = state.ui.filter;
  return h(
    'div',
    { class: 'filters', role: 'group', 'aria-label': 'Filter questions' },
    ...defs.map(([f, label]) => {
      const prev = state.ui.filter;
      state.ui.filter = f;
      const n = filtered(a).length;
      state.ui.filter = prev;
      return h('button', { class: `chip${cur === f ? ' active' : ''}`, 'aria-pressed': String(cur === f), onclick: () => app.setFilter(f) }, `${label} `, h('span', { class: 'chip-n' }, String(f === 'all' ? all.length : n)));
    }),
  );
}

function archivedPanel() {
  const s = state.session!;
  if (!s.archived.length) return null;
  return h(
    'details',
    { class: 'panel' },
    h('summary', null, h('strong', null, 'Previous analyses'), h('span', { class: 'small muted' }, ` · ${s.archived.length} (read-only)`)),
    ...s.archived.map((a) =>
      h(
        'div',
        { class: 'archived' },
        h('p', { class: 'small' }, `${fmtDate(a.createdAt)} · ${a.mode === 'demo' ? 'Demo' : 'Live AI'} · ${a.textVersion} text · ${a.questions.length} question(s)`),
        h(
          'ul',
          { class: 'small plain' },
          ...a.questions.map((q) => h('li', null, `${qTitle(q)} — ${STATUS_LABELS[q.status]}${q.thread.filter((t) => t.type === 'answer').length ? ` · ${q.thread.filter((t) => t.type === 'answer').length} answer(s)` : ''}`)),
        ),
      ),
    ),
    h('p', { class: 'small muted' }, 'Quotations of earlier analyses refer to the text version they analyzed and are not mixed with the current results. They are included in the JSON export.'),
  );
}

// ---------------- main ----------------

export function workspaceView() {
  const s = state.session!;
  const a = s.analysis!;
  const pane = state.ui.mobilePane;
  const list = filtered(a);
  const sel = state.ui.selectedQ;
  const numOf = (q: QuestionState) => a.questions.indexOf(q) + 1;

  return h(
    'main',
    { class: 'workspace' },
    wsHeader(a),
    ...banners(a),
    h(
      'div',
      { class: 'pane-switch', role: 'tablist' },
      h('button', { role: 'tab', class: `tab${pane === 'document' ? ' active' : ''}`, 'aria-selected': String(pane === 'document'), onclick: () => app.setMobilePane('document') }, 'Document'),
      h('button', { role: 'tab', class: `tab${pane === 'questions' ? ' active' : ''}`, 'aria-selected': String(pane === 'questions'), onclick: () => app.setMobilePane('questions') }, `Questions (${a.questions.length})`),
    ),
    h(
      'div',
      { class: `ws-grid show-${pane}` },
      h(
        'section',
        { class: 'doc-pane', 'aria-label': 'Report text' },
        h(
          'div',
          { class: 'doc-pane-head' },
          h('span', { class: 'small muted' }, `Analyzed text · ${a.textVersion === 'corrected' ? 'corrected by you' : 'original'} · ${a.text.length.toLocaleString('en-US')} characters`),
          h('details', { class: 'sec-details' }, h('summary', { class: 'small' }, 'Sections'), sectionNav(a.text)),
        ),
        h('div', { class: 'doc-scroll', id: 'doc-scroll' }, documentBody(a.text, highlights(a), sel, (qid, idx) => app.selectQuestion(qid, { scroll: idx, pane: 'questions' }))),
      ),
      h(
        'section',
        { class: 'q-pane', 'aria-label': 'Questions' },
        overview(a),
        scopePanel(a),
        a.questions.length === 0
          ? h(
              'div',
              { class: 'card empty-q' },
              h('h3', null, 'No questions within the scope of this review'),
              h('p', null, a.result.noQuestionsReason ?? 'The analysis did not find points that need a question.'),
              h('p', { class: 'small muted' }, 'This is not a statement that the value is correct — only that the reasoning in the supplied text appears explained. See “Checked and explained” below.'),
            )
          : [
              filters(a),
              list.length === 0 ? h('p', { class: 'small muted empty' }, 'No questions match this filter.') : null,
              h('div', { class: 'q-list' }, ...list.map((q) => (q.id === sel ? questionCard(a, q, numOf(q)) : questionRow(q, numOf(q))))),
            ],
        explainedPanel(a, a.questions.length === 0),
        archivedPanel(),
        storageCard(),
      ),
    ),
  );
}
