# Second Look

**AI-powered appraisal review** (working prototype).

Second Look reads an art appraisal report, follows its reasoning from the data to the conclusion, and drafts specific questions for its author. Every question is tied to an exact quotation from the report. You then paste in the appraiser's answers, and the app shows what each answer explains, what new claims it makes, and what is still unclear. At the end it produces a review summary you can copy, download, print or export.

Second Look does **not** judge authenticity, set a value, rate the appraiser, or send messages to anyone.

## Quick start

Requires Node 20+. There are no runtime dependencies. You only need `typescript` and `@types/node` to build.

```bash
npm install          # typescript + @types/node (dev only)
npm run build
npm start            # http://localhost:5173
```

### Turning on Live AI

Model calls run on the server only. Set these server environment variables before `npm start`:

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | **Required for Live AI.** Stays on the server and is never sent to the browser. |
| `SECOND_LOOK_MODEL` | Optional. Defaults to `claude-opus-5`. |
| `SECOND_LOOK_FALLBACKS` | Optional. Server-side refusal fallbacks (`fallbacks: "default"`) are on by default. Set `off` to disable them. |
| `ANTHROPIC_BASE_URL` | Optional API base URL (used by the E2E test's mock). |
| `SECOND_LOOK_TIMEOUT_MS` | Optional. Request timeout, default 600000. |

Without a key, the app runs in **Demo mode · Preloaded analysis**, and that label stays visible the whole time. In Demo mode:
- Only the three fictional demo reports can be opened with their prepared analyses.
- Your own documents can be loaded and read. They are never given preloaded results.
- A failed model call is reported as an error with a retry button. The app never switches to demo data behind your back.

## How it works

```
Upload / paste / demo → source review (fix OCR errors) → Analyze report
  → questions with verified quotations → answers → answer analysis → follow-ups → summary
```

- **Structured output.** The server asks the model for JSON against a JSON Schema (`server/schemas.ts`). It then validates the result in `shared/validate.ts`, and the browser validates it again.
- **Quote verification.** `shared/quotes.ts` checks that every quotation actually occurs in the analyzed text. Matching tolerates differences in whitespace, typographic quotes, dashes and table pipes. A quotation that can't be matched is marked *Unverified* and is never shown as evidence.
- **Page and section references** come from the text itself (headings and `--- Page N ---` markers written during PDF extraction). They are not taken from the model.
- **Prompt-injection hygiene.** The report and the answers are passed to the model as data inside tags, and the system prompt tells it to ignore any instructions inside them. The source screen also flags text that contains instructions.
- **Versions.** The original extraction and your corrections are stored separately. Each analysis records which version and hash it analyzed. If the text changes afterwards, the results are marked stale. Running the analysis again moves the earlier questions, answers and notes to *Previous analyses* instead of deleting them, and quotations from different versions are never mixed.
- **Storage.** Demo sessions are saved automatically in `localStorage`. Your own documents are saved only after you press **Save on this device**. **Delete session** removes everything.

### PDF

The npm registry wasn't reachable when this was built, so `src/pdf.ts` is a small built-in extractor instead of a library. It handles FlateDecode, object streams, ToUnicode CMaps, glyph widths for word spacing, and Form XObjects. It has no OCR. If a PDF contains only scanned images, the app says so and asks you to paste recognised text. Pages without text are listed and are not analyzed. Encrypted PDFs are rejected with an explanation. If you need wider PDF coverage (for example LZW or ASCII85 streams), swap in `pdfjs-dist` behind the same `extractPdfText()` interface.

## Project layout

```
shared/        types, runtime validation, quote verification (used by client, server, tests)
server/        HTTP server (static + /api), prompts, JSON schemas, provider adapter
  providers/   ModelProvider interface + Anthropic adapter (streaming, refusal/max_tokens handling)
src/           browser app (TypeScript, no framework): state/actions, views, PDF extractor
  demo/        three fictional reports, preloaded analyses, sample appraiser replies
public/        index.html, styles.css
tests/         node:test unit tests + PDF fixtures
scripts/       e2e-smoke.mjs (Playwright), make-pdf-fixtures.mjs
```

## Tests

```bash
npm test                         # unit tests: quotes, validation, analysis service, PDF, demo data integrity
node scripts/e2e-smoke.mjs       # full browser flows in Demo mode and Live mode (mocked API); needs Playwright + Chromium
```

The E2E script walks through the complete flow twice. The first pass runs without a key: demo reports, contradiction highlighting, editing, dismissing, the sample reply, answer analysis, follow-ups, resolving, the summary, copy/HTML/JSON export and import, PDF upload including a scanned PDF, and the mobile layout. The second pass runs against a local mock of the Messages API: live analysis with a simulated overload and retry, answer analysis with an attachment, stale detection, and re-analysis with archiving.

## Demo material

All three demo reports (*Harbour at Dusk*, *Tidal Grid IV*, *Standing Figure with Oar*) are **fictional**. So are every artist, firm, person, venue and figure in them.
