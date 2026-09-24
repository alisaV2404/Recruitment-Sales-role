// Application state and actions. Views read `state` and call actions; every action re-renders.

import type { StatusResponse } from '../shared/types.js';
import { normalizeForCompare, textHash } from '../shared/quotes.js';
import { validateAnalysis } from '../shared/validate.js';
import * as api from './api.js';
import type { ClientError } from './api.js';
import { DEMO_ANALYSES, DEMO_ANSWERS } from './demo/analyses.js';
import { DEMO_REPORTS, getDemoReport } from './demo/reports.js';
import { downloadFile, uid } from './dom.js';
import {
  AnalysisRecord,
  Attachment,
  historyForModel,
  newQuestionStates,
  pendingFollowUp,
  qText,
  qTitle,
  QStatus,
  QuestionState,
  Session,
  SourceInfo,
  ThreadAnswer,
  workingText,
  workingVersion,
} from './model.js';
import { extractPdfText, PdfError } from './pdf.js';
import * as storage from './storage.js';
import { questionsPlainText, standaloneHtml } from './summary.js';
import { slug } from './dom.js';

export type Screen = 'start' | 'source' | 'workspace' | 'summary';
export type Filter = 'all' | 'selected' | 'awaiting' | 'resolved' | 'dismissed';

export interface ConfirmDialog {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  onConfirm: () => void;
}

export interface UI {
  screen: Screen;
  selectedQ: string | null;
  filter: Filter;
  mobilePane: 'document' | 'questions';
  analyzing: { startedAt: number; mode: 'live' } | null;
  analyzeError: ClientError | null;
  answerBusy: Record<string, boolean>;
  answerError: Record<string, ClientError | null>;
  editing: string | null;
  dismissing: string | null;
  sourceTab: 'original' | 'corrected';
  attachmentCount: Record<string, number>;
  toast: string | null;
  startError: string | null;
  loadingFile: string | null;
  scrollTo: { qid: string; idx: number } | null;
  confirm: ConfirmDialog | null;
  showArchived: boolean;
}

export const state: { status: StatusResponse | null; session: Session | null; ui: UI; saved: storage.SavedEntry[] } = {
  status: null,
  session: null,
  saved: [],
  ui: {
    screen: 'start',
    selectedQ: null,
    filter: 'all',
    mobilePane: 'questions',
    analyzing: null,
    analyzeError: null,
    answerBusy: {},
    answerError: {},
    editing: null,
    dismissing: null,
    sourceTab: 'original',
    attachmentCount: {},
    toast: null,
    startError: null,
    loadingFile: null,
    scrollTo: null,
    confirm: null,
    showArchived: false,
  },
};

// Drafts hold in-progress form input without triggering renders.
export const drafts = new Map<string, string>();

let renderer: () => void = () => undefined;
export function setRenderer(fn: () => void) {
  renderer = fn;
}
export function render() {
  renderer();
}

let toastTimer: number | undefined;
export function toast(msg: string) {
  state.ui.toast = msg;
  render();
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    state.ui.toast = null;
    render();
  }, 3200);
}

function now() {
  return new Date().toISOString();
}

function touch() {
  const s = state.session;
  if (!s) return;
  s.updatedAt = now();
  const err = storage.persist(s);
  if (err) toast(err);
  state.saved = storage.listSaved();
}

function mutate(fn: (s: Session) => void) {
  if (!state.session) return;
  fn(state.session);
  touch();
  render();
}

export function go(screen: Screen) {
  state.ui.screen = screen;
  if (screen === 'start') state.saved = storage.listSaved();
  render();
  window.scrollTo(0, 0);
}

export async function init() {
  state.saved = storage.listSaved();
  render();
  state.status = await api.fetchStatus();
  render();
}

// ---------------- starting a session ----------------

function newSession(kind: 'demo' | 'user', title: string, text: string, source: SourceInfo, demoId: string | null = null): Session {
  const t = now();
  return {
    version: 1,
    id: uid('s'),
    kind,
    demoId,
    title,
    source,
    originalText: text,
    correctedText: null,
    analysis: null,
    archived: [],
    savedOnDevice: false,
    createdAt: t,
    updatedAt: t,
  };
}

