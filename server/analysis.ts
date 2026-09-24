// Provider-independent analysis service: builds prompts, calls the provider, validates the
// structured response and checks every quotation against the text that was analyzed.

import { locateQuote } from '../shared/quotes.js';
import type {
  AnalyzeAnswerRequest,
  AnalyzeAnswerResponse,
  AnalyzeRequest,
  AnalyzeResponse,
} from '../shared/types.js';
import { ValidationError, validateAnalysis, validateAnswerAnalysis } from '../shared/validate.js';
import { ANALYSIS_SYSTEM, ANSWER_SYSTEM, analysisUserMessage, answerUserMessage } from './prompts.js';
import { analysisSchema, answerAnalysisSchema } from './schemas.js';
import { ModelProvider, ProviderError } from './providers/types.js';

export const MAX_REPORT_CHARS = 400_000;
export const MIN_REPORT_CHARS = 200;

export async function analyzeReport(provider: ModelProvider, req: AnalyzeRequest, signal?: AbortSignal): Promise<AnalyzeResponse> {
  const text = typeof req.text === 'string' ? req.text : '';
  const title = typeof req.title === 'string' ? req.title.slice(0, 200) : 'Untitled report';
  if (text.trim().length < MIN_REPORT_CHARS) {
    throw new ProviderError('too_short', `The report text is too short to analyze (minimum ${MIN_REPORT_CHARS} characters).`, false, 400);
  }
  const truncated = text.length > MAX_REPORT_CHARS;
  const analyzed = truncated ? text.slice(0, MAX_REPORT_CHARS) : text;
  const note = truncated
    ? `The document was truncated to its first ${MAX_REPORT_CHARS.toLocaleString('en-US')} characters. Content after that point was not supplied. State this in scope.limitations and do not assume anything about the missing part.`
    : null;

  const out = await provider.generateStructured({
    system: ANALYSIS_SYSTEM,
    user: analysisUserMessage(title, analyzed, note),
    schema: analysisSchema,
    maxTokens: 64000,
    signal,
  });

  let result;
  try {
    result = validateAnalysis(out.data);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new ProviderError('invalid_structure', `The model response did not match the expected structure (${err.message}).`, true);
    }
    throw err;
  }

  const warnings = [...out.notes];
  let unverified = 0;
  let unsupportedQuestions = 0;
  for (const q of result.questions) {
    const ok = q.quotes.filter((qt) => locateQuote(analyzed, qt.text).found).length;
    unverified += q.quotes.length - ok;
    if (ok === 0) unsupportedQuestions++;
  }
  if (unverified) warnings.push(`${unverified} quotation(s) returned by the model could not be matched in the analyzed text and are not shown as evidence.`);
  if (unsupportedQuestions) warnings.push(`${unsupportedQuestions} question(s) have no verified quotation.`);
  if (truncated) {
    result.scope.limitations.unshift(
      `Only the first ${MAX_REPORT_CHARS.toLocaleString('en-US')} of ${text.length.toLocaleString('en-US')} characters were analyzed.`,
    );
  }

  return {
    result,
    model: out.model,
    provider: provider.name,
    analyzedChars: analyzed.length,
    truncated,
    warnings,
  };
}

export async function analyzeAnswer(provider: ModelProvider, req: AnalyzeAnswerRequest, signal?: AbortSignal): Promise<AnalyzeAnswerResponse> {
  if (!req || typeof req.reportText !== 'string' || !req.question || !req.answer || typeof req.answer.text !== 'string') {
    throw new ProviderError('bad_request', 'Malformed answer-analysis request.', false, 400);
  }
  if (!req.answer.text.trim()) {
    throw new ProviderError('bad_request', 'The answer is empty.', false, 400);
  }
  const safe: AnalyzeAnswerRequest = {
    reportText: req.reportText.slice(0, MAX_REPORT_CHARS),
    question: {
      title: String(req.question.title ?? '').slice(0, 300),
      question: String(req.question.question ?? '').slice(0, 3000),
      kind: req.question.kind,
      category: req.question.category,
      quotes: Array.isArray(req.question.quotes)
        ? req.question.quotes.slice(0, 4).map((q) => ({ text: String(q.text ?? '').slice(0, 1500), note: String(q.note ?? '').slice(0, 600) }))
        : [],
    },
    history: Array.isArray(req.history)
      ? req.history.slice(-30).map((h) => ({ type: h.type, text: String(h.text ?? '').slice(0, 8000) }))
      : [],
    answer: {
      text: req.answer.text.slice(0, 30000),
      attachments: Array.isArray(req.answer.attachments)
        ? req.answer.attachments.slice(0, 5).map((a) => ({ label: String(a.label ?? 'Attachment').slice(0, 120), text: String(a.text ?? '').slice(0, 30000) }))
        : [],
    },
  };

  const out = await provider.generateStructured({
    system: ANSWER_SYSTEM,
    user: answerUserMessage(safe),
    schema: answerAnalysisSchema,
    maxTokens: 32000,
    signal,
  });

  let result;
  try {
    result = validateAnswerAnalysis(out.data);
  } catch (err) {
    if (err instanceof ValidationError) {
      throw new ProviderError('invalid_structure', `The model response did not match the expected structure (${err.message}).`, true);
    }
    throw err;
  }
  const answerCorpus = [safe.answer.text, ...safe.answer.attachments.map((a) => a.text)].join('\n\n');
  let unverified = 0;
  for (const e of result.explains) if (!locateQuote(answerCorpus, e.answerQuote).found) unverified++;
  for (const s of result.newStatements) {
    if (!locateQuote(answerCorpus, s.answerQuote).found) unverified++;
    if (s.reportQuote && !locateQuote(safe.reportText, s.reportQuote).found) unverified++;
  }
  const warnings = [...out.notes];
  if (unverified) warnings.push(`${unverified} quotation(s) could not be matched and are marked as unverified.`);
  return { result, model: out.model, provider: provider.name, warnings };
}
