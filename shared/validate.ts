// Runtime validation of structured model output. Anything that does not match the expected
// shape is rejected (with a readable path) rather than silently coerced.

import {
  AnalysisResult,
  AnswerAnalysisResult,
  AnswerAssessment,
  FactField,
  GeneratedQuestion,
  QUESTION_CATEGORIES,
  QUESTION_KINDS,
  QuestionCategory,
  QuestionKind,
  ReportFacts,
  StatementRelation,
} from './types.js';

export class ValidationError extends Error {
  constructor(public path: string, message: string) {
    super(`${path}: ${message}`);
  }
}

type Obj = Record<string, unknown>;

function obj(v: unknown, path: string): Obj {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new ValidationError(path, 'expected an object');
  return v as Obj;
}

function str(v: unknown, path: string, maxLen = 4000): string {
  if (typeof v !== 'string') throw new ValidationError(path, 'expected a string');
  return v.trim().slice(0, maxLen);
}

function nstr(v: unknown, path: string, maxLen = 4000): string | null {
  if (v === null || v === undefined) return null;
  const s = str(v, path, maxLen);
  return s.length ? s : null;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new ValidationError(path, 'expected a boolean');
  return v;
}

function arr<T>(v: unknown, path: string, item: (x: unknown, p: string) => T, max = 50): T[] {
  if (!Array.isArray(v)) throw new ValidationError(path, 'expected an array');
  return v.slice(0, max).map((x, i) => item(x, `${path}[${i}]`));
}

function oneOf<T extends string>(v: unknown, path: string, allowed: readonly T[]): T {
  if (typeof v !== 'string' || !allowed.includes(v as T)) {
    throw new ValidationError(path, `expected one of ${allowed.join(', ')}`);
  }
  return v as T;
}

function fact(v: unknown, path: string): FactField {
  const o = obj(v, path);
  return { value: nstr(o.value, `${path}.value`, 400), quote: nstr(o.quote, `${path}.quote`, 1200) };
}

export const MAX_QUESTIONS = 8;