function openSession(s: Session, screen: Screen) {
  state.session = s;
  state.ui = {
    ...state.ui,
    screen,
    selectedQ: s.analysis?.questions[0]?.id ?? null,
    filter: 'all',
    analyzeError: null,
    answerBusy: {},
    answerError: {},
    editing: null,
    dismissing: null,
    sourceTab: s.correctedText !== null ? 'corrected' : 'original',
    startError: null,
    showArchived: false,
  };
  drafts.clear();
  render();
  window.scrollTo(0, 0);
}

export function startDemo(id: string) {
  const existing = state.saved.find((e) => e.kind === 'demo' && storage.loadSaved(e.id)?.demoId === id);
  if (existing) {
    const s = storage.loadSaved(existing.id);
    if (s) return openSession(s, s.analysis ? 'workspace' : 'source');
  }
  const d = getDemoReport(id);
  if (!d) return;
  const s = newSession('demo', d.title, d.text, { type: 'demo', fileName: null, pageCount: null, emptyPages: [], warnings: [] }, id);
  s.savedOnDevice = true;
  openSession(s, 'source');
  touch();
}

export function startPaste(title: string, text: string) {
  if (text.trim().length < 50) {
    state.ui.startError = 'Paste the report text first (at least a few sentences).';
    return render();
  }
  const s = newSession('user', title.trim() || firstLineTitle(text), text.replace(/\r\n?/g, '\n'), {
    type: 'paste',
    fileName: null,
    pageCount: null,
    emptyPages: [],
    warnings: [],
  });
  openSession(s, 'source');
}

function firstLineTitle(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 3) ?? 'Untitled report';
  return line.slice(0, 80);
}

export async function startFile(file: File) {
  state.ui.startError = null;
  const name = file.name;
  const lower = name.toLowerCase();
  if (file.size > 25 * 1024 * 1024) {
    state.ui.startError = 'The file is larger than 25 MB. Please paste the relevant text instead.';
    return render();
  }
  state.ui.loadingFile = name;
  render();
  try {
    if (lower.endsWith('.json')) {
      await importJson(file);
      return;
    }
    if (lower.endsWith('.txt') || lower.endsWith('.md') || file.type === 'text/plain') {
      const text = (await file.text()).replace(/\r\n?/g, '\n');
      const warnings: string[] = [];
      if (text.includes('�')) warnings.push('The file contains characters that could not be decoded (shown as �). It may not be UTF-8 encoded; check the text.');
      if (!text.trim()) {
        state.ui.startError = `${name} is empty.`;
        return;
      }
      openSession(
        newSession('user', name.replace(/\.[^.]+$/, ''), text, { type: 'txt', fileName: name, pageCount: null, emptyPages: [], warnings }),
        'source',
      );
      return;
    }
    if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      const r = await extractPdfText(await file.arrayBuffer());
      if (r.pagesWithText === 0) {
        state.ui.startError = `${name}: ${r.warnings[0]}`;
        return;
      }
      openSession(
        newSession('user', name.replace(/\.[^.]+$/, ''), r.text, {
          type: 'pdf',
          fileName: name,
          pageCount: r.pageCount,
          emptyPages: r.emptyPages,
          warnings: r.warnings,
        }),
        'source',
      );
      return;
    }
    state.ui.startError = `Unsupported file type: ${name}. Use a TXT or PDF file, a saved review (JSON), or paste the text.`;
  } catch (err) {
    state.ui.startError =
      err instanceof PdfError
        ? `${name}: ${err.message}`
        : `${name} could not be read: ${(err as Error).message}. You can paste the text instead.`;
  } finally {
    state.ui.loadingFile = null;
    render();
  }
}

export function openSaved(id: string) {
  const s = storage.loadSaved(id);
  if (!s) {
    toast('This saved session could not be loaded.');
    storage.removeSaved(id);
    state.saved = storage.listSaved();
    return render();
  }
  openSession(s, s.analysis ? 'workspace' : 'source');
}

export function deleteSaved(id: string, title: string) {
  confirm({
    title: 'Delete saved session?',
    message: `“${title}” and all its questions, answers and notes will be removed from this device. This cannot be undone.`,
    confirmLabel: 'Delete',
    danger: true,
    onConfirm: () => {
      storage.removeSaved(id);
      state.saved = storage.listSaved();
      if (state.session?.id === id) state.session = null;
      render();
    },
  });
}

// ---------------- dialogs ----------------

