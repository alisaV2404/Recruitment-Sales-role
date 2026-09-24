import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractPdfText, PdfError } from '../src/pdf.js';
import { locateQuote } from '../shared/quotes.js';

const fixture = (name: string) => readFileSync(new URL(`../../../tests/fixtures/${name}`, import.meta.url));

test('extracts text from a Chromium-generated PDF with page markers', async () => {
  const r = await extractPdfText(fixture('text-report.pdf'));
  assert.equal(r.pageCount, 3);
  assert.deepEqual(r.emptyPages, []);
  assert.ok(r.text.startsWith('--- Page 1 ---'));
  assert.ok(locateQuote(r.text, 'The canvas has been relined.').found);
  assert.ok(locateQuote(r.text, 'Dimensions: 61 x 76 cm (24 x 30 in), unframed').found);
  assert.ok(locateQuote(r.text, 'Average of adjusted values: USD 51,600').found);
});

test('reports image-only PDFs honestly instead of inventing text', async () => {
  const r = await extractPdfText(fixture('scanned.pdf'));
  assert.equal(r.pagesWithText, 0);
  assert.deepEqual(r.emptyPages, [1]);
  assert.ok(r.warnings[0].includes('scanned images'));
});

test('rejects files that are not PDFs', async () => {
  await assert.rejects(extractPdfText(new TextEncoder().encode('hello world')), PdfError);
});
