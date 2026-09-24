import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_REPORTS } from '../src/demo/reports.js';
import { DEMO_ANALYSES, DEMO_ANSWERS } from '../src/demo/analyses.js';
import { locateQuote } from '../shared/quotes.js';
import { validateAnalysis, validateAnswerAnalysis } from '../shared/validate.js';

for (const report of DEMO_REPORTS) {
  test(`demo analysis for ${report.id}: every quotation occurs in the report`, () => {
    const a = DEMO_ANALYSES[report.id];
    assert.ok(a, 'analysis exists');
    const quotes: [string, string][] = [];
    for (const [k, f] of Object.entries(a.facts)) if (f.quote) quotes.push([`facts.${k}`, f.quote]);
    a.conclusions.forEach((c, i) => quotes.push([`conclusions[${i}]`, c.quote]));
    a.comparables.forEach((c, i) => quotes.push([`comparables[${i}]`, c.quote]));
    a.adjustments.forEach((c, i) => quotes.push([`adjustments[${i}]`, c.quote]));
    a.assumptions.forEach((c, i) => quotes.push([`assumptions[${i}]`, c.quote]));
    a.explainedPoints.forEach((c, i) => quotes.push([`explained[${i}]`, c.quote]));
    for (const q of a.questions) {
      q.quotes.forEach((e, i) => quotes.push([`${q.id}.quotes[${i}]`, e.text]));
      if (q.partialExplanation) quotes.push([`${q.id}.partial`, q.partialExplanation.quote]);
    }
    for (const [where, quote] of quotes) {
      const loc = locateQuote(report.text, quote);
      assert.ok(loc.found, `${report.id} ${where}: not found: ${quote}`);
    }
  });

  test(`demo analysis for ${report.id} passes the same validator as live output`, () => {
    const a = DEMO_ANALYSES[report.id];
    const v = validateAnalysis(JSON.parse(JSON.stringify(a)));
    assert.equal(v.questions.length, a.questions.length);
    assert.ok(v.questions.length <= 8);
  });
}

test('the consistent demo report has no questions but explains why', () => {
  assert.equal(DEMO_ANALYSES['demo-bronze'].questions.length, 0);
  assert.ok(DEMO_ANALYSES['demo-bronze'].noQuestionsReason);
});

test('the first demo report contains contradictions, an arithmetic issue and a not-found item', () => {
  const kinds = DEMO_ANALYSES['demo-harbour'].questions.map((q) => q.kind);
  const cats = DEMO_ANALYSES['demo-harbour'].questions.map((q) => q.category);
  assert.ok(kinds.includes('direct_contradiction'));
  assert.ok(kinds.includes('not_found_in_report'));
  assert.ok(cats.includes('arithmetic'));
});

test('demo arithmetic claims hold', () => {
  const mean = (46200 + 38750 + 54400 + 55000) / 4;
  assert.equal(mean, 48587.5);
  assert.equal(Math.round((10290 + 12420 + 11360 + 9975) / 4), 11011);
  assert.equal(0.5 * 12420 + 0.2 * 10290 + 0.2 * 9975 + 0.1 * 11360, 11399);
  assert.equal(Math.round(14200 * 0.84), 11928);
});

for (const ans of DEMO_ANSWERS) {
  test(`sample reply ${ans.reportId}/${ans.questionId}: quotes verify against answer and report`, () => {
    const report = DEMO_REPORTS.find((r) => r.id === ans.reportId)!;
    validateAnswerAnalysis(JSON.parse(JSON.stringify(ans.analysis)));
    for (const e of ans.analysis.explains) assert.ok(locateQuote(ans.answer, e.answerQuote).found, e.answerQuote);
    for (const s of ans.analysis.newStatements) {
      assert.ok(locateQuote(ans.answer, s.answerQuote).found, s.answerQuote);
      if (s.reportQuote) assert.ok(locateQuote(report.text, s.reportQuote).found, s.reportQuote);
    }
    assert.ok(DEMO_ANALYSES[ans.reportId].questions.some((q) => q.id === ans.questionId));
  });
}

test('exactly one sample reply leaves a point for follow-up', () => {
  const followUps = DEMO_ANSWERS.filter((a) => a.analysis.followUp.warranted);
  assert.equal(followUps.length, 1);
});