export function confirm(d: ConfirmDialog) {
  state.ui.confirm = d;
  render();
}
export function closeConfirm(run: boolean) {
  const d = state.ui.confirm;
  state.ui.confirm = null;
  render();
  if (run && d) d.onConfirm();
}

// ---------------- source review ----------------

export function setTitle(title: string) {
  mutate((s) => (s.title = title.trim() || s.title));
}

export function beginCorrection() {
  mutate((s) => {
    if (s.correctedText === null) s.correctedText = s.originalText;
  });
  state.ui.sourceTab = 'corrected';
  render();
}

let correctionTimer: number | undefined;
export function updateCorrection(text: string) {
  const s = state.session;
  if (!s) return;
  s.correctedText = text;
  window.clearTimeout(correctionTimer);
  correctionTimer = window.setTimeout(() => {
    touch();
    render();
  }, 400);
}

export function discardCorrection() {
  confirm({
    title: 'Discard your corrections?',
    message: 'The corrected text will be removed and the original extracted text will be used for analysis.',
    confirmLabel: 'Discard corrections',
    danger: true,
    onConfirm: () => {
      mutate((s) => (s.correctedText = null));
      state.ui.sourceTab = 'original';
      render();
    },
  });
}

export function setSourceTab(tab: 'original' | 'corrected') {
  state.ui.sourceTab = tab;
  render();
}

// ---------------- analysis ----------------

export function demoAnalysisAvailable(s: Session): boolean {
  if (!s.demoId || !DEMO_ANALYSES[s.demoId]) return false;
  const d = getDemoReport(s.demoId);
  return !!d && workingText(s) === d.text;
}

let analyzeAbort: AbortController | null = null;
let tick: number | undefined;

export function requestAnalysis(mode: 'live' | 'demo') {
  const s = state.session;
  if (!s) return;
  const hasWork = !!s.analysis?.questions.some((q) => q.thread.length || q.status !== 'open' || q.title || q.text);
  if (s.analysis) {
    confirm({
      title: 'Run a new analysis?',
      message: hasWork
        ? 'The current questions, answers and notes will be moved to “Previous analyses”. They are kept (read-only) and included in the JSON export, but they will not be mixed with the new questions.'
        : 'The current questions will be replaced by the new analysis. The previous analysis is kept under “Previous analyses”.',
      confirmLabel: 'Analyze again',
      danger: false,
      onConfirm: () => void runAnalysis(mode),
    });
    return;
  }
  void runAnalysis(mode);
}

function install(s: Session, record: AnalysisRecord) {
  if (s.analysis) s.archived.unshift(s.analysis);
  s.analysis = record;
  state.ui.selectedQ = record.questions[0]?.id ?? null;
  state.ui.filter = 'all';
  state.ui.screen = 'workspace';
  state.ui.mobilePane = 'questions';
  touch();
}

async function runAnalysis(mode: 'live' | 'demo') {
  const s = state.session;
  if (!s) return;
  const text = workingText(s);
  if (mode === 'demo') {
    if (!demoAnalysisAvailable(s)) return;
    const result = validateAnalysis(JSON.parse(JSON.stringify(DEMO_ANALYSES[s.demoId!])));
    install(s, {
      id: uid('a'),
      mode: 'demo',
      provider: null,
      model: null,
      createdAt: now(),
      textVersion: workingVersion(s),
      textHash: textHash(text),
      text,
      truncated: false,
      warnings: [],
      result,
      questions: newQuestionStates(result),
    });
    render();
    window.scrollTo(0, 0);
    return;
  }
  analyzeAbort?.abort();
  analyzeAbort = new AbortController();
  state.ui.analyzing = { startedAt: Date.now(), mode: 'live' };
  state.ui.analyzeError = null;
  render();
  window.clearInterval(tick);
  tick = window.setInterval(render, 1000);
  try {
    const out = await api.analyzeReport({ title: s.title, text }, analyzeAbort.signal);
    if (state.session !== s) return;
    install(s, {
      id: uid('a'),
      mode: 'live',
      provider: out.provider,
      model: out.model,
      createdAt: now(),
      textVersion: workingVersion(s),
      textHash: textHash(text),
      text: out.truncated ? text.slice(0, out.analyzedChars) : text,
      truncated: out.truncated,
      warnings: out.warnings,
      result: out.result,
      questions: newQuestionStates(out.result),
    });
    window.scrollTo(0, 0);
  } catch (err) {
    if (state.session === s) {
      state.ui.analyzeError = isClientError(err) ? err : { code: 'invalid_structure', message: (err as Error).message, retryable: true };
    }
  } finally {
    window.clearInterval(tick);
    state.ui.analyzing = null;
    analyzeAbort = null;
    render();
  }
}

