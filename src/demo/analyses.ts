// Preloaded analyses for the three fictional demo reports, shown only in Demo mode and always
// labelled "Demo mode · Preloaded analysis". Every quotation here is checked by tests/demo.test.ts.

import type { AnalysisResult, AnswerAnalysisResult } from '../../shared/types.js';

const NO_LIMITS_COMMON = [
  'Text-only review of the supplied document; no images of the work were available.',
  'No external market data was consulted; statements about the market are taken from the report itself.',
  'This review does not assess authenticity, the correct value of the work, or the appraiser’s competence.',
];

const harbour: AnalysisResult = {
  facts: {
    subject: { value: 'Elias Varnholt (1887–1952), "Harbour at Dusk", c. 1924, oil on canvas', quote: 'Title: Harbour at Dusk' },
    appraiser: { value: 'Dana Okafor-Lind, Marlowe & Tern Fine Art Valuation', quote: 'Appraiser: Dana Okafor-Lind (fictional)' },
    purpose: { value: 'Insurance scheduling; intended users are the client and the insurer', quote: 'This appraisal was prepared to establish a value for insurance scheduling purposes.' },
    basisOfValue: { value: 'Retail Replacement Value', quote: 'The value expressed is Retail Replacement Value' },
    valuationDate: { value: '10 March 2026', quote: 'The effective date of valuation is 10 March 2026.' },
    reportDate: { value: '14 March 2026', quote: 'Date of report: 14 March 2026' },
    currency: { value: 'USD', quote: 'All figures are in US dollars (USD).' },
    concludedValue: { value: 'USD 58,000', quote: 'USD 58,000 (fifty-eight thousand US dollars)' },
  },
  conclusions: [
    { text: 'Value is supported by quality, period and condition.', quote: "Taking into account the subject's quality, its period, and its excellent condition with no restoration" },
    { text: 'The subject’s size supports a value toward the upper end of the range.', quote: 'is larger than most of the comparables, which supports a value toward the upper end of the range' },
    { text: 'The market for the artist is described as stable over five years.', quote: 'The market for his work has been stable over the last five years' },
  ],
  comparables: [
    { label: 'C1', description: 'Fishing Boats, Evening, 1925, oil on canvas, 60 x 73 cm', price: 'USD 42,000', priceBasis: 'Auction, hammer price', saleDate: 'Oct 2025', quote: '| C1 | Fishing Boats, Evening | 1925 | Oil on canvas | 60 x 73 | Auction, hammer price | Oct 2025 | 42,000 |' },
    { label: 'C2', description: 'Quay in Rain, 1923, oil on board, 46 x 55 cm', price: 'USD 31,000', priceBasis: 'Auction, hammer price', saleDate: 'May 2024', quote: '| C2 | Quay in Rain | 1923 | Oil on board | 46 x 55 | Auction, hammer price | May 2024 | 31,000 |' },
    { label: 'C3', description: 'The Lighthouse Road, 1931, oil on canvas, 81 x 100 cm', price: 'USD 68,000', priceBasis: 'Dealer asking price', saleDate: 'Jan 2026', quote: '| C3 | The Lighthouse Road | 1931 | Oil on canvas | 81 x 100 | Dealer asking price | Jan 2026 | 68,000 |' },
    { label: 'C4', description: 'Harbour Lights, 1926, oil on canvas, 65 x 81 cm', price: 'USD 55,000', priceBasis: "Auction, incl. buyer's premium", saleDate: 'Nov 2021', quote: "| C4 | Harbour Lights | 1926 | Oil on canvas | 65 x 81 | Auction, incl. buyer's premium | Nov 2021 | 55,000 |" },
  ],
  adjustments: [
    { appliesTo: 'C1', description: '+10% retail uplift → USD 46,200', quote: '| C1 | 42,000 | +10% retail uplift | 46,200 |' },
    { appliesTo: 'C2', description: '+15% canvas vs. board, +10% retail uplift → USD 38,750', quote: '| C2 | 31,000 | +15% canvas vs. board, +10% retail uplift | 38,750 |' },
    { appliesTo: 'C3', description: '−20% later period and larger size → USD 54,400', quote: '| C3 | 68,000 | −20% later period and larger size | 54,400 |' },
    { appliesTo: 'C4', description: 'No adjustment → USD 55,000', quote: '| C4 | 55,000 | none | 55,000 |' },
  ],
  assumptions: [
    { text: 'Attribution assumed correct; no independent authentication.', quote: 'The appraiser has assumed that the attribution to Elias Varnholt is correct.' },
    { text: 'Provenance information from the client is relied on.', quote: 'The appraiser has relied on the provenance information provided by the client.' },
    { text: 'Cleaning in 2019 and stable condition, said to be confirmed in Appendix B.', quote: 'The painting was professionally cleaned in 2019 and is in stable condition' },
  ],
  questions: [
    {
      id: 'q1',
      title: 'Condition: “no restoration” vs. recorded retouching',
      question:
        "Section 8 relies on the painting's “excellent condition with no restoration”, while Section 4 records relining, an area of retouching of about 3 x 4 cm visible under ultraviolet light, and discoloured varnish. Which description reflects the condition you valued, and how, if at all, did the relining and retouching affect the concluded value?",
      kind: 'direct_contradiction',
      category: 'condition',
      quotes: [
        { text: "Taking into account the subject's quality, its period, and its excellent condition with no restoration", role: 'primary', note: 'Conclusion (Section 8) cites condition with no restoration as a reason for the value.' },
        { text: 'ultraviolet examination shows a small area of retouching in the lower left corner, approximately 3 x 4 cm, in the water', role: 'related', note: 'Condition section (Section 4) records retouching.' },
        { text: 'The canvas has been relined.', role: 'related', note: 'Condition section records a structural intervention.' },
      ],
      whyItMatters:
        'Condition is one of the reasons given for the concluded value, and the stated basis of value refers to a replacement of “similar … condition”. Which condition was assumed determines which replacement works are relevant.',
      clarifies: 'The link between the condition findings (Section 4) and the conclusion (Section 8).',
      checkedElsewhere:
        'Sections 4, 8 and 9 were compared. Section 9 mentions a 2019 cleaning but neither the relining nor the retouching; no other passage reconciles the two descriptions.',
      partialExplanation: null,
    },
    {
      id: 'q2',
      title: 'Two different sizes given for the painting',
      question:
        'Section 3 gives the dimensions as 61 x 76 cm, but Section 8 describes the painting as measuring 76 x 91 cm and uses its size to support a value toward the upper end of the range. Which dimensions are correct, and if the painting measures 61 x 76 cm, does the size argument in Section 8 still apply?',
      kind: 'direct_contradiction',
      category: 'description',
      quotes: [
        { text: 'Dimensions: 61 x 76 cm (24 x 30 in), unframed', role: 'primary', note: 'Description (Section 3).' },
        { text: 'The subject painting, measuring 76 x 91 cm, is larger than most of the comparables', role: 'related', note: 'Conclusion (Section 8).' },
      ],
      whyItMatters:
        'At 61 x 76 cm the subject would be larger than C1 and C2 but smaller than C3 and C4, so the statement that it is “larger than most of the comparables”, used to support the upper end of the range, would not hold.',
      clarifies: 'Whether the size-based reasoning in the conclusion rests on the correct description.',
      checkedElsewhere:
        'No other section states the size of the subject. 76 x 91 cm could be a framed size, but the report does not say so; Section 3 describes 61 x 76 cm as unframed.',
      partialExplanation: null,
    },
    {
      id: 'q3',
      title: 'Stated average of adjusted values does not recompute',
      question:
        'Table 2 lists adjusted values of USD 46,200, 38,750, 54,400 and 55,000. Their arithmetic mean is USD 48,587.50, whereas the report states an average of USD 51,600. Could you confirm how USD 51,600 was calculated — for example, a weighted average or a different set of values?',
      kind: 'direct_contradiction',
      category: 'arithmetic',
      quotes: [
        { text: 'Average of adjusted values: USD 51,600', role: 'primary', note: 'Stated average.' },
        { text: '| C1 | 42,000 | +10% retail uplift | 46,200 |', role: 'related', note: 'First of the four adjusted values used in the recomputation (Table 2).' },
      ],
      whyItMatters:
        'The average is the last numerical step before the conclusion. With the recomputed mean, the concluded USD 58,000 is about 19% above the average rather than about 12%, so more of the conclusion depends on the unquantified factors in Section 8.',
      clarifies: 'The arithmetic from Table 2 to the reconciled figure.',
      checkedElsewhere:
        'No weighting of comparables is described in Sections 6–8, so a weighted average cannot be reconstructed from the report.',
      partialExplanation: null,
    },
    {
      id: 'q4',
      title: 'Conservator’s report (Appendix B) not in the document',
      question:
        'Section 9 states that the 2019 cleaning and the stable condition are confirmed in the conservator’s report at Appendix B, but the supplied report ends with Appendix A. Could you provide Appendix B, and clarify whether it also covers the relining and the retouching noted in Section 4?',
      kind: 'not_found_in_report',
      category: 'documentation',
      quotes: [
        { text: "The painting was professionally cleaned in 2019 and is in stable condition, as confirmed in the conservator's report at Appendix B.", role: 'primary', note: 'Assumption relying on Appendix B.' },
        { text: 'Copy of invoice, Harbourside Gallery (fictional), dated 2 August 1978', role: 'related', note: 'Content of Appendix A, the last part of the supplied document.' },
      ],
      whyItMatters:
        'The condition statement supports the conclusion, and the only evidence cited for the 2019 treatment is not in the supplied document.',
      clarifies: 'Documentary support for the condition assumption.',
      checkedElsewhere:
        'The whole supplied text was searched for Appendix B and for a description of the 2019 treatment. Section 4 does not mention a 2019 cleaning. Appendix B: not found in the supplied report.',
      partialExplanation: null,
    },
    {
      id: 'q5',
      title: 'Comparables recorded on different price bases',
      question:
        'C1 and C2 are hammer prices, C4 includes buyer’s premium and C3 is a dealer asking price. A 10% “retail uplift” is applied to C1 and C2 but not to C4, and C3 is adjusted only for period and size. How were these prices brought to a common Retail Replacement Value basis, and what supports the 10% uplift?',
      kind: 'methodology',
      category: 'price_basis',
      quotes: [
        { text: '| C1 | Fishing Boats, Evening | 1925 | Oil on canvas | 60 x 73 | Auction, hammer price | Oct 2025 | 42,000 |', role: 'primary', note: 'Hammer price (no premium).' },
        { text: '| C3 | The Lighthouse Road | 1931 | Oil on canvas | 81 x 100 | Dealer asking price | Jan 2026 | 68,000 |', role: 'related', note: 'Asking price, not an achieved price.' },
        { text: '| C4 | 55,000 | none | 55,000 |', role: 'related', note: 'Price including premium, no adjustment applied.' },
      ],
      whyItMatters:
        'Hammer prices, prices including premium and asking prices measure different things, and the stated basis is a retail replacement cost. Without a common basis, the average in Table 2 combines figures that are not directly comparable.',
      clarifies: 'How the market evidence was converted to the stated basis of value.',
      checkedElsewhere:
        'Sections 2, 6 and 7 were reviewed. The uplift percentage appears in Table 2, but no source or reasoning for it is given, and nothing explains how an asking price relates to an achieved price.',
      partialExplanation: null,
    },
    {
      id: 'q6',
      title: 'Age of C4 and the “stable market” statement',
      question:
        'C4 sold in November 2021, more than four years before the effective date, and receives no time adjustment. The report describes the market as stable over the last five years. What data supports that statement, and were more recent sales of comparable coastal works considered?',
      kind: 'undisclosed_assumption',
      category: 'market_data',
      quotes: [
        { text: "| C4 | Harbour Lights | 1926 | Oil on canvas | 65 x 81 | Auction, incl. buyer's premium | Nov 2021 | 55,000 |", role: 'primary', note: 'Oldest comparable.' },
        { text: 'The market for his work has been stable over the last five years, with occasional strong results for large harbour compositions.', role: 'related', note: 'Market statement without supporting data.' },
      ],
      whyItMatters:
        'C4 has the highest adjusted value used (USD 55,000). If the market has moved since 2021, its contribution to the average and to the upper end of the range changes.',
      clarifies: 'Whether older market evidence is current at the effective date.',
      checkedElsewhere: 'No sales series, index or other data supporting the stability statement was found in Section 6 or elsewhere.',
      partialExplanation: null,
    },
    {
      id: 'q7',
      title: 'From the adjusted comparables to USD 58,000',
      question:
        'The concluded value of USD 58,000 is above every adjusted comparable value (the highest is USD 55,000) and above the stated average. Which factors account for the difference, and approximately how much does each contribute?',
      kind: 'methodology',
      category: 'reconciliation',
      quotes: [
        { text: 'USD 58,000 (fifty-eight thousand US dollars)', role: 'primary', note: 'Concluded value.' },
        { text: 'Average of adjusted values: USD 51,600', role: 'related', note: 'Stated average.' },
      ],
      whyItMatters:
        'A conclusion above all adjusted comparables is not wrong in itself, but the report should show how the evidence supports it.',
      clarifies: 'The step from the market evidence to the concluded value.',
      checkedElsewhere: 'Section 8 was compared with Tables 1–2 and Section 3.',
      partialExplanation: {
        quote: "Taking into account the subject's quality, its period, and its excellent condition with no restoration",
        explains: 'Section 8 names quality, period, condition and size as reasons for a value above the average.',
        remainsUnclear:
          'The condition and size reasons conflict with Sections 3 and 4 (see the related questions), and no factor is quantified, so the move from the average to USD 58,000 cannot be followed.',
      },
    },
  ],
  explainedPoints: [
    { topic: 'Attribution', note: 'Disclosed as a limiting condition in Section 9: the attribution is assumed, not verified. Outside the scope of this review.', quote: 'No independent authentication was undertaken.' },
    { topic: 'Provenance', note: 'The reliance on client information is disclosed, and the 1978 invoice is reproduced in Appendix A.', quote: 'The appraiser has relied on the provenance information provided by the client.' },
  ],
  noQuestionsReason: null,
  scope: {
    coverage:
      'The full supplied text (Sections 1–10 and Appendix A, three pages) was read. Checks: purpose, basis, dates, currency and value extracted; Sections 3, 4, 8 and 9 compared; Table 2 recomputed; referenced appendices searched for.',
    limitations: ['Appendix B, referred to in Section 9, is not in the supplied document.', ...NO_LIMITS_COMMON],
  },
};