export function validateAnalysis(raw: unknown): AnalysisResult {
  const o = obj(raw, 'result');
  const f = obj(o.facts, 'facts');
  const facts: ReportFacts = {
    subject: fact(f.subject, 'facts.subject'),
    appraiser: fact(f.appraiser, 'facts.appraiser'),
    purpose: fact(f.purpose, 'facts.purpose'),
    basisOfValue: fact(f.basisOfValue, 'facts.basisOfValue'),
    valuationDate: fact(f.valuationDate, 'facts.valuationDate'),
    reportDate: fact(f.reportDate, 'facts.reportDate'),
    currency: fact(f.currency, 'facts.currency'),
    concludedValue: fact(f.concludedValue, 'facts.concludedValue'),
  };
  const questions: GeneratedQuestion[] = arr(
    o.questions,
    'questions',
    (q, p) => {
      const qo = obj(q, p);
      const pe = qo.partialExplanation;
      return {
        id: '',
        title: str(qo.title, `${p}.title`, 200),
        question: str(qo.question, `${p}.question`, 2000),
        kind: oneOf<QuestionKind>(qo.kind, `${p}.kind`, QUESTION_KINDS),
        category: oneOf<QuestionCategory>(qo.category, `${p}.category`, QUESTION_CATEGORIES),
        quotes: arr(qo.quotes, `${p}.quotes`, (e, ep) => {
          const eo = obj(e, ep);
          return {
            text: str(eo.text, `${ep}.text`, 1500),
            role: oneOf(eo.role, `${ep}.role`, ['primary', 'related'] as const),
            note: str(eo.note, `${ep}.note`, 600),
          };
        }, 4),
        whyItMatters: str(qo.whyItMatters, `${p}.whyItMatters`, 1500),
        clarifies: str(qo.clarifies, `${p}.clarifies`, 800),
        checkedElsewhere: str(qo.checkedElsewhere, `${p}.checkedElsewhere`, 1200),
        partialExplanation:
          pe === null || pe === undefined
            ? null
            : (() => {
                const po = obj(pe, `${p}.partialExplanation`);
                return {
                  quote: str(po.quote, `${p}.partialExplanation.quote`, 1500),
                  explains: str(po.explains, `${p}.partialExplanation.explains`, 800),
                  remainsUnclear: str(po.remainsUnclear, `${p}.partialExplanation.remainsUnclear`, 800),
                };
              })(),
      };
    },
    MAX_QUESTIONS,
  );
  questions.forEach((q, i) => {
    q.id = `q${i + 1}`;
    if (q.quotes.length === 0) throw new ValidationError(`questions[${i}].quotes`, 'at least one quotation is required');
  });
  const sc = obj(o.scope, 'scope');
  return {
    facts,
    conclusions: arr(o.conclusions, 'conclusions', (c, p) => {
      const co = obj(c, p);
      return { text: str(co.text, `${p}.text`, 800), quote: str(co.quote, `${p}.quote`, 1500) };
    }, 12),
    comparables: arr(o.comparables, 'comparables', (c, p) => {
      const co = obj(c, p);
      return {
        label: str(co.label, `${p}.label`, 60),
        description: str(co.description, `${p}.description`, 400),
        price: str(co.price, `${p}.price`, 80),
        priceBasis: str(co.priceBasis, `${p}.priceBasis`, 200),
        saleDate: str(co.saleDate, `${p}.saleDate`, 60),
        quote: str(co.quote, `${p}.quote`, 1500),
      };
    }, 20),
    adjustments: arr(o.adjustments, 'adjustments', (c, p) => {
      const co = obj(c, p);
      return {
        appliesTo: str(co.appliesTo, `${p}.appliesTo`, 80),
        description: str(co.description, `${p}.description`, 400),
        quote: str(co.quote, `${p}.quote`, 1500),
      };
    }, 20),
    assumptions: arr(o.assumptions, 'assumptions', (c, p) => {
      const co = obj(c, p);
      return { text: str(co.text, `${p}.text`, 600), quote: str(co.quote, `${p}.quote`, 1500) };
    }, 20),
    questions,
    explainedPoints: arr(o.explainedPoints, 'explainedPoints', (c, p) => {
      const co = obj(c, p);
      return {
        topic: str(co.topic, `${p}.topic`, 200),
        note: str(co.note, `${p}.note`, 800),
        quote: str(co.quote, `${p}.quote`, 1500),
      };
    }, 12),
    noQuestionsReason: nstr(o.noQuestionsReason, 'noQuestionsReason', 1200),
    scope: {
      coverage: str(sc.coverage, 'scope.coverage', 1500),
      limitations: arr(sc.limitations, 'scope.limitations', (x, p) => str(x, p, 600), 12),
    },
  };
}

export function validateAnswerAnalysis(raw: unknown): AnswerAnalysisResult {
  const o = obj(raw, 'result');
  const fu = obj(o.followUp, 'followUp');
  const warranted = bool(fu.warranted, 'followUp.warranted');
  const question = nstr(fu.question, 'followUp.question', 1500);
  return {
    assessment: oneOf<AnswerAssessment>(o.assessment, 'assessment', [
      'addresses',
      'partially_addresses',
      'does_not_address',
    ]),
    summary: str(o.summary, 'summary', 1500),
    explains: arr(o.explains, 'explains', (x, p) => {
      const xo = obj(x, p);
      return { point: str(xo.point, `${p}.point`, 800), answerQuote: str(xo.answerQuote, `${p}.answerQuote`, 1500) };
    }, 10),
    newStatements: arr(o.newStatements, 'newStatements', (x, p) => {
      const xo = obj(x, p);
      return {
        statement: str(xo.statement, `${p}.statement`, 800),
        answerQuote: str(xo.answerQuote, `${p}.answerQuote`, 1500),
        relation: oneOf<StatementRelation>(xo.relation, `${p}.relation`, [
          'new',
          'consistent_with_report',
          'conflicts_with_report',
        ]),
        reportQuote: nstr(xo.reportQuote, `${p}.reportQuote`, 1500),
      };
    }, 10),
    unclear: arr(o.unclear, 'unclear', (x, p) => str(x, p, 800), 10),
    followUp: {
      warranted: warranted && !!question,
      reason: str(fu.reason, 'followUp.reason', 1000),
      question: warranted ? question : null,
    },
  };
}
