// Shared data model for Second Look. Used by the browser client, the server and tests.

export type QuestionKind =
  | 'direct_contradiction'
  | 'methodology'
  | 'undisclosed_assumption'
  | 'not_found_in_report';

export const QUESTION_KINDS: QuestionKind[] = [
  'direct_contradiction',
  'methodology',
  'undisclosed_assumption',
  'not_found_in_report',
];

export const KIND_LABELS: Record<QuestionKind, string> = {
  direct_contradiction: 'Direct contradiction',
  methodology: 'Methodology question',
  undisclosed_assumption: 'Insufficiently disclosed assumption',
  not_found_in_report: 'Not found in the supplied report',
};

export type QuestionCategory =
  | 'comparable_selection'
  | 'comparable_differences'
  | 'adjustments'
  | 'market_data'
  | 'price_basis'
  | 'assumptions'
  | 'condition'
  | 'description'
  | 'documentation'
  | 'arithmetic'
  | 'internal_consistency'
  | 'reconciliation'
  | 'other';

export const QUESTION_CATEGORIES: QuestionCategory[] = [
  'comparable_selection',
  'comparable_differences',
  'adjustments',
  'market_data',
  'price_basis',
  'assumptions',
  'condition',
  'description',
  'documentation',
  'arithmetic',
  'internal_consistency',
  'reconciliation',
  'other',
];

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  comparable_selection: 'Choice of comparables',
  comparable_differences: 'Differences between works',
  adjustments: 'Basis of adjustments',
  market_data: 'Currency of market data',
  price_basis: 'Price basis',
  assumptions: 'Assumptions',
  condition: 'Condition',
  description: 'Description of the work',
  documentation: 'Supporting documentation',
  arithmetic: 'Arithmetic',
  internal_consistency: 'Internal consistency',
  reconciliation: 'From data to conclusion',
  other: 'Other',
};

export interface FactField {
  value: string | null;
  quote: string | null;
}

export interface ReportFacts {
  subject: FactField;
  appraiser: FactField;
  purpose: FactField;
  basisOfValue: FactField;
  valuationDate: FactField;
  reportDate: FactField;
  currency: FactField;
  concludedValue: FactField;
}

export const FACT_LABELS: Record<keyof ReportFacts, string> = {
  subject: 'Subject',
  appraiser: 'Prepared by',
  purpose: 'Purpose / intended use',
  basisOfValue: 'Stated basis of value',
  valuationDate: 'Effective date of valuation',
  reportDate: 'Report date',
  currency: 'Currency',
  concludedValue: 'Concluded value',
};

export interface KeyConclusion {
  text: string;
  quote: string;
}

export interface Comparable {
  label: string;
  description: string;
  price: string;
  priceBasis: string;
  saleDate: string;
  quote: string;
}

export interface Adjustment {
  appliesTo: string;
  description: string;
  quote: string;
}

export interface Assumption {
  text: string;
  quote: string;
}

export interface EvidenceQuote {
  text: string;
  role: 'primary' | 'related';
  note: string;
}

export interface PartialExplanation {
  quote: string;
  explains: string;
  remainsUnclear: string;
}

export interface GeneratedQuestion {
  id: string;
  title: string;
  question: string;
  kind: QuestionKind;
  category: QuestionCategory;
  quotes: EvidenceQuote[];
  whyItMatters: string;
  clarifies: string;
  checkedElsewhere: string;
  partialExplanation: PartialExplanation | null;
}

export interface ExplainedPoint {
  topic: string;
  note: string;
  quote: string;
}

export interface ReviewScope {
  coverage: string;
  limitations: string[];
}

export interface AnalysisResult {
  facts: ReportFacts;
  conclusions: KeyConclusion[];
  comparables: Comparable[];
  adjustments: Adjustment[];
  assumptions: Assumption[];
  questions: GeneratedQuestion[];
  explainedPoints: ExplainedPoint[];
  noQuestionsReason: string | null;
  scope: ReviewScope;
}

export type AnswerAssessment = 'addresses' | 'partially_addresses' | 'does_not_address';

export const ASSESSMENT_LABELS: Record<AnswerAssessment, string> = {
  addresses: 'Answer addresses the question',
  partially_addresses: 'Answer partly addresses the question',
  does_not_address: 'Answer does not address the question',
};

export interface AnswerExplains {
  point: string;
  answerQuote: string;
}

export type StatementRelation = 'new' | 'consistent_with_report' | 'conflicts_with_report';

export interface AnswerStatement {
  statement: string;
  answerQuote: string;
  relation: StatementRelation;
  reportQuote: string | null;
}

export interface AnswerAnalysisResult {
  assessment: AnswerAssessment;
  summary: string;
  explains: AnswerExplains[];
  newStatements: AnswerStatement[];
  unclear: string[];
  followUp: {
    warranted: boolean;
    reason: string;
    question: string | null;
  };
}

// ---------- API payloads ----------

export interface StatusResponse {
  live: boolean;
  provider: string | null;
  model: string | null;
  reason: string | null;
}

export interface AnalyzeRequest {
  title: string;
  text: string;
}

export interface AnalyzeResponse {
  result: AnalysisResult;
  model: string;
  provider: string;
  analyzedChars: number;
  truncated: boolean;
  warnings: string[];
}

export interface ThreadItemForModel {
  type: 'answer' | 'followup' | 'note' | 'analysis';
  text: string;
}

export interface AnalyzeAnswerRequest {
  reportText: string;
  question: {
    title: string;
    question: string;
    kind: QuestionKind;
    category: QuestionCategory;
    quotes: { text: string; note: string }[];
  };
  history: ThreadItemForModel[];
  answer: {
    text: string;
    attachments: { label: string; text: string }[];
  };
}

export interface AnalyzeAnswerResponse {
  result: AnswerAnalysisResult;
  model: string;
  provider: string;
  warnings: string[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