const tidal: AnalysisResult = {
  facts: {
    subject: { value: 'Mireille Asante-Crowe, "Tidal Grid IV", 2004, screenprint, edition 18/60', quote: 'Subject: Mireille Asante-Crowe, "Tidal Grid IV", 2004' },
    appraiser: { value: 'Jonah Pereira-Voss, Hollis Wren Appraisal Studio', quote: 'Appraiser: Jonah Pereira-Voss (fictional)' },
    purpose: { value: 'Division of estate property among beneficiaries', quote: 'to assist the executors in the division of estate property among beneficiaries' },
    basisOfValue: { value: 'Fair Market Value (defined in Section 2)', quote: 'This report provides an opinion of Fair Market Value' },
    valuationDate: { value: '30 May 2026', quote: 'The effective date of valuation is 30 May 2026.' },
    reportDate: { value: '22 June 2026', quote: 'Date of report: 22 June 2026' },
    currency: { value: 'EUR', quote: 'Values are stated in euros (EUR).' },
    concludedValue: { value: 'EUR 11,500', quote: 'EUR 11,500 (eleven thousand five hundred euros)' },
  },
  conclusions: [
    { text: 'C2 (same image and edition) carries the greatest weight; C1 and C4 are secondary; C3 is a check.', quote: 'Greatest weight was given to C2 as the same image and edition, with C1 and C4 as secondary support.' },
    { text: 'Adjusted values range from EUR 9,975 to EUR 12,420 (mean EUR 11,011).', quote: 'The adjusted values range from EUR 9,975 to EUR 12,420, with a mean of EUR 11,011.' },
    { text: 'Tidal Grid series results have risen modestly since 2023.', quote: 'Results for the Tidal Grid series have risen modestly since 2023' },
  ],
  comparables: [
    { label: 'C1', description: 'Tidal Grid II, 2003, screenprint, edition 60', price: 'EUR 9,800', priceBasis: 'Auction, incl. premium', saleDate: 'Jun 2025', quote: '| C1 | Tidal Grid II | 2003 | Screenprint | 60 | Auction, incl. premium | Jun 2025 | 9,800 |' },
    { label: 'C2', description: 'Tidal Grid IV, 2004, screenprint, edition 60 (no. 7)', price: 'EUR 11,500', priceBasis: 'Auction, incl. premium', saleDate: 'Feb 2023', quote: '| C2 | Tidal Grid IV | 2004 | Screenprint | 60 (no. 7) | Auction, incl. premium | Feb 2023 | 11,500 |' },
    { label: 'C3', description: 'Salt Ledger, 2006, screenprint with hand colouring, edition 25', price: 'EUR 14,200', priceBasis: 'Auction, incl. premium', saleDate: 'Sep 2025', quote: '| C3 | Salt Ledger | 2006 | Screenprint with hand colouring | 25 | Auction, incl. premium | Sep 2025 | 14,200 |' },
    { label: 'C4', description: 'Tidal Grid V, 2004, screenprint, edition 60', price: 'EUR 10,500', priceBasis: 'Gallery sale, price reported by gallery', saleDate: 'Mar 2025', quote: '| C4 | Tidal Grid V | 2004 | Screenprint | 60 | Gallery sale, price reported by gallery | Mar 2025 | 10,500 |' },
  ],
  adjustments: [
    { appliesTo: 'C1', description: '+5% (more sought-after image) → EUR 10,290', quote: '| C1 | 9,800 | +5% (Tidal Grid IV is the more sought-after image) | 10,290 |' },
    { appliesTo: 'C2', description: '+8% market movement since Feb 2023 → EUR 12,420', quote: '| C2 | 11,500 | +8% market movement since Feb 2023 | 12,420 |' },
    { appliesTo: 'C3', description: '−20% hand colouring and smaller edition → EUR 11,360', quote: '| C3 | 14,200 | −20% hand colouring and smaller edition | 11,360 |' },
    { appliesTo: 'C4', description: '−5% gallery price to auction-equivalent → EUR 9,975', quote: '| C4 | 10,500 | −5% gallery price to auction-equivalent | 9,975 |' },
  ],
  assumptions: [
    { text: 'Attribution, edition number and signature accepted as stated.', quote: 'The attribution, edition number and signature have been accepted as stated; no independent authentication was carried out.' },
    { text: 'Executors have good title.', quote: 'The appraiser has assumed that the executors have good title to the property.' },
  ],
  questions: [
    {
      id: 'q1',
      title: 'Basis for the −20% adjustment to C3',
      question:
        'C3 (Salt Ledger) differs from the subject in image, technique (hand colouring) and edition size (25 vs. 60), and is adjusted by −20%. Appendix C gives one paired comparison showing a difference of about 16% for hand colouring. How was the remaining difference of about 4 percentage points derived, and what supports using a different image as a comparable?',
      kind: 'methodology',
      category: 'adjustments',
      quotes: [
        { text: '| C3 | 14,200 | −20% hand colouring and smaller edition | 11,360 |', role: 'primary', note: 'Adjustment applied to C3 (Table 2).' },
        { text: '| C3 | Salt Ledger | 2006 | Screenprint with hand colouring | 25 | Auction, incl. premium | Sep 2025 | 14,200 |', role: 'related', note: 'Differences in image, technique and edition (Table 1).' },
      ],
      whyItMatters:
        'C3 is used as a check on the upper end of the range; the size of its adjustment decides whether it supports or tempers the conclusion.',
      clarifies: 'The basis of the adjustment for the least similar comparable.',
      checkedElsewhere: 'Appendix B (selection of comparables) and Appendix C (adjustment notes) were reviewed.',
      partialExplanation: {
        quote: 'a hand-coloured impression of Salt Ledger sold for EUR 14,200 and a standard impression of the same image sold for EUR 11,900 in the same season, a difference of about 16%',
        explains: 'Appendix C supports about 16% of the adjustment for hand colouring, from a single paired sale.',
        remainsUnclear:
          'The report does not explain the rest of the −20% (presumably the smaller edition). Appendix B’s reason for including C3 — few recent sales of the series — does not address the difference in image.',
      },
    },
    {
      id: 'q2',
      title: 'Condition of the comparables not recorded',
      question:
        'The subject has two handling creases in the lower margin and is hinged with paper tape, and condition was the reason for excluding Tidal Grid III. The condition of C1–C4 is not recorded. Did you review the condition of the comparables, and did you consider whether any condition adjustment was needed between them and the subject?',
      kind: 'undisclosed_assumption',
      category: 'condition',
      quotes: [
        { text: 'There are two minor handling creases in the lower margin, not affecting the image.', role: 'primary', note: 'Subject condition (Section 4).' },
        { text: "It was excluded because its condition is materially worse than the subject's.", role: 'related', note: 'Condition used as a selection criterion (Appendix B).' },
      ],
      whyItMatters:
        'Condition is used to exclude a sale but not as an adjustment factor, and the conclusion cites the subject’s good condition. The comparison implicitly assumes the included comparables are in similar condition.',
      clarifies: 'Whether the subject and comparables are assumed to be in equivalent condition.',
      checkedElsewhere: 'Sections 4 and 6–8 and Appendices B–C: no condition information for C1–C4 was found.',
      partialExplanation: null,
    },
    {
      id: 'q3',
      title: 'Exclusion of the regional sale of Tidal Grid I',
      question:
        'Tidal Grid I (EUR 8,100, April 2025) was excluded because regional sales “receive limited marketing and are not representative”. How does this relate to the definition in Section 2, which refers to the market where such items are most commonly sold to the public? Was the same criterion applied when compiling the 2025 average in Appendix C?',
      kind: 'methodology',
      category: 'comparable_selection',
      quotes: [
        { text: 'It was excluded because regional sales receive limited marketing and are not representative.', role: 'primary', note: 'Reason for exclusion (Appendix B).' },
        { text: 'in the market where such items are most commonly sold to the public', role: 'related', note: 'Definition of value (Section 2).' },
        { text: '| 2025 | 4 | 10,150 |', role: 'related', note: '2025 average used for the market adjustment (Appendix C).' },
      ],
      whyItMatters:
        'Excluding the lowest recent sale of the series raises the range. If the same sale was included in the Appendix C average, the market adjustment and the comparable set would rest on different data.',
      clarifies: 'Consistency of the selection criteria with the stated definition of value and with the market index.',
      checkedElsewhere: 'Appendix B gives the reason quoted; Appendix C does not list the sales included in its averages.',
      partialExplanation: null,
    },
    {
      id: 'q4',
      title: 'How the weighting leads to EUR 11,500',
      question:
        'Section 8 gives the greatest weight to C2, whose adjusted value is EUR 12,420, with C1 and C4 as secondary support; the mean of the adjusted values is EUR 11,011. The concluded EUR 11,500 equals C2’s unadjusted 2023 price. What weights were applied, and how do they produce EUR 11,500?',
      kind: 'methodology',
      category: 'reconciliation',
      quotes: [
        { text: 'Greatest weight was given to C2 as the same image and edition, with C1 and C4 as secondary support.', role: 'primary', note: 'Reconciliation (Section 8).' },
        { text: '| C2 | 11,500 | +8% market movement since Feb 2023 | 12,420 |', role: 'related', note: 'C2 adjusted value (Table 2).' },
        { text: 'EUR 11,500 (eleven thousand five hundred euros)', role: 'related', note: 'Concluded value.' },
      ],
      whyItMatters: 'Without the weights, the step from the adjusted values to the concluded value cannot be reproduced.',
      clarifies: 'The reconciliation from data to conclusion.',
      checkedElsewhere: 'Section 8 and Table 2 were compared; no weights are given elsewhere.',
      partialExplanation: {
        quote: 'C3 was used as a check on the upper end of the range.',
        explains: 'Section 8 describes the order of importance of the comparables.',
        remainsUnclear: 'The weights are not quantified.',
      },
    },
    {
      id: 'q5',
      title: 'Sources of the sales data',
      question:
        'The comparables are identified by title, date and price but not by auction house, sale or lot number, and the Appendix C averages were compiled by the appraiser without listing the underlying sales. Could you provide the sources for C1–C4, for the two excluded sales, and for the sales behind the Appendix C averages?',
      kind: 'not_found_in_report',
      category: 'documentation',
      quotes: [
        { text: 'Average auction price of Tidal Grid screenprints (edition 60, incl. premium), as compiled by the appraiser', role: 'primary', note: 'Index without listed sales (Appendix C).' },
        { text: 'Sales of Tidal Grid I and Tidal Grid III were considered and excluded; the reasons are given in Appendix B.', role: 'related', note: 'Excluded sales, identified without venue.' },
      ],
      whyItMatters:
        'For a division among beneficiaries, the evidence may need to be traceable. The +8% market adjustment depends entirely on the unlisted sales.',
      clarifies: 'Traceability of the market evidence.',
      checkedElsewhere: 'Sections 5–7 and Appendices B–C were searched. Venue names and lot references: not found in the supplied report.',
      partialExplanation: null,
    },
  ],
  explainedPoints: [
    { topic: 'Market adjustment to C2 (+8%)', note: 'Appendix C gives the series averages for 2023 and 2025; the increase recomputes to about 8%.', quote: 'The increase from EUR 9,400 to EUR 10,150 is approximately 8%, which was applied to C2.' },
    { topic: 'Exclusion of Tidal Grid III', note: 'Appendix B cites the sale catalogue’s condition description.', quote: 'significant light-staining to the sheet and a repaired tear in the upper margin' },
    { topic: 'Gallery price for C4 (−5%)', note: 'Appendix C gives the basis; the 5% applied lies within the stated range.', quote: 'the gallery price exceeded the auction price by 4% to 7%' },
    { topic: 'Price basis of auction comparables', note: 'All auction prices include premium; the gallery sale is converted separately (above).', quote: "All auction prices cited in this report include the buyer's premium." },
    { topic: 'Arithmetic of Table 2', note: 'All four adjusted values and the mean (EUR 11,011.25) recompute correctly.', quote: 'with a mean of EUR 11,011' },
  ],
  noQuestionsReason: null,
  scope: {
    coverage:
      'The full supplied text (Sections 1–10 and Appendices A–C, four pages) was read. Checks: purpose, basis, dates, currency and value extracted; Tables 1–2 recomputed; appendices searched for explanations before each question.',
    limitations: ['Appendix A photographs are not reproduced in the supplied text.', ...NO_LIMITS_COMMON],
  },
};