function isClientError(e: unknown): e is ClientError {
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

export function cancelAnalysis() {
  analyzeAbort?.abort();
}

// ---------------- questions ----------------

function findQ(qid: string): QuestionState | undefined {
  return state.session?.analysis?.questions.find((q) => q.id === qid);
}

export function selectQuestion(qid: string | null, opts: { scroll?: number; pane?: 'document' | 'questions' } = {}) {
  state.ui.selectedQ = qid;
  if (qid && opts.scroll !== undefined) state.ui.scrollTo = { qid, idx: opts.scroll };
  if (opts.pane) state.ui.mobilePane = opts.pane;
  render();
}

export function setFilter(f: Filter) {
  state.ui.filter = f;
  render();
}

export function setMobilePane(p: 'document' | 'questions') {
  state.ui.mobilePane = p;
  render();
}

export function setStatus(qid: string, to: QStatus, reason: string | null = null) {
  mutate(() => {
    const q = findQ(qid);
    if (!q || q.status === to) return;
    q.thread.push({ type: 'status', id: uid('t'), at: now(), from: q.status, to, reason });
    q.status = to;
    if (to === 'selected') q.include = true;
    if (to === 'dismissed') {
      q.include = false;
      q.dismissReason = reason;
    }
    if (to === 'open') q.dismissReason = null;
  });
  state.ui.dismissing = null;
  render();
}

export function toggleInclude(qid: string) {
  mutate(() => {
    const q = findQ(qid);
    if (q) q.include = !q.include;
  });
}

export function startEdit(qid: string) {
  const q = findQ(qid);
  if (!q) return;
  drafts.set(`title-${qid}`, qTitle(q));
  drafts.set(`text-${qid}`, qText(q));
  state.ui.editing = qid;
  render();
}

export function cancelEdit() {
  state.ui.editing = null;
  render();
}

export function saveEdit(qid: string) {
  const title = (drafts.get(`title-${qid}`) ?? '').trim();
  const text = (drafts.get(`text-${qid}`) ?? '').trim();
  if (!title || !text) return toast('Title and question cannot be empty.');
  mutate(() => {
    const q = findQ(qid);
    if (!q) return;
    q.title = title === q.ai.title ? null : title;
    q.text = text === q.ai.question ? null : text;
  });
  state.ui.editing = null;
  render();
}

export function revertEdit(qid: string) {
  mutate(() => {
    const q = findQ(qid);
    if (q) {
      q.title = null;
      q.text = null;
    }
  });
}

export function startDismiss(qid: string | null) {
  state.ui.dismissing = qid;
  render();
}

export function confirmDismiss(qid: string) {
  const reason = (drafts.get(`dismiss-${qid}`) ?? '').trim();
  if (!reason) return toast('Add a short explanation for dismissing this question.');
  drafts.delete(`dismiss-${qid}`);
  setStatus(qid, 'dismissed', reason);
}

// ---------------- answers ----------------

export function sampleAnswerFor(qid: string): string | null {
  const s = state.session;
  if (!s?.demoId || s.analysis?.mode !== 'demo') return null;
  return DEMO_ANSWERS.find((d) => d.reportId === s.demoId && d.questionId === qid)?.answer ?? null;
}

export function insertSample(qid: string) {
  const a = sampleAnswerFor(qid);
  if (!a) return;
  drafts.set(`answer-${qid}`, a);
  render();
}

export function addAttachmentField(qid: string) {
  state.ui.attachmentCount[qid] = (state.ui.attachmentCount[qid] ?? 0) + 1;
  render();
}

export function removeAttachmentField(qid: string, n: number) {
  const count = state.ui.attachmentCount[qid] ?? 0;
  for (let i = n; i < count - 1; i++) {
    drafts.set(`attl-${qid}-${i}`, drafts.get(`attl-${qid}-${i + 1}`) ?? '');
    drafts.set(`attt-${qid}-${i}`, drafts.get(`attt-${qid}-${i + 1}`) ?? '');
  }
  drafts.delete(`attl-${qid}-${count - 1}`);
  drafts.delete(`attt-${qid}-${count - 1}`);
  state.ui.attachmentCount[qid] = Math.max(0, count - 1);
  render();
}

export function addAnswer(qid: string) {
  const text = (drafts.get(`answer-${qid}`) ?? '').trim();
  if (!text) return toast('Paste or type the appraiser’s answer first.');
  const count = state.ui.attachmentCount[qid] ?? 0;
  const attachments: Attachment[] = [];
  for (let i = 0; i < count; i++) {
    const t = (drafts.get(`attt-${qid}-${i}`) ?? '').trim();
    if (t) attachments.push({ id: uid('x'), label: (drafts.get(`attl-${qid}-${i}`) ?? '').trim() || `Explanation ${i + 1}`, text: t });
  }
  mutate(() => {
    const q = findQ(qid);
    if (!q) return;
    const entry: ThreadAnswer = { type: 'answer', id: uid('t'), at: now(), text, attachments, respondsTo: pendingFollowUp(q)?.id ?? null };
    q.thread.push(entry);
    if (q.status === 'open' || q.status === 'selected') {
      q.thread.push({ type: 'status', id: uid('t'), at: now(), from: q.status, to: 'answered', reason: null });
      q.status = 'answered';
    }
  });
  drafts.delete(`answer-${qid}`);
  for (let i = 0; i < count; i++) {
    drafts.delete(`attl-${qid}-${i}`);
    drafts.delete(`attt-${qid}-${i}`);
  }
  state.ui.attachmentCount[qid] = 0;
  render();
}

export function answerAnalysisMode(qid: string, answer: ThreadAnswer): 'live' | 'demo' | null {
  const s = state.session;
  if (!s?.analysis) return null;
  if (s.analysis.mode === 'demo') {
    const sample = DEMO_ANSWERS.find((d) => d.reportId === s.demoId && d.questionId === qid);
    if (sample && normalizeForCompare(sample.answer) === normalizeForCompare(answer.text) && answer.attachments.length === 0 && answer.respondsTo === null) {
      return 'demo';
    }
  }
  return state.status?.live ? 'live' : null;
}

export async function runAnswerAnalysis(qid: string, answerId: string) {
  const s = state.session;
  const a = s?.analysis;
  const q = findQ(qid);
  const answer = q?.thread.find((t): t is ThreadAnswer => t.type === 'answer' && t.id === answerId);
  if (!s || !a || !q || !answer) return;
  const mode = answerAnalysisMode(qid, answer);
  if (!mode) return;
  if (mode === 'demo') {
    const sample = DEMO_ANSWERS.find((d) => d.reportId === s.demoId && d.questionId === qid)!;
    mutate(() => {
      q.thread.push({ type: 'analysis', id: uid('t'), at: now(), answerId, mode: 'demo', model: null, result: JSON.parse(JSON.stringify(sample.analysis)), warnings: [] });
    });
    return;
  }
  state.ui.answerBusy[qid] = true;
  state.ui.answerError[qid] = null;
  render();
  try {
    const follow = answer.respondsTo ? q.thread.find((t) => t.id === answer.respondsTo) : null;
    const out = await api.analyzeAnswer({
      reportText: a.text,
      question: {
        title: qTitle(q),
        question: follow && follow.type === 'followup' ? `${qText(q)}\n\nFollow-up question now being answered: ${follow.text}` : qText(q),
        kind: q.ai.kind,
        category: q.ai.category,
        quotes: q.ai.quotes.map((x) => ({ text: x.text, note: x.note })),
      },
      history: historyForModel(q, answerId),
      answer: { text: answer.text, attachments: answer.attachments.map((x) => ({ label: x.label, text: x.text })) },
    });
    if (state.session !== s) return;
    mutate(() => {
      q.thread.push({ type: 'analysis', id: uid('t'), at: now(), answerId, mode: 'live', model: out.model, result: out.result, warnings: out.warnings });
    });
  } catch (err) {
    state.ui.answerError[qid] = isClientError(err) ? err : { code: 'invalid_structure', message: (err as Error).message, retryable: true };
  } finally {
    state.ui.answerBusy[qid] = false;
    render();
  }
}

export function addFollowUp(qid: string, fromAnalysisId: string | null) {
  const text = (drafts.get(`follow-${qid}`) ?? '').trim();
  if (!text) return toast('The follow-up question is empty.');
  mutate(() => {
    const q = findQ(qid);
    if (!q) return;
    q.thread.push({ type: 'followup', id: uid('t'), at: now(), text, fromAnalysisId });
    if (q.status !== 'selected') {
      q.thread.push({ type: 'status', id: uid('t'), at: now(), from: q.status, to: 'selected', reason: 'Follow-up question added' });
      q.status = 'selected';
    }
    q.include = true;
  });
  drafts.delete(`follow-${qid}`);
  render();
}

export function addNote(qid: string) {
  const text = (drafts.get(`note-${qid}`) ?? '').trim();
  if (!text) return;
  mutate(() => {
    findQ(qid)?.thread.push({ type: 'note', id: uid('t'), at: now(), text });
  });
  drafts.delete(`note-${qid}`);
  render();
}

// ---------------- persistence & export ----------------

export function saveOnDevice() {
  mutate((s) => (s.savedOnDevice = true));
  toast('Saved on this device. Further changes are saved automatically.');
}

export function stopSaving() {
  const s = state.session;
  if (!s) return;
  confirm({
    title: 'Remove from this device?',
    message: 'The saved copy will be deleted from this browser. The session stays open until you close it; unsaved work will be lost when you leave.',
    confirmLabel: 'Remove saved copy',
    danger: true,
    onConfirm: () => {
      storage.removeSaved(s.id);
      s.savedOnDevice = false;
      state.saved = storage.listSaved();
      render();
    },
  });
}

export function deleteSession() {
  const s = state.session;
  if (!s) return;
  confirm({
    title: 'Delete this session?',
    message: 'The report text, analysis, questions, answers and notes will be removed from this app and from this device. Export to JSON first if you want to keep a copy.',
    confirmLabel: 'Delete session',
    danger: true,
    onConfirm: () => {
      storage.removeSaved(s.id);
      state.session = null;
      drafts.clear();
      go('start');
    },
  });
}

export async function copyQuestions() {
  const s = state.session;
  if (!s) return;
  const text = questionsPlainText(s);
  try {
    await navigator.clipboard.writeText(text);
    toast('Questions copied to the clipboard.');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? 'Questions copied to the clipboard.' : 'Copy failed. Use the HTML download instead.');
  }
}

