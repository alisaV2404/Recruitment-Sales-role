// End-to-end smoke test in Chromium (Playwright). Starts the app twice:
//   A) without a model key  -> Demo mode flows
//   B) with a local mock of the Anthropic Messages API (SSE) -> Live AI flows, incl. an error + retry
// Usage: npm run build && node scripts/e2e-smoke.mjs [screenshotDir]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const shots = process.argv[2] || 'build/e2e';
mkdirSync(shots, { recursive: true });

const { DEMO_REPORTS } = await import('../build/server/src/demo/reports.js');
const { DEMO_ANALYSES, DEMO_ANSWERS } = await import('../build/server/src/demo/analyses.js');

// ---------- mock Anthropic API ----------
let mockCalls = 0;
const mock = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    mockCalls++;
    const j = JSON.parse(body);
    assert.equal(req.headers['x-api-key'], 'test-key');
    assert.ok(j.output_config?.format?.schema, 'structured output schema sent');
    if (mockCalls === 1) {
      res.writeHead(529, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }));
    }
    const isAnswer = j.system.includes('answer-analysis engine');
    const data = isAnswer ? DEMO_ANSWERS[0].analysis : DEMO_ANALYSES['demo-harbour'];
    const text = JSON.stringify(data);
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const send = (ev, d) => res.write(`event: ${ev}\ndata: ${JSON.stringify({ type: ev, ...d })}\n\n`);
    send('message_start', { message: { model: j.model } });
    send('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '' } });
    send('content_block_stop', { index: 0 });
    send('content_block_start', { index: 1, content_block: { type: 'text', text: '' } });
    for (let i = 0; i < text.length; i += 500) send('content_block_delta', { index: 1, delta: { type: 'text_delta', text: text.slice(i, i + 500) } });
    send('content_block_stop', { index: 1 });
    send('message_delta', { delta: { stop_reason: 'end_turn' } });
    send('message_stop', {});
    res.end();
  });
});
await new Promise((r) => mock.listen(5191, r));

