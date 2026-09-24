// Client-side session model: the report, its versions, the analysis and the discussion.

import type {
  AnalysisResult,
  AnswerAnalysisResult,
  GeneratedQuestion,
  ThreadItemForModel,
} from '../shared/types.js';
import { locateQuote, QuoteLocation, textHash } from '../shared/quotes.js';
import { analyzeStructure, DocStructure, pageAt, sectionAt } from './sections.js';

export type QStatus = 'open' | 'selected' | 'answered' | 'resolved' | 'dismissed';

export const STATUS_LABELS: Record<QStatus, string> = {
  open: 'Open',
  selected: 'Selected for follow-up',
  answered: 'Answer added',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
};

export interface Attachment {
  id: string;
  label: string;
  text: string;
}

export interface ThreadAnswer {
  type: 'answer';
  id: string;
  at: string;
  text: string;
  attachments: Attachment[];
  respondsTo: string | null; // follow-up id, or null for the original question
}
export interface ThreadFollowUp {
  type: 'followup';
  id: string;
  at: string;
  text: string;
  fromAnalysisId: string | null;
}
export interface ThreadAnalysis {
  type: 'analysis';
  id: string;
  at: string;
  answerId: string;
  mode: 'live' | 'demo';
  model: string | null;
  result: AnswerAnalysisResult;
  warnings: string[];
}
export interface ThreadNote {
  type: 'note';
  id: string;
  at: string;
  text: string;
}
export interface ThreadStatus {
  type: 'status';
  id: string;
  at: string;
  from: QStatus;
  to: QStatus;
  reason: string | null;
}
export type ThreadEntry = ThreadAnswer | ThreadFollowUp | ThreadAnalysis | ThreadNote | ThreadStatus;

export interface QuestionState {
  id: string;
  ai: GeneratedQuestion;
  title: string | null; // user edit
  text: string | null; // user edit
  status: QStatus;
  include: boolean;
  dismissReason: string | null;
  thread: ThreadEntry[];
}

export interface AnalysisRecord {
  id: string;
  mode: 'live' | 'demo';
  provider: string | null;
  model: string | null;
  createdAt: string;
  textVersion: 'original' | 'corrected';
  textHash: string;
  text: string;
  truncated: boolean;
  warnings: string[];
  result: AnalysisResult;
  questions: QuestionState[];
}

export interface SourceInfo {
  type: 'paste' | 'txt' | 'pdf' | 'demo' | 'import';
  fileName: string | null;
  pageCount: number | null;
  emptyPages: number[];
  warnings: string[];
}

export interface Session {
  version: 1;
  id: string;
  kind: 'demo' | 'user';
  demoId: string | null;
  title: string;
  source: SourceInfo;
  originalText: string;
  correctedText: string | null;
  analysis: AnalysisRecord | null;
  archived: AnalysisRecord[];
  savedOnDevice: boolean;
  createdAt: string;
  updatedAt: string;
}

export function workingText(s: Session): string {
  return s.correctedText ?? s.originalText;
}

export function workingVersion(s: Session): 'original' | 'corrected' {
  return s.correctedText !== null ? 'corrected' : 'original';
}

export function isStale(s: Session): boolean {
  return !!s.analysis && s.analysis.textHash !== textHash(workingText(s));
}

export function qTitle(q: QuestionState): string {
  return q.title ?? q.ai.title;
}
export function qText(q: QuestionState): string {
  return q.text ?? q.ai.question;
}
export function isEdited(q: QuestionState): boolean {
  return q.title !== null || q.text !== null;
}

export function isOpen(q: QuestionState): boolean {
  return q.status !== 'resolved' && q.status !== 'dismissed';
}

export function counts(a: AnalysisRecord | null) {
  const qs = a?.questions ?? [];
  return {
    total: qs.length,
    open: qs.filter(isOpen).length,
    resolved: qs.filter((q) => q.status === 'resolved').length,
    dismissed: qs.filter((q) => q.status === 'dismissed').length,
    selected: qs.filter((q) => q.status === 'selected').length,
    included: qs.filter((q) => q.include && q.status !== 'dismissed').length,
  };
}

