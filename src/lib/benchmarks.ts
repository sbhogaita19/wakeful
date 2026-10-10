/**
 * Reference figures used for "am I paying too much?" checks. Bundled, never fetched.
 * Energy figures: Ofgem price cap, 1 Oct – 31 Dec 2026, GB average, Direct Debit (electricity excludes VAT during the
 * 0% VAT period 1 Oct 2026 – 31 Mar 2027; gas includes 5% VAT). Update each quarter.
 */
export const BENCH = {
  asOf: '2026-10-01',
  source: 'Ofgem price cap, Oct–Dec 2026',
  electricity: { unit: 26.32, standing: 54.83 }, // pence/kWh, pence/day
  gas: { unit: 7.97, standing: 29.68 },
  typicalKwh: { electricity: 2500, gas: 9500 }, // medium household per year
  typicalDualFuelAnnual: 172300, // pence
  /** Indicative only; varies widely. */
  indicative: {
    broadbandMonthly: 3500,
    mobileSimMonthly: 1500,
  },
  /** kg CO2e per kWh — UK government conversion factors (approximate, update annually). */
  carbon: { electricity: 0.177, gas: 0.183 },
} as const;
