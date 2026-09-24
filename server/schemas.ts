// JSON Schemas passed to the model as structured-output formats.
// They mirror shared/types.ts; the response is additionally validated by shared/validate.ts.

import { QUESTION_CATEGORIES, QUESTION_KINDS } from '../shared/types.js';

type Schema = Record<string, unknown>;

const s = (description?: string): Schema => (description ? { type: 'string', description } : { type: 'string' });
const ns = (description: string): Schema => ({ anyOf: [{ type: 'string' }, { type: 'null' }], description });
const o = (properties: Record<string, Schema>, description?: string): Schema => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const a = (items: Schema, description?: string): Schema => ({
  type: 'array',
  ...(description ? { description } : {}),
  items,
});

const VERBATIM = 'Exact, contiguous excerpt copied verbatim from the report text (no paraphrase).';

const fact = (what: string): Schema =>
  o(
    {
      value: ns(`${what}, as stated in the report; null if not stated.`),
      quote: ns(`${VERBATIM} Null if the value is not stated.`),
    },
    what,
  );

export const analysisSchema: Schema = o({
  facts: o({
    subject: fact('The appraised work (artist, title, date, medium)'),
    appraiser: fact('The appraiser or firm that prepared the report'),
    purpose: fact('Purpose and intended use of the appraisal'),
    basisOfValue: fact('Stated basis or type of value (e.g. fair market value, replacement value)'),
    valuationDate: fact('Effective date of valuation'),
    reportDate: fact('Date of the report'),
    currency: fact('Currency of the stated values'),
    concludedValue: fact('Concluded value with currency'),
  }),
  conclusions: a(o({ text: s('Short restatement of a key conclusion.'), quote: s(VERBATIM) })),
  comparables: a(
    o({
      label: s('Label used in the report, e.g. "C1".'),
      description: s('Work, technique, size, edition or cast as stated.'),
      price: s('Price with currency, as stated.'),
      priceBasis: s('Hammer, incl. premium, dealer asking, gallery sale, etc., or "not stated".'),
      saleDate: s('Sale date as stated, or "not stated".'),
      quote: s(VERBATIM),
    }),
  ),
  adjustments: a(o({ appliesTo: s(), description: s(), quote: s(VERBATIM) })),
  assumptions: a(o({ text: s(), quote: s(VERBATIM) })),
  questions: a(
    o({
      title: s('Short neutral title, max ~8 words.'),
      question: s('The question to the appraiser, specific and answerable, in professional neutral tone.'),
      kind: { type: 'string', enum: QUESTION_KINDS },
      category: { type: 'string', enum: QUESTION_CATEGORIES },
      quotes: a(
        o({
          text: s(VERBATIM),
          role: { type: 'string', enum: ['primary', 'related'] },
          note: s('What this fragment shows in relation to the question.'),
        }),
        'One or more fragments. For a direct contradiction, include both conflicting fragments.',
      ),
      whyItMatters: s('Why the answer matters for the conclusion, grounded in the report.'),
      clarifies: s('Which part of the reasoning the answer would clarify.'),
      checkedElsewhere: s('Where else in the report (other sections, appendices, tables) you looked for an answer and what you found.'),
      partialExplanation: {
        anyOf: [
          o({
            quote: s(VERBATIM),
            explains: s('What this passage already explains.'),
            remainsUnclear: s('What specifically remains unclear.'),
          }),
          { type: 'null' },
        ],
      },
    }),
  ),
  explainedPoints: a(
    o({
      topic: s('A point that might look questionable at first sight.'),
      note: s('Where and how the report explains it, so no question is needed.'),
      quote: s(VERBATIM),
    }),
  ),
  noQuestionsReason: ns('If questions is empty, explain briefly what was checked; otherwise null.'),
  scope: o({
    coverage: s('What text was reviewed and what checks were performed.'),
    limitations: a(s(), 'Limits of this review: e.g. missing appendices, images not available, text-only review.'),
  }),
});

export const answerAnalysisSchema: Schema = o({
  assessment: { type: 'string', enum: ['addresses', 'partially_addresses', 'does_not_address'] },
  summary: s('Two or three sentences on how the answer relates to the question.'),
  explains: a(o({ point: s('What the answer explains.'), answerQuote: s('Exact excerpt from the answer or attachment.') })),
  newStatements: a(
    o({
      statement: s('A factual statement made in the answer.'),
      answerQuote: s('Exact excerpt from the answer or attachment.'),
      relation: { type: 'string', enum: ['new', 'consistent_with_report', 'conflicts_with_report'] },
      reportQuote: ns(`If relation is consistent_with_report or conflicts_with_report: ${VERBATIM} Otherwise null.`),
    }),
  ),
  unclear: a(s(), 'What remains unclear after the answer.'),
  followUp: o({
    warranted: { type: 'boolean' },
    reason: s('Why a follow-up is or is not warranted.'),
    question: ns('A single focused follow-up question if warranted; otherwise null.'),
  }),
});
