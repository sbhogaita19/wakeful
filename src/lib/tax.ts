/** Indicative UK (England/Wales/NI) income tax and employee NI, 2026/27 thresholds (frozen). Annual pounds in, pounds out. */
export function incomeTax(income: number): number {
  const pa = income > 100000 ? Math.max(0, 12570 - (income - 100000) / 2) : 12570;
  const t = Math.max(0, income - pa);
  const basic = Math.min(t, 37700);
  const higher = Math.max(0, Math.min(t, 125140) - 37700);
  const addl = Math.max(0, t - 125140);
  return basic * 0.2 + higher * 0.4 + addl * 0.45;
}

export function employeeNI(gross: number): number {
  return Math.max(0, Math.min(gross, 50270) - 12570) * 0.08 + Math.max(0, gross - 50270) * 0.02;
}

export interface TaxCodeInfo { allowance: number | null; flat?: number; emergency: boolean; standard: boolean; note?: string; }

/** Interpret a UK tax code (annual allowance in pounds). */
export function parseTaxCode(raw: string | undefined): TaxCodeInfo | null {
  if (!raw) return null;
  const code = raw.toUpperCase().replace(/\s+/g, ' ').trim();
  const emergency = /\b(W1|M1|X)\b|(W1|M1|X)$/.test(code);
  const base = code.replace(/\s*(W1|M1|X)$/, '').replace(/^S|^C/, '').trim();
  let m: RegExpMatchArray | null;
  if ((m = base.match(/^(\d{1,4})([LMNTY])$/))) {
    const a = Number(m[1]) * 10 + 9;
    return { allowance: a, emergency, standard: Number(m[1]) === 1257 && m[2] === 'L' };
  }
  if ((m = base.match(/^K(\d{1,4})$/))) return { allowance: -Number(m[1]) * 10, emergency, standard: false, note: 'K code: untaxed income or benefits are being added to your taxable pay.' };
  if (base === 'BR') return { allowance: 0, flat: 0.2, emergency, standard: false, note: 'BR taxes all pay at 20% — normal for a second job, otherwise check it.' };
  if (base === 'D0') return { allowance: 0, flat: 0.4, emergency, standard: false, note: 'D0 taxes all pay at 40%.' };
  if (base === 'D1') return { allowance: 0, flat: 0.45, emergency, standard: false, note: 'D1 taxes all pay at 45%.' };
  if (base === '0T') return { allowance: 0, emergency, standard: false, note: '0T gives no tax-free allowance.' };
  if (base === 'NT') return { allowance: null, emergency, standard: false, note: 'NT means no tax is deducted.' };
  return { allowance: null, emergency, standard: false };
}

/** Annual income tax for a given allowance (England/Wales/NI bands, no taper). */
export function incomeTaxFor(income: number, allowance: number, flat?: number): number {
  if (flat !== undefined) return income * flat;
  if (allowance === 12570 || allowance === 12579) return incomeTax(income);
  const t = Math.max(0, income - allowance);
  return Math.min(t, 37700) * 0.2 + Math.max(0, Math.min(t, 125140) - 37700) * 0.4 + Math.max(0, t - 125140) * 0.45;
}

/** UK dividend tax rates, 2026/27 (GOV.UK: allowance £500; 10.75% / 35.75% / 39.35%). */
export const DIV = { allowance: 500, basic: 0.1075, higher: 0.3575, additional: 0.3935 } as const;

/**
 * Dividend tax for a year. `other` = non-dividend taxable income (salary etc., pounds); `dividends` = pounds.
 * Dividends sit on top of other income; unused personal allowance and the £500 allowance come off first.
 */
export function dividendTax(other: number, dividends: number): { tax: number; allowanceUsed: number; effective: number; band: 'basic' | 'higher' | 'additional' | 'none' } {
  if (dividends <= 0) return { tax: 0, allowanceUsed: 0, effective: 0, band: 'none' };
  const pa = other + dividends > 100000 ? Math.max(0, 12570 - (other + dividends - 100000) / 2) : 12570;
  const nonDiv = Math.max(0, other - pa);
  const unusedPa = Math.max(0, pa - other);
  const divTaxable = Math.max(0, dividends - unusedPa);
  const allowanceUsed = Math.min(DIV.allowance, divTaxable);
  const start = nonDiv + allowanceUsed;                  // allowance still occupies band space
  const end = nonDiv + divTaxable;
  const overlap = (lo: number, hi: number) => Math.max(0, Math.min(end, hi) - Math.max(start, lo));
  const basic = overlap(0, 37700), higher = overlap(37700, 125140), addl = overlap(125140, Infinity);
  const tax = basic * DIV.basic + higher * DIV.higher + addl * DIV.additional;
  const band = addl > 0 ? 'additional' : higher > 0 ? 'higher' : basic > 0 ? 'basic' : 'none';
  return { tax, allowanceUsed, effective: tax / dividends, band };
}
