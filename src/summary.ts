// Review summary: one HTML builder used for the on-screen view, the standalone download and print.

import { CATEGORY_LABELS, FACT_LABELS, KIND_LABELS, ReportFacts, ASSESSMENT_LABELS } from '../shared/types.js';
import { escapeHtml as e, fmtDate } from './dom.js';
import {
  AnalysisRecord,
  displayQuote,
  isEdited,
  isOpen,
  isStale,
  qText,
  qTitle,
  QuestionState,
  questionQuotes,
  Session,
  STATUS_LABELS,
  verify,
} from './model.js';

export const PRODUCT_LIMITS = [
  'Second Look reviews the reasoning of the supplied document only. It does not establish authenticity or attribution, does not determine the value of the work, and does not assess the professional competence of the report’s author.',
  'Statements in the appraiser’s answers are recorded as the appraiser’s claims; they are not independent confirmation of facts.',
  'Quotations are shown as evidence only when they were matched programmatically in the analyzed text.',
];

function modeLine(a: AnalysisRecord): string {
  return a.mode === 'demo'
    ? 'Demo mode · Preloaded analysis (fictional demonstration material)'
    : `Live AI analysis · ${a.provider ?? 'provider'} / ${a.model ?? 'model'}`;
}

function includedQuestions(a: AnalysisRecord): QuestionState[] {
  return a.questions.filter((q) => q.include && q.status !== 'dismissed');
}

function factsTable(facts: ReportFacts, text: string): string {
  const rows = (Object.keys(FACT_LABELS) as (keyof ReportFacts)[])
    .map((k) => {
      const f = facts[k];
      const verified = f.quote ? verify(text, f.quote).loc.found : false;
      const value = f.value ? e(f.value) : '<span class="muted">Not found in the supplied report</span>';
      const flag = f.value && f.quote && !verified ? ' <span class="muted">(source quotation not verified)</span>' : '';
      return `<tr><th>${e(FACT_LABELS[k])}</th><td>${value}${flag}</td></tr>`;
    })
    .join('');
  return `<table class="facts">${rows}</table>`;
}

function questionBlock(a: AnalysisRecord, q: QuestionState, n: number): string {
  const vq = questionQuotes(a, q);
  const verified = vq.filter((v) => v.loc.found);
  const unverified = vq.length - verified.length;
  const quotes = verified
    .map((v) => {
      const where = [v.section, v.page ? `p. ${v.page}` : null].filter(Boolean).join(' · ');
      return `<blockquote><p>“${e(displayQuote(v.text))}”</p>${where ? `<cite>${e(where)}</cite>` : ''}</blockquote>`;
    })
    .join('');
  const thread = q.thread
    .map((t) => {
      if (t.type === 'answer') {
        const att = t.attachments
          .map((x) => `<div class="att"><strong>Attached explanation: ${e(x.label)}</strong><p>${e(x.text)}</p></div>`)
          .join('');
        return `<div class="entry answer"><h5>Appraiser’s answer <span class="muted">(recorded ${e(fmtDate(t.at))})</span></h5><p>${e(t.text)}</p>${att}</div>`;
      }
      if (t.type === 'analysis') {
        const unclear = t.result.unclear.length ? `<p><strong>Still unclear:</strong> ${t.result.unclear.map(e).join(' ')}</p>` : '';
        return `<div class="entry analysis"><h5>Review of the answer — ${e(ASSESSMENT_LABELS[t.result.assessment])}${t.mode === 'demo' ? ' <span class="muted">(demo, preloaded)</span>' : ''}</h5><p>${e(t.result.summary)}</p>${unclear}</div>`;
      }
      if (t.type === 'followup') return `<div class="entry followup"><h5>Follow-up question</h5><p>${e(t.text)}</p></div>`;
      if (t.type === 'note') return `<div class="entry note"><h5>Reviewer note</h5><p>${e(t.text)}</p></div>`;
      return '';
    })
    .join('');
  return `<section class="q">
  <h4>${n}. ${e(qTitle(q))}</h4>
  <p class="meta">${e(KIND_LABELS[q.ai.kind])} · ${e(CATEGORY_LABELS[q.ai.category])} · Status: ${e(STATUS_LABELS[q.status])}${isEdited(q) ? ' · Wording edited by reviewer' : ''}</p>
  <p class="question">${e(qText(q))}</p>
  ${quotes || '<p class="muted">No verified quotation for this question.</p>'}
  ${unverified ? `<p class="muted">${unverified} model citation(s) could not be matched in the analyzed text and are omitted.</p>` : ''}
  <p><strong>Why it matters:</strong> ${e(q.ai.whyItMatters)}</p>
  ${q.ai.partialExplanation ? `<p><strong>Partly explained in the report:</strong> ${e(q.ai.partialExplanation.explains)} <em>Still unclear:</em> ${e(q.ai.partialExplanation.remainsUnclear)}</p>` : ''}
  ${thread ? `<div class="thread">${thread}</div>` : ''}
</section>`;
}