const bronze: AnalysisResult = {
  facts: {
    subject: { value: 'Tomas Rydberg-Holm, "Standing Figure with Oar", bronze, lifetime cast 3/8 (1971)', quote: 'Property: Tomas Rydberg-Holm, "Standing Figure with Oar", bronze' },
    appraiser: { value: 'Ingrid Sol-Achebe, Calder Row Valuers', quote: 'Appraiser: Ingrid Sol-Achebe, Calder Row Valuers (both fictional)' },
    purpose: { value: 'Trustees’ internal accounting records', quote: "This report states an opinion of Fair Market Value for the trustees' internal accounting records." },
    basisOfValue: { value: 'Fair Market Value, international auction market, incl. buyer’s premium', quote: 'The relevant market is the international auction market for post-war Scandinavian sculpture' },
    valuationDate: { value: '1 September 2026', quote: 'Effective date: 1 September 2026.' },
    reportDate: { value: '8 September 2026', quote: 'Report date: 8 September 2026' },
    currency: { value: 'GBP', quote: 'Values are in British pounds (GBP)' },
    concludedValue: { value: 'GBP 46,000', quote: 'GBP 46,000 (forty-six thousand British pounds)' },
  },
  conclusions: [
    { text: 'C1 (same model, height, lifetime cast, recent) carries the most weight.', quote: 'C1 is the same model, of the same height and a lifetime cast in similar condition, sold six months before the effective date, and is given the most weight.' },
    { text: 'Cast number is not treated as affecting value.', quote: 'The difference in cast number (3/8 versus 5/8) is not considered to affect value for this artist' },
  ],
  comparables: [
    { label: 'C1', description: 'Standing Figure with Oar, cast 5/8, lifetime 1973, 84 cm', price: 'GBP 46,000', priceBasis: 'Auction, incl. premium', saleDate: 'Mar 2026', quote: '| C1 | Standing Figure with Oar, cast 5/8 | Lifetime, 1973 | 84 cm | Good, minor rubbing | Auction, Mar 2026 | 46,000 |' },
    { label: 'C2', description: 'Standing Fisherman, lifetime 1969, 78 cm', price: 'GBP 41,500', priceBasis: 'Auction, incl. premium', saleDate: 'Oct 2025', quote: '| C2 | Standing Fisherman | Lifetime, 1969 | 78 cm | Good | Auction, Oct 2025 | 41,500 |' },
    { label: 'C3', description: 'Standing Figure with Net, posthumous 2002, 90 cm (reference only)', price: 'GBP 29,000', priceBasis: 'Auction, incl. premium', saleDate: 'May 2025', quote: '| C3 | Standing Figure with Net | Posthumous, 2002 | 90 cm | Very good | Auction, May 2025 | 29,000 |' },
    { label: 'C4', description: 'Woman with Basket, lifetime 1975, 101 cm', price: 'GBP 52,000', priceBasis: 'Auction, incl. premium', saleDate: 'Nov 2024', quote: '| C4 | Woman with Basket | Lifetime, 1975 | 101 cm | Good, small patina loss | Auction, Nov 2024 | 52,000 |' },
  ],
  adjustments: [
    { appliesTo: 'C2', description: '+5% size → GBP 43,575', quote: '| C2 | 41,500 | +5% size | 43,575 |' },
    { appliesTo: 'C4', description: '−10% size → GBP 46,800', quote: '| C4 | 52,000 | −10% size | 46,800 |' },
    { appliesTo: 'All', description: 'No time adjustment; no condition adjustment (reasons stated).', quote: 'so no time adjustment was applied' },
  ],
  assumptions: [
    { text: 'Attribution and cast information accepted as marked.', quote: 'Attribution and cast information are accepted as marked on the object and supported by the studio receipt' },
    { text: 'Value assumes sale with the original oak base.', quote: 'The value assumes the sculpture is sold with its original oak base' },
    { text: 'No allowance for costs of sale.', quote: 'No allowance has been made for costs of sale' },
  ],
  questions: [],
  explainedPoints: [
    { topic: 'No time adjustment', note: 'The report explains that lifetime-cast results show no consistent trend; after the size adjustment, C4 (GBP 46,800) is close to C1 (GBP 46,000).', quote: 'C1 and C4, sixteen months apart, differ mainly by size' },
    { topic: 'Size adjustments', note: 'Described as approximations; the affected comparables are given less weight. Figures recompute (41,500 × 1.05 = 43,575; 52,000 × 0.90 = 46,800).', quote: 'the appraiser treats this as an approximation and gives these comparables less weight for that reason' },
    { topic: 'Posthumous cast C3', note: 'Shown for reference only with no weight; the lifetime/posthumous ratios in Appendix B recompute (66%, 62%, 68%).', quote: 'C3 is shown for reference only and was given no weight in the conclusion.' },
    { topic: 'Excluded sale at GBP 71,000', note: 'The exclusion is explained by the documented exhibition history of that cast.', quote: 'which the appraiser considers an exhibition premium not shared by the subject' },
    { topic: 'Cast number 3/8 vs. 5/8', note: 'Addressed in Section 7 with supporting observations in Appendix B.', quote: 'the appraiser found no consistent relationship between cast number and price after allowing for size and condition' },
    { topic: 'Price basis', note: 'All prices include premium, consistent with the stated basis of value.', quote: 'All prices include buyer’s premium.' },
    { topic: 'Oak base', note: 'The dependence of the value on the original base is disclosed as an assumption; its effect is stated as not quantified.', quote: 'without the base, the appraiser would expect a lower value, which has not been quantified in this report' },
  ],
  noQuestionsReason:
    'Within the checks performed, the purpose, basis of value and price basis are stated; the differences between the subject and each comparable (size, cast type, cast number, condition, sale date) are addressed in the text or appendices; the adjustment and ratio figures recompute; and the conclusion follows from the most-weighted comparable. No question was judged necessary. The reader may still wish to ask for sale references for the comparables.',
  scope: {
    coverage:
      'The full supplied text (Sections 1–8 and Appendices A–B, three pages) was read. Checks: purpose, basis, dates, currency and value extracted; adjustment and ratio arithmetic recomputed; each difference between subject and comparables traced to an explanation.',
    limitations: [...NO_LIMITS_COMMON],
  },
};