function startApp(port, env) {
  const p = spawn('node', ['build/server/server/index.js'], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  return new Promise((resolve) => p.stdout.on('data', (d) => d.toString().includes('running') && resolve(p)));
}

const errors = [];
const browser = await pw.chromium.launch();

async function newPage(width = 1400, height = 900) {
  const ctx = await browser.newContext({ viewport: { width, height }, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // The simulated provider overload (first mock call) legitimately logs one failed request.
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('status of 502') && errors.push(`console: ${m.text()}`));
  return page;
}

// ================= A) Demo mode =================
const appA = await startApp(5192, { ANTHROPIC_API_KEY: '' });
{
  const page = await newPage();
  await page.goto('http://localhost:5192/');
  await page.getByText('Demo mode · Preloaded analysis').first().waitFor();
  await page.screenshot({ path: `${shots}/01-start.png`, fullPage: true });

  // Demo 1: contradictions
  await page.locator('.demo-item').nth(0).getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Open preloaded analysis (Demo)' }).click();
  await page.locator('.q-card').waitFor();
  assert.equal(await page.locator('.q-row, .q-card').count(), 7);
  await page.screenshot({ path: `${shots}/02-workspace-demo1.png` });
  // select question 2 (dimensions contradiction) -> highlight in document
  await page.locator('.q-row').filter({ hasText: 'Two different sizes' }).click();
  await page.locator('.q-card .q-title', { hasText: 'Two different sizes' }).waitFor();
  assert.ok((await page.locator('mark.hl-active').count()) >= 2, 'both fragments highlighted');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${shots}/03-contradiction-selected.png` });
  // edit, select for follow-up
  await page.getByRole('button', { name: 'Select for follow-up' }).click();
  await page.getByRole('button', { name: 'Edit wording' }).click();
  await page.locator('.edit-form textarea').fill('Which dimensions are correct: 61 x 76 cm (Section 3) or 76 x 91 cm (Section 8)?');
  await page.getByRole('button', { name: 'Save wording' }).click();
  await page.locator('.q-card .tag', { hasText: 'Edited' }).waitFor();
  // dismiss the arithmetic question with a reason
  await page.locator('.q-row').filter({ hasText: 'does not recompute' }).click();
  await page.getByRole('button', { name: 'Dismiss…' }).click();
  await page.locator('.dismiss-form textarea').fill('Appraiser already corrected the table by email.');
  await page.getByRole('button', { name: 'Dismiss question' }).click();
  await page.locator('.q-card .status-dismissed').waitFor();
  // filters
  await page.locator('.chip', { hasText: 'Dismissed' }).click();
  assert.equal(await page.locator('.q-list > *').count(), 1);
  await page.locator('.chip', { hasText: 'Selected' }).click();
  assert.equal(await page.locator('.q-list > *').count(), 1);
  await page.locator('.chip', { hasText: 'All' }).click();
  // click a highlight in the document selects its question
  await page.locator('mark.hl').first().click();
  await page.locator('.q-card').waitFor();

  // Demo 2: sample reply and answer analysis
  await page.locator('.brand').click();
  await page.locator('.demo-item').nth(1).getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Open preloaded analysis (Demo)' }).click();
  await page.locator('.q-card').waitFor();
  assert.equal(await page.locator('.q-row, .q-card').count(), 5);
  await page.getByText('Insert sample reply (fictional)').click();
  await page.getByRole('button', { name: 'Save answer' }).click();
  await page.getByRole('button', { name: 'Analyze answer (Demo · preloaded)' }).click();
  await page.locator('.entry.analysis').waitFor();
  await page.getByText('Answer partly addresses the question').waitFor();
  await page.getByRole('button', { name: 'Add follow-up question' }).click();
  await page.locator('.entry.followup').waitFor();
  await page.locator('.q-card').screenshot({ path: `${shots}/04-answer-analysis.png` });
  // q2 resolves
  await page.locator('.q-row').filter({ hasText: 'Condition of the comparables' }).click();
  await page.getByText('Insert sample reply (fictional)').click();
  await page.getByRole('button', { name: 'Save answer' }).click();
  await page.getByRole('button', { name: 'Analyze answer (Demo · preloaded)' }).click();
  await page.getByText('The answer appears to close this question').waitFor();
  await page.locator('.resolve-hint').getByRole('button', { name: 'Mark resolved' }).click();
  await page.locator('.q-card .status-resolved').waitFor();
  // a custom answer in demo mode cannot be analyzed (no fake analysis)
  await page.locator('.q-row').filter({ hasText: 'Exclusion of the regional sale' }).click();
  await page.locator('.answer-form textarea').fill('Regional sales are not representative in my experience.');
  await page.getByRole('button', { name: 'Save answer' }).click();
  await page.getByText('Answer analysis needs Live AI').waitFor();
  // include q1 & summary
  await page.getByRole('button', { name: 'Prepare review summary' }).click();
  await page.locator('.summary-doc').waitFor();
  await page.getByRole('button', { name: 'Copy questions' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  assert.ok(clip.includes('Basis for the −20% adjustment to C3'), 'clipboard contains question');
  assert.ok(clip.includes('Follow-up:'), 'clipboard contains follow-up');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download HTML' }).click()]);
  const html = readFileSync(await dl.path(), 'utf8');
  assert.ok(html.includes('<style>') && html.includes('Review summary') && html.includes('Fictional demonstration material'));
  const [dj] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export review (JSON)' }).click()]);
  const jsonPath = `${shots}/export.json`;
  await dj.saveAs(jsonPath);
  await page.screenshot({ path: `${shots}/05-summary.png`, fullPage: true });
  await page.emulateMedia({ media: 'print' });
  await page.screenshot({ path: `${shots}/06-summary-print.png`, fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // Demo 3: coherent report
  await page.locator('.brand').click();
  await page.locator('.demo-item').nth(2).getByRole('button', { name: 'Open' }).click();
  await page.getByRole('button', { name: 'Open preloaded analysis (Demo)' }).click();
  await page.getByText('No questions within the scope of this review').waitFor();
  await page.screenshot({ path: `${shots}/07-no-questions.png` });

  // Own text in demo mode: honest refusal, no preloaded results
  await page.locator('.brand').click();
  assert.ok((await page.locator('.saved-list li').count()) >= 3, 'demo sessions saved automatically');
  await page.locator('#paste-text').fill(DEMO_REPORTS[0].text.replace('Harbour at Dusk', 'Harbour at Noon'));
  await page.getByRole('button', { name: 'Review text →' }).click();
  await page.getByText('Live AI is not configured on this server, so this document cannot be analyzed').waitFor();
  assert.equal(await page.getByRole('button', { name: /Analyze report|preloaded/ }).count(), 0);
  // corrections are kept separately
  await page.getByRole('tab', { name: 'Correct recognition errors…' }).click();
  await page.locator('textarea.source-text').fill('Corrected text '.repeat(20));
  await page.getByRole('tab', { name: 'Original text' }).click();
  assert.ok((await page.locator('pre.source-text').innerText()).includes('Harbour at Noon'));
  await page.screenshot({ path: `${shots}/08-source.png` });
  await page.getByRole('button', { name: 'Delete session' }).click();
  await page.locator('.modal').getByRole('button', { name: 'Delete session' }).click();
  await page.locator('.start').waitFor();

  // PDF upload (text) and scanned PDF (honest failure)
  await page.setInputFiles('#file-input', 'tests/fixtures/text-report.pdf');
  await page.getByText('PDF · text-report.pdf').waitFor();
  assert.ok((await page.locator('pre.source-text').innerText()).includes('--- Page 3 ---'));
  await page.locator('.brand').click();
  await page.setInputFiles('#file-input', 'tests/fixtures/scanned.pdf');
  await page.getByText(/No extractable text was found/).waitFor();
  await page.screenshot({ path: `${shots}/09-scanned-pdf.png` });

  // JSON import restores the review
  await page.setInputFiles('#file-input', jsonPath);
  await page.locator('.q-card, .q-row').first().waitFor();
  assert.ok((await page.locator('.status-resolved').count()) >= 1);

  // mobile layout
  const m = await newPage(390, 844);
  await m.goto('http://localhost:5192/');
  await m.locator('.demo-item').nth(0).getByRole('button', { name: 'Open' }).click();
  await m.getByRole('button', { name: 'Open preloaded analysis (Demo)' }).click();
  await m.locator('.q-card, .q-row').first().waitFor();
  await m.screenshot({ path: `${shots}/10-mobile-questions.png` });
  await m.locator('.q-card').getByRole('button', { name: 'Show in document' }).first().click();
  await m.locator('.doc-pane').waitFor({ state: 'visible' });
  await m.waitForTimeout(800);
  await m.screenshot({ path: `${shots}/11-mobile-document.png` });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert.equal(overflow, false, 'no horizontal overflow on mobile');
}
appA.kill();

// ================= B) Live AI via mock =================
const appB = await startApp(5193, { ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://localhost:5191', SECOND_LOOK_MODEL: 'claude-opus-5' });
{
  const page = await newPage();
  await page.goto('http://localhost:5193/');
  await page.getByText('Live AI · claude-opus-5').first().waitFor();
  await page.locator('#paste-title').fill('My pasted report');
  await page.locator('#paste-text').fill(DEMO_REPORTS[0].text);
  await page.getByRole('button', { name: 'Review text →' }).click();
  await page.getByRole('button', { name: 'Analyze report' }).click();
  await page.getByText('The request failed.').waitFor(); // first mock call returns 529
  await page.screenshot({ path: `${shots}/12-live-error.png` });
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.locator('.q-card').waitFor();
  await page.getByText('Live AI · claude-opus-5').first().waitFor();
  assert.equal(await page.getByText('Demo mode · Preloaded analysis').count(), 0);
  await page.getByText('Save on this device').first().click();
  await page.locator('.answer-form textarea').fill(DEMO_ANSWERS[0].answer);
  await page.getByRole('button', { name: '+ Attach additional explanation' }).click();
  await page.locator('.attachment-field textarea').fill('Extra note from the appraiser.');
  await page.getByRole('button', { name: 'Save answer' }).click();
  await page.getByRole('button', { name: 'Analyze answer' }).click();
  await page.locator('.entry.analysis').waitFor();
  await page.screenshot({ path: `${shots}/13-live-workspace.png` });
  // stale detection after editing text
  await page.getByRole('button', { name: '1 · Source' }).click();
  await page.getByRole('tab', { name: 'Correct recognition errors…' }).click();
  await page.locator('textarea.source-text').fill(DEMO_REPORTS[0].text + '\nAddendum.');
  await page.waitForTimeout(600);
  await page.getByText('The text has changed since the last analysis').waitFor();
  await page.getByRole('button', { name: '2 · Questions' }).click();
  await page.getByText('Results may be out of date.').waitFor();
  await page.screenshot({ path: `${shots}/14-stale.png` });
  await page.getByRole('button', { name: 'Review text and analyze again' }).click();
  await page.getByRole('button', { name: 'Analyze report again' }).click();
  await page.locator('.modal').getByText('moved to “Previous analyses”').waitFor();
  await page.locator('.modal').getByRole('button', { name: 'Analyze again' }).click();
  await page.locator('.q-card').waitFor();
  await page.getByText('Previous analyses').waitFor();
  assert.equal(await page.getByText('Results may be out of date.').count(), 0);
}
appB.kill();
mock.close();
await browser.close();

if (errors.length) {
  console.error('Browser errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`E2E smoke passed. Mock API calls: ${mockCalls}. Screenshots in ${shots}/`);