export function newQuestionStates(result: AnalysisResult): QuestionState[] {
  return result.questions.map((q) => ({
    id: q.id,
    ai: q,
    title: null,
    text: null,
    status: 'open',
    include: false,
    dismissReason: null,
    thread: [],
  }));
}

// ---------- quote verification (cached per analysis text) ----------

export interface VerifiedQuote {
  text: string;
  note: string;
  role: 'primary' | 'related';
  loc: QuoteLocation;
  section: string | null;
  page: number | null;
}

const structCache = new Map<string, DocStructure>();
export function structureOf(text: string): DocStructure {
  const key = textHash(text);
  let s = structCache.get(key);
  if (!s) {
    if (structCache.size > 10) structCache.clear();
    s = analyzeStructure(text);
    structCache.set(key, s);
  }
  return s;
}

export function verify(text: string, quote: string, note = '', role: 'primary' | 'related' = 'primary'): VerifiedQuote {
  const loc = locateQuote(text, quote);
  const st = structureOf(text);
  return {
    text: quote,
    note,
    role,
    loc,
    section: loc.found ? sectionAt(st, loc.start)?.title ?? null : null,
    page: loc.found ? pageAt(st, loc.start) : null,
  };
}

export function questionQuotes(a: AnalysisRecord, q: QuestionState): VerifiedQuote[] {
  return q.ai.quotes.map((e) => verify(a.text, e.text, e.note, e.role));
}

export function hasVerifiedBasis(a: AnalysisRecord, q: QuestionState): boolean {
  return questionQuotes(a, q).some((v) => v.loc.found);
}

// ---------- history for answer analysis ----------

export function historyForModel(q: QuestionState, uptoAnswerId: string): ThreadItemForModel[] {
  const out: ThreadItemForModel[] = [];
  for (const e of q.thread) {
    if (e.type === 'answer' && e.id === uptoAnswerId) break;
    if (e.type === 'answer') {
      const att = e.attachments.map((a) => `\n[Attachment: ${a.label}]\n${a.text}`).join('');
      out.push({ type: 'answer', text: e.text + att });
    } else if (e.type === 'followup') out.push({ type: 'followup', text: e.text });
    else if (e.type === 'note') out.push({ type: 'note', text: `Reviewer note: ${e.text}` });
    else if (e.type === 'analysis') {
      out.push({
        type: 'analysis',
        text: `${e.result.summary}${e.result.unclear.length ? ` Still unclear: ${e.result.unclear.join(' ')}` : ''}`,
      });
    }
  }
  return out;
}

export function latestAnswer(q: QuestionState): ThreadAnswer | null {
  for (let i = q.thread.length - 1; i >= 0; i--) {
    const e = q.thread[i];
    if (e.type === 'answer') return e;
  }
  return null;
}

export function analysisFor(q: QuestionState, answerId: string): ThreadAnalysis | null {
  for (let i = q.thread.length - 1; i >= 0; i--) {
    const e = q.thread[i];
    if (e.type === 'analysis' && e.answerId === answerId) return e;
  }
  return null;
}

export function pendingFollowUp(q: QuestionState): ThreadFollowUp | null {
  // a follow-up that has not been answered yet
  let last: ThreadFollowUp | null = null;
  for (const e of q.thread) {
    if (e.type === 'followup') last = e;
    if (e.type === 'answer' && last && e.respondsTo === last.id) last = null;
  }
  return last;
}

// Table rows are quoted verbatim; for display, drop the pipes.
export function displayQuote(quote: string): string {
  const t = quote.trim();
  return /^\|.*\|$/.test(t) ? t.slice(1, -1).trim().split(/\s*\|\s*/).join(' \u00b7 ') : t;
}
