// Generates PDF fixtures with Chromium (Playwright): a text PDF and an image-only "scan".
// Usage: node scripts/make-pdf-fixtures.mjs  (requires playwright + chromium)
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require('/opt/node22/lib/node_modules/playwright'); }
const { DEMO_REPORTS } = await import('../build/server/src/demo/reports.js');
const browser = await pw.chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const body = DEMO_REPORTS[0].text.split('\n').filter((l) => !l.startsWith('--- Page')).map((l) => `<p>${esc(l) || '&nbsp;'}</p>`).join('');
await page.setContent(`<html><body style="font-family: serif; font-size: 11pt">${body}</body></html>`);
writeFileSync('tests/fixtures/text-report.pdf', await page.pdf({ format: 'A4' }));
await page.setContent(`<html><body><canvas id=c width=800 height=300></canvas><script>
const x = document.getElementById('c').getContext('2d'); x.fillStyle='#fff'; x.fillRect(0,0,800,300); x.fillStyle='#000';
x.font='20px serif'; x.fillText('SCANNED APPRAISAL REPORT - image only', 20, 60); x.fillText('Concluded value: USD 10,000', 20, 120);
</script></body></html>`);
await page.waitForTimeout(100);
writeFileSync('tests/fixtures/scanned.pdf', await page.pdf({ format: 'A5' }));
await browser.close();
console.log('ok');
