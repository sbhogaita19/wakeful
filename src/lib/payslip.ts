import type { Payslip } from '../types';
import { parseDate } from './dates';
import { parseMoney } from './money';
import { employeeNI, incomeTax } from './tax';

const NUM = /-?£?\d{1,3}(?:,\d{3})*\.\d{2}|-?£?\d+\.\d{2}/;

function firstAmount(line: string): number | null {
  const m = line.match(NUM);
  return m ? parseMoney(m[0]) : null;
}

const LABELS: [keyof Pick<Payslip, 'gross' | 'tax' | 'ni' | 'pension' | 'studentLoan' | 'net'>, RegExp][] = [
  ['net', /\b(net pay|take[- ]?home|net salary|net amount|amount payable|net payment)\b/i],
  ['gross', /\b(gross pay|total gross|gross salary|gross earnings|gross for tax|total earnings|total payments)\b/i],
  ['studentLoan', /\b(student loan|sl plan|postgrad loan)\b/i],
  ['ni', /\b(national insurance|nat(ional)? ins|\bni\b|nic)\b/i],
  ['pension', /\b(pension|employee pension|workplace pension|avc)\b/i],
  ['tax', /\b(income tax|paye( tax)?|tax deducted|tax this period)\b/i],
];

export interface PayslipGuess extends Partial<Payslip> { found: string[]; }

/** Extract pay figures from payslip text lines. The user always confirms before saving. */
export function parsePayslipLines(lines: string[]): PayslipGuess {
  const out: PayslipGuess = { found: [] };
  for (const line of lines) {
    if (/\b(ytd|year to date|taxable pay|tax code|cumulative)\b/i.test(line) && !/this period/i.test(line)) continue;
    for (const [key, re] of LABELS) {
      if (out[key] !== undefined) continue;
      if (re.test(line)) {
        const v = firstAmount(line);
        if (v !== null) { out[key] = Math.abs(v) as never; out.found.push(key); }
      }
    }
    if (!out.date) {
      const m = line.match(/\b(pay date|payment date|date paid|period ending|pay period end)\b[^0-9A-Za-z]*(.+)$/i);
      if (m) {
        const d = parseDate(m[2].trim().split(/\s{2,}/)[0]) ?? parseDate(m[2].trim().split(' ').slice(0, 3).join(' '));
        if (d) { out.date = d; out.found.push('date'); }
      }
    }
    if (!out.employer) {
      const m = line.match(/\b(employer|company)\b[:\s]+([A-Za-z0-9 &.,'-]{3,40})$/i);
      if (m) out.employer = m[2].trim();
    }
  }
  return out;
}

/** Implied net if the parts add up; used for sanity-checking a parsed/typed payslip. */
export function impliedNet(p: Pick<Payslip, 'gross' | 'tax' | 'ni' | 'pension' | 'studentLoan' | 'otherDeductions'>) {
  return p.gross - p.tax - p.ni - p.pension - p.studentLoan - p.otherDeductions;
}

/** Average of the most recent payslips per member, summed for the household (pence per month). */
export function takeHome(payslips: Payslip[], perMember = 3): number {
  const byMember = new Map<string, Payslip[]>();
  for (const p of payslips) byMember.set(p.memberId, [...(byMember.get(p.memberId) ?? []), p]);
  let total = 0;
  for (const list of byMember.values()) {
    const recent = list.sort((a, b) => b.date.localeCompare(a.date)).slice(0, perMember);
    total += recent.reduce((s, p) => s + p.net, 0) / recent.length;
  }
  return Math.round(total);
}

/** Does the payslip's tax + NI look plausible for a monthly salary? Returns a message if not. */
export function taxSanity(p: Payslip): string | null {
  if (p.gross < 100000) return null; // under £1,000 — too small to judge
  const annual = (p.gross / 100) * 12;
  const lo = incomeTax(Math.max(0, annual - (p.pension / 100) * 12));
  const hi = incomeTax(annual);
  const expTaxLo = (lo / 12) * 100 * 0.9;
  const expTaxHi = (hi / 12) * 100 * 1.1;
  const ni = (employeeNI(annual) / 12) * 100;
  const msgs: string[] = [];
  if (p.tax < expTaxLo - 5000) msgs.push(`income tax looks low (~${Math.round(expTaxLo / 100)}–${Math.round(expTaxHi / 100)} expected)`);
  if (p.tax > expTaxHi + 5000) msgs.push(`income tax looks high (~${Math.round(expTaxLo / 100)}–${Math.round(expTaxHi / 100)} expected) — check your tax code`);
  if (Math.abs(p.ni - ni) > Math.max(3000, ni * 0.15)) msgs.push(`NI differs from the ~£${Math.round(ni / 100)} expected`);
  return msgs.length ? `On a £${Math.round(annual).toLocaleString('en-GB')} salary, ${msgs.join('; ')}. Indicative only (assumes tax code 1257L, England).` : null;
}
