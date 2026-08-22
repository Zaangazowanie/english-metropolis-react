// AI lesson analysis — the price authority.
//
// Every number the customer is ever charged for the analysis is in this file
// and nowhere else. The browser reads them through `analysisOffers:myOffer`
// and never sends an amount back; `p24:preparePayment` prices from the stored
// quote. If you change a number here, nothing else needs editing.
//
// ⚠️ Checkout.jsx still carries its own ANALYSIS_PLN_PER_LESSON mirror for the
// package-checkout add-on line (pre-existing, 2026-08-10). The upgrade CTA
// added on 2026-08-17 does NOT mirror anything — it reads the server.

// The single-lesson price, unchanged since 2026-08-10.
export const ANALYSIS_ADDON_PLN_PER_LESSON = 20;

// ── The volume discount ──────────────────────────────────────────────────────
//
// "All my lessons" buys the analysis for every lesson already on the account
// that has none, AND every lesson the student ever has afterwards, permanently.
// It is priced on the lessons they already have, at a per-lesson rate that
// falls with the count — so the customer pays for the backlog and the future
// comes free. That framing is why the top tier can be as low as it is: the
// inference bill is cents a lesson, so attach rate is worth more than margin
// per unit (same reasoning as the original 20 PLN call).
//
// Mike will want to set the real numbers. These are defaults, not a decision.
export const ANALYSIS_BULK_TIERS: Array<{ fromLessons: number; pricePLN: number }> = [
  { fromLessons: 20, pricePLN: 12 },   // 40% off list
  { fromLessons: 10, pricePLN: 15 },   // 25% off
  { fromLessons: 5, pricePLN: 17 },    // 15% off
  { fromLessons: 0, pricePLN: ANALYSIS_ADDON_PLN_PER_LESSON },
];

// A brand-new account with one lesson must not be able to buy unlimited
// analysis forever for 20 PLN. Billing is floored at this many lessons, so the
// entry price for the account-wide upgrade is 4 × 20 = 80 PLN.
export const ANALYSIS_BULK_MIN_BILLABLE_LESSONS = 4;

// …and a student with years of history must not be quoted a number nobody
// would ever pay. The total is capped here regardless of the count.
export const ANALYSIS_BULK_MAX_PLN = 600;

export type BulkQuote = {
  coveredLessons: number;      // lessons on the account today with no analysis
  billableLessons: number;     // what is actually charged for (floored)
  perLessonPLN: number;        // the tier rate that applied
  totalPLN: number;            // after the cap
  listTotalPLN: number;        // the same lessons at 20 PLN each
  savingPLN: number;
  capped: boolean;
};

// The one function that prices the account-wide upgrade. Called only on the
// server, only with a count the server itself computed.
export function priceBulkAnalysis(coveredLessons: number): BulkQuote {
  const covered = Math.max(0, Math.trunc(coveredLessons));
  const billableLessons = Math.max(covered, ANALYSIS_BULK_MIN_BILLABLE_LESSONS);
  // Tiers are ordered high-to-low, so the first match is the deepest one earned.
  const tier = ANALYSIS_BULK_TIERS.find(t => billableLessons >= t.fromLessons)
    ?? ANALYSIS_BULK_TIERS[ANALYSIS_BULK_TIERS.length - 1];
  const uncapped = billableLessons * tier.pricePLN;
  const totalPLN = Math.min(uncapped, ANALYSIS_BULK_MAX_PLN);
  const listTotalPLN = billableLessons * ANALYSIS_ADDON_PLN_PER_LESSON;
  return {
    coveredLessons: covered,
    billableLessons,
    perLessonPLN: tier.pricePLN,
    totalPLN,
    listTotalPLN,
    savingPLN: Math.max(0, listTotalPLN - totalPLN),
    capped: uncapped > ANALYSIS_BULK_MAX_PLN,
  };
}
