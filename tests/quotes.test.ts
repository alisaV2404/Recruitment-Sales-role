import test from 'node:test';
import assert from 'node:assert/strict';
import { locateQuote, textHash } from '../shared/quotes.js';

const text = 'Line one of the report.\n\nThe canvas  has been\nrelined. It is “stable” — mostly.\n| C1 | 42,000 | +10% | 46,200 |';

test('finds exact text and returns original offsets', () => {
  const loc = locateQuote(text, 'Line one of the report.');
  assert.ok(loc.found);
  assert.equal(text.slice(loc.start, loc.end), 'Line one of the report.');
});

test('normalizes whitespace, typographic quotes, dashes and pipes', () => {
  assert.ok(locateQuote(text, 'The canvas has been relined.').found);
  assert.ok(locateQuote(text, 'It is "stable" - mostly.').found);
  assert.ok(locateQuote(text, 'C1 42,000 +10% 46,200').found);
});

test('rejects paraphrases and fabricated quotes', () => {
  assert.equal(locateQuote(text, 'The canvas was relined.').found, false);
  assert.equal(locateQuote(text, 'excellent condition').found, false);
  assert.equal(locateQuote(text, '').found, false);
  assert.equal(locateQuote(text, 'the').found, false);
});

test('supports ellipsis only when the parts occur in order', () => {
  assert.ok(locateQuote(text, 'Line one of the report ... has been relined').found);
  assert.equal(locateQuote(text, 'has been relined ... Line one of the report').found, false);
});

test('flags ambiguous quotes', () => {
  const t = 'repeat this sentence here. repeat this sentence here.';
  assert.ok(locateQuote(t, 'repeat this sentence').ambiguous);
});

test('hash changes when text changes', () => {
  assert.notEqual(textHash('abc'), textHash('abd'));
  assert.equal(textHash('abc'), textHash('abc'));
});