export const DEMO_ANALYSES: Record<string, AnalysisResult> = {
  'demo-harbour': harbour,
  'demo-tidal': tidal,
  'demo-bronze': bronze,
};

// ---------- Sample appraiser replies (fictional) for the second demo report ----------

export interface DemoAnswer {
  reportId: string;
  questionId: string;
  answer: string;
  analysis: AnswerAnalysisResult;
}

export const DEMO_ANSWERS: DemoAnswer[] = [
  {
    reportId: 'demo-tidal',
    questionId: 'q1',
    answer:
      'Salt Ledger was included because it was printed at Kestrel Press in the same period, on the same paper, and is the closest recent sale in scale and colour range. Of the −20% adjustment, about 16% reflects the hand colouring, based on the paired comparison in Appendix C. The remaining 4% reflects the smaller edition of 25 compared with 60; this part is my professional judgement and was not calculated from sales data. I would note that C3 received the least weight in the reconciliation.',
    analysis: {
      assessment: 'partially_addresses',
      summary:
        'The answer explains why C3 was included and splits the −20% into about 16% for hand colouring, which matches the Appendix C pair, and about 4% for edition size. The edition-size component is described as professional judgement without supporting sales data, so that part of the adjustment is still not supported by evidence.',
      explains: [
        { point: 'How the −20% is composed: about 16% for hand colouring and about 4% for the smaller edition.', answerQuote: 'Of the −20% adjustment, about 16% reflects the hand colouring, based on the paired comparison in Appendix C.' },
        { point: 'Why a different image was used: same printer, period and paper; closest in scale and colour range.', answerQuote: 'Salt Ledger was included because it was printed at Kestrel Press in the same period, on the same paper' },
      ],
      newStatements: [
        { statement: 'C3 was printed by the same press, in the same period and on the same paper as the subject.', answerQuote: 'it was printed at Kestrel Press in the same period, on the same paper', relation: 'new', reportQuote: null },
        { statement: 'The hand-colouring component rests on the paired comparison in Appendix C.', answerQuote: 'based on the paired comparison in Appendix C', relation: 'consistent_with_report', reportQuote: 'a difference of about 16%' },
        { statement: 'The 4% edition-size component is a judgement, not calculated from sales data.', answerQuote: 'this part is my professional judgement and was not calculated from sales data', relation: 'new', reportQuote: null },
        { statement: 'C3 received the least weight in the reconciliation.', answerQuote: 'C3 received the least weight in the reconciliation', relation: 'consistent_with_report', reportQuote: 'C3 was used as a check on the upper end of the range.' },
      ],
      unclear: [
        'What evidence, if any, supports an edition-size effect of about 4% between an edition of 25 and an edition of 60.',
      ],
      followUp: {
        warranted: true,
        reason:
          'Only the 4% edition-size component remains without stated support. Adjusted by −16% alone, C3 would be about EUR 11,928 instead of EUR 11,360; the effect on the conclusion is small given C3’s low weight, but the basis should be recorded.',
        question:
          'Is there any sales evidence, for this artist or for comparable editioned prints, that supports a price difference of about 4% between an edition of 25 and an edition of 60? If not, could the report state that this component is a judgement-based estimate?',
      },
    },
  },
  {
    reportId: 'demo-tidal',
    questionId: 'q2',
    answer:
      'All three auction comparables (C1–C3) were catalogued without condition notes beyond light handling, and I reviewed the condition reports provided by the auction houses before selecting them. I did not see C4, but the gallery described it as in excellent condition. The creases on the subject are confined to the margin and, in my experience with this artist’s prints, do not affect price at this level. The tape hinges are reversible and can be replaced by a framer at nominal cost. For these reasons I made no condition adjustment.',
    analysis: {
      assessment: 'addresses',
      summary:
        'The answer states that the comparables’ condition was reviewed and explains why no condition adjustment was made. The references to auction-house condition reports and to the gallery’s description are new statements that are not documented in the report; they are the appraiser’s account, not independent confirmation.',
      explains: [
        { point: 'The condition of C1–C3 was reviewed through auction condition reports.', answerQuote: 'I reviewed the condition reports provided by the auction houses before selecting them' },
        { point: 'Why the subject’s creases and hinges did not lead to an adjustment.', answerQuote: 'The creases on the subject are confined to the margin' },
      ],
      newStatements: [
        { statement: 'Auction-house condition reports for C1–C3 were reviewed before selection.', answerQuote: 'I reviewed the condition reports provided by the auction houses before selecting them', relation: 'new', reportQuote: null },
        { statement: 'C4 was not inspected; its condition is taken from the gallery’s description.', answerQuote: 'I did not see C4, but the gallery described it as in excellent condition', relation: 'new', reportQuote: null },
        { statement: 'The creases are confined to the margin.', answerQuote: 'The creases on the subject are confined to the margin', relation: 'consistent_with_report', reportQuote: 'There are two minor handling creases in the lower margin, not affecting the image.' },
      ],
      unclear: [],
      followUp: {
        warranted: false,
        reason:
          'The answer covers the question. If documentation is needed for the estate file, the reader could ask for copies of the condition reports, but this is optional.',
        question: null,
      },
    },
  },
  {
    reportId: 'demo-tidal',
    questionId: 'q4',
    answer:
      'C2 was weighted at about 50%, C1 and C4 at about 20% each, and C3 at about 10%. Applied to the adjusted values in Table 2, this gives approximately EUR 11,400, which I rounded to EUR 11,500. That the result equals the 2023 price of C2 is a coincidence.',
    analysis: {
      assessment: 'addresses',
      summary:
        'The answer gives the weights. Recomputed with the Table 2 values: 0.5 × 12,420 + 0.2 × 10,290 + 0.2 × 9,975 + 0.1 × 11,360 = EUR 11,399, matching the stated EUR 11,400 before rounding. The step from the data to the conclusion can now be reproduced.',
      explains: [
        { point: 'The weights applied in the reconciliation.', answerQuote: 'C2 was weighted at about 50%, C1 and C4 at about 20% each, and C3 at about 10%.' },
        { point: 'Rounding from about EUR 11,400 to EUR 11,500.', answerQuote: 'which I rounded to EUR 11,500' },
      ],
      newStatements: [
        { statement: 'Specific weights: C2 50%, C1 20%, C4 20%, C3 10%.', answerQuote: 'C2 was weighted at about 50%, C1 and C4 at about 20% each, and C3 at about 10%.', relation: 'consistent_with_report', reportQuote: 'Greatest weight was given to C2 as the same image and edition, with C1 and C4 as secondary support.' },
      ],
      unclear: [],
      followUp: {
        warranted: false,
        reason:
          'The weights recompute to the stated figure. Rounding EUR 11,399 up to EUR 11,500 is a judgement the reader may wish to note, but it does not call for another question.',
        question: null,
      },
    },
  },
];