export function summaryBody(s: Session): string {
  const a = s.analysis;
  if (!a) return '<p>No analysis yet.</p>';
  const inc = includedQuestions(a);
  const open = a.questions.filter(isOpen);
  const resolved = a.questions.filter((q) => q.status === 'resolved');
  const dismissed = a.questions.filter((q) => q.status === 'dismissed');
  const stale = isStale(s);
  return `
<header class="sum-head">
  <p class="eyebrow">Second Look · Review summary</p>
  <h1>${e(s.title)}</h1>
  <p class="meta">Prepared ${e(fmtDate(new Date().toISOString()))} · ${e(modeLine(a))} · Analysis run ${e(fmtDate(a.createdAt))} on the ${a.textVersion === 'corrected' ? 'reviewer-corrected text' : 'original extracted text'}</p>
  ${s.kind === 'demo' ? '<p class="notice">Fictional demonstration material. All names, works, documents and figures are invented.</p>' : ''}
  ${stale ? '<p class="notice warn">The report text was edited after this analysis. Quotations refer to the analyzed version.</p>' : ''}
</header>

<h2>Report details</h2>
${factsTable(a.result.facts, a.text)}

<h2>Questions for the appraiser (${inc.length})</h2>
${inc.length ? inc.map((q, i) => questionBlock(a, q, i + 1)).join('') : '<p class="muted">No questions have been selected for the summary. Use “Include in summary” on a question card.</p>'}

<h2>Remaining open questions (${open.length})</h2>
${open.length ? `<ul>${open.map((q) => `<li>${e(qTitle(q))} <span class="muted">— ${e(STATUS_LABELS[q.status])}</span></li>`).join('')}</ul>` : '<p class="muted">None.</p>'}

${resolved.length ? `<h2>Resolved (${resolved.length})</h2><ul>${resolved.map((q) => `<li>${e(qTitle(q))}</li>`).join('')}</ul>` : ''}
${dismissed.length ? `<h2>Dismissed (${dismissed.length})</h2><ul>${dismissed.map((q) => `<li>${e(qTitle(q))}${q.dismissReason ? ` <span class="muted">— ${e(q.dismissReason)}</span>` : ''}</li>`).join('')}</ul>` : ''}

<h2>Review scope and limitations</h2>
<p>${e(a.result.scope.coverage)}</p>
<ul>${a.result.scope.limitations.map((l) => `<li>${e(l)}</li>`).join('')}</ul>
${a.truncated ? '<p class="notice warn">Only part of the document was analyzed (see above).</p>' : ''}
${s.source.emptyPages.length ? `<p class="notice warn">Pages without extractable text were not analyzed: ${s.source.emptyPages.join(', ')}.</p>` : ''}
<ul class="muted">${PRODUCT_LIMITS.map((l) => `<li>${e(l)}</li>`).join('')}</ul>
`;
}

export const SUMMARY_CSS = `
body{font-family:Georgia,'Iowan Old Style','Times New Roman',serif;color:#2b2d2f;background:#fbf8f2;margin:0;line-height:1.55}
.page{max-width:780px;margin:0 auto;padding:40px 28px 64px}
h1{font-size:28px;margin:4px 0 8px;line-height:1.2}
h2{font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;letter-spacing:.04em;text-transform:uppercase;color:#1f4d3a;border-bottom:1px solid #d9d2c3;padding-bottom:6px;margin-top:36px}
h4{font-size:18px;margin:0 0 4px}
h5{font-family:system-ui,sans-serif;font-size:13px;margin:0 0 4px;color:#444}
.eyebrow{font-family:system-ui,sans-serif;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#1f4d3a;margin:0}
.meta{font-family:system-ui,sans-serif;font-size:13px;color:#6b6760;margin:0 0 10px}
.muted{color:#7a756c;font-size:.92em}
.notice{font-family:system-ui,sans-serif;font-size:13px;background:#eef3ef;border-left:3px solid #1f4d3a;padding:8px 12px}
.notice.warn{background:#fbf1de;border-color:#b7791f}
table.facts{border-collapse:collapse;width:100%;font-size:15px}
table.facts th{text-align:left;font-family:system-ui,sans-serif;font-size:13px;color:#6b6760;font-weight:600;width:36%;padding:6px 10px 6px 0;vertical-align:top}
table.facts td{padding:6px 0;border-bottom:1px solid #ebe5d8}
section.q{border:1px solid #e3dccd;border-radius:8px;padding:18px 20px;margin:16px 0;background:#fff;break-inside:avoid}
.question{font-size:17px}
blockquote{margin:10px 0;padding:6px 14px;border-left:3px solid #b7791f;background:#fbf4e6}
blockquote p{margin:0}
cite{display:block;font-family:system-ui,sans-serif;font-size:12px;color:#7a756c;font-style:normal;margin-top:2px}
.thread{border-top:1px dashed #d9d2c3;margin-top:12px;padding-top:8px}
.entry{margin:10px 0}
.entry.answer{padding-left:12px;border-left:3px solid #1f4d3a}
.entry.followup{padding-left:12px;border-left:3px solid #b7791f}
.att{background:#f6f3ec;padding:6px 10px;border-radius:4px;font-size:14px}
@media print{body{background:#fff}.page{padding:0}section.q{border-color:#ccc}}
`;

export function standaloneHtml(s: Session): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review summary — ${e(s.title)}</title><style>${SUMMARY_CSS}</style></head>
<body><main class="page">${summaryBody(s)}</main></body></html>`;
}

export function questionsPlainText(s: Session): string {
  const a = s.analysis;
  if (!a) return '';
  const inc = includedQuestions(a);
  const lines: string[] = [`Questions regarding: ${s.title}`, ''];
  inc.forEach((q, i) => {
    lines.push(`${i + 1}. ${qTitle(q)}`);
    lines.push(qText(q));
    for (const v of questionQuotes(a, q).filter((x) => x.loc.found)) {
      const where = [v.section, v.page ? `p. ${v.page}` : null].filter(Boolean).join(', ');
      lines.push(`   Report: “${v.text}”${where ? ` (${where})` : ''}`);
    }
    const follow = q.thread.filter((t) => t.type === 'followup');
    for (const f of follow) lines.push(`   Follow-up: ${f.text}`);
    lines.push('');
  });
  if (!inc.length) lines.push('(No questions selected.)');
  return lines.join('\n');
}