export function downloadSummary() {
  const s = state.session;
  if (!s) return;
  downloadFile(`second-look-summary-${slug(s.title)}.html`, standaloneHtml(s), 'text/html;charset=utf-8');
}

export function exportJson() {
  const s = state.session;
  if (!s) return;
  const payload = { format: 'second-look-session', exportedAt: now(), session: s };
  downloadFile(`second-look-${slug(s.title)}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

export async function importJson(file: File) {
  let data: any;
  try {
    data = JSON.parse(await file.text());
  } catch {
    state.ui.startError = `${file.name} is not valid JSON.`;
    return render();
  }
  const s = data?.format === 'second-look-session' ? data.session : null;
  if (!s || s.version !== 1 || typeof s.originalText !== 'string' || typeof s.title !== 'string') {
    state.ui.startError = `${file.name} is not a Second Look review export.`;
    return render();
  }
  try {
    if (s.analysis) s.analysis.result = validateAnalysis(s.analysis.result);
    for (const a of s.archived ?? []) a.result = validateAnalysis(a.result);
  } catch (err) {
    state.ui.startError = `${file.name}: the saved analysis is damaged (${(err as Error).message}).`;
    return render();
  }
  const session: Session = {
    ...s,
    id: storage.loadSaved(s.id) ? uid('s') : s.id,
    archived: s.archived ?? [],
    savedOnDevice: s.kind === 'demo',
    source: { ...s.source, type: s.source?.type ?? 'import', emptyPages: s.source?.emptyPages ?? [], warnings: s.source?.warnings ?? [] },
  };
  openSession(session, session.analysis ? 'workspace' : 'source');
  if (session.savedOnDevice) touch();
  toast('Review imported.' + (session.kind === 'user' ? ' It is not saved on this device until you choose “Save on this device”.' : ''));
}

export function printSummary() {
  window.print();
}

export function hasUnsavedWork(): boolean {
  const s = state.session;
  return !!s && s.kind === 'user' && !s.savedOnDevice;
}

export { DEMO_REPORTS };
