import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAnswer, analyzeReport } from '../server/analysis.js';
import type { ModelProvider, StructuredRequest } from '../server/providers/types.js';
import { ProviderError } from '../server/providers/types.js';
import { DEMO_REPORTS } from '../src/demo/reports.js';
import { DEMO_ANALYSES, DEMO_ANSWERS } from '../src/demo/analyses.js';

function mock(data: unknown, seen: StructuredRequest[] = []): ModelProvider {
  return {
    name: 'mock',
    model: 'mock-model',
    async generateStructured(req) {
      seen.push(req);
      return { data: JSON.parse(JSON.stringify(data)), model: 'mock-model', notes: [] };
    },
  };
}

const report = DEMO_REPORTS[0];

test('analyzeReport validates output and passes the report as data', async () => {
  const seen: StructuredRequest[] = [];
  const out = await analyzeReport(mock(DEMO_ANALYSES[report.id], seen), { title: 'T', text: report.text });
  assert.equal(out.result.questions.length, DEMO_ANALYSES[report.id].questions.length);
  assert.deepEqual(out.warnings, []);
  assert.ok(seen[0].user.includes('<report>'));
  assert.ok(seen[0].system.includes('untrusted data'));
});

test('analyzeReport flags unverifiable quotations', async () => {
  const bad = JSON.parse(JSON.stringify(DEMO_ANALYSES[report.id]));
  bad.questions[0].quotes = [{ text: 'This sentence is not in the report at all.', role: 'primary', note: '' }];
  const out = await analyzeReport(mock(bad), { title: 'T', text: report.text });
  assert.ok(out.warnings.some((w) => w.includes('could not be matched')));
  assert.ok(out.warnings.some((w) => w.includes('no verified quotation')));
});

test('analyzeReport rejects malformed model output', async () => {
  await assert.rejects(
    analyzeReport(mock({ facts: {} }), { title: 'T', text: report.text }),
    (e: unknown) => e instanceof ProviderError && e.code === 'invalid_structure',
  );
});

test('analyzeReport caps questions at eight', async () => {
  const many = JSON.parse(JSON.stringify(DEMO_ANALYSES[report.id]));
  many.questions = [...many.questions, ...many.questions];
  const out = await analyzeReport(mock(many), { title: 'T', text: report.text });
  assert.equal(out.result.questions.length, 8);
});

test('analyzeReport refuses text that is too short', async () => {
  await assert.rejects(analyzeReport(mock({}), { title: 'T', text: 'short' }), (e: unknown) => e instanceof ProviderError && e.code === 'too_short');
});

test('analyzeAnswer validates and checks answer quotes', async () => {
  const d = DEMO_ANSWERS[0];
  const out = await analyzeAnswer(mock(d.analysis), {
    reportText: DEMO_REPORTS[1].text,
    question: { title: 'x', question: 'y', kind: 'methodology', category: 'adjustments', quotes: [] },
    history: [],
    answer: { text: d.answer, attachments: [] },
  });
  assert.equal(out.result.followUp.warranted, true);
  assert.deepEqual(out.warnings, []);
});
