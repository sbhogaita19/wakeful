import type { Payslip } from '../types';
import { parseDate } from './dates';
import { parseMoney } from './money';
import { employeeNI, incomeTax, incomeTaxFor, parseTaxCode } from './tax';

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

const ALL_MONEY = /-?£?\d{1,3}(?:,\d{3})*\.\d{2}|-?£?\d+\.\d{2}/g;
/** Amount column of an earnings line: hours/rate/amount → third figure; period/YTD → first. */
function earningsAmount(line: string): number | null {
  const m = line.match(ALL_MONEY);
  if (!m) return null;
  const v = parseMoney(m[m.length >= 3 ? 2 : 0]);
  return v === null ? null : Math.abs(v);
}

/** Extract pay figures from payslip text lines. The user always confirms before saving. */
export function parsePayslipLines(lines: string[]): PayslipGuess {
  const out: PayslipGuess = { found: [] };
  for (const line of lines) {
    if (!out.taxCode) {
      const m = line.match(/\btax code\b[^A-Za-z0-9]*([A-Z]?\d{1,4}[A-Z]|BR|D0|D1|NT|0T|K\d{1,4})(?:\s+(W1|M1|X))?/i);
      if (m) { out.taxCode = `${m[1].toUpperCase()}${m[2] ? ' ' + m[2].toUpperCase() : ''}`; out.found.push('tax code'); }
    }
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
    if (!/\b(ytd|year to date|cumulative|total)\b/i.test(line)) {
      if (/\b(overtime|o\/t|shift (pay|premium|allowance)|enhanced (rate|pay)|unsocial)\b/i.test(line)) {
        const a = earningsAmount(line); if (a) { out.overtime = (out.overtime ?? 0) + a; if (!out.found.includes('overtime')) out.found.push('overtime'); }
      } else if (/\b(bonus|commission)\b/i.test(line)) {
        const a = earningsAmount(line); if (a) { out.bonus = (out.bonus ?? 0) + a; if (!out.found.includes('bonus')) out.found.push('bonus'); }
      } else if (out.basic === undefined && /\b(basic pay|basic salary|standard pay|contractual pay|salary)\b/i.test(line) && !/gross|net/i.test(line)) {
        const a = earningsAmount(line); if (a) { out.basic = a; out.found.push('basic'); }
      }
    }
    if (!out.employer) {
      const m = line.match(/\b(employer|company)\b[:\s]+([A-Za-z0-9 &.,'-]{3,40})$/i);
      if (m) out.employer = m[2].trim();
    }
  }
  if (out.overtime && out.gross && out.overtime > out.gross) delete out.overtime;
  if (out.bonus && out.gross && out.bonus > out.gross) delete out.bonus;
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

export interface TaxCheck { problems: string[]; code?: string; }

/** Check a payslip's tax code and whether tax + NI look right for it. Indicative only. */
export function taxCheck(p: Payslip): TaxCheck {
  const problems: string[] = [];
  const info = parseTaxCode(p.taxCode);
  if (info) {
    if (info.emergency) problems.push(`Tax code ${p.taxCode} is an emergency (non-cumulative) code. You may be overpaying until HMRC issues your correct code — check your personal tax account.`);
    else if (!info.standard) problems.push(`Tax code ${p.taxCode} isn't the standard 1257L.${info.note ? ' ' + info.note : ''} That can be right (benefits, a second job, past underpayment) but is worth checking against your HMRC personal tax account.`);
  }
  if (p.gross >= 100000) {
    const annual = (p.gross / 100) * 12;
    const allowance = info?.allowance ?? 12570;
    const hi = incomeTaxFor(annual, allowance, info?.flat);
    const lo = incomeTaxFor(Math.max(0, annual - (p.pension / 100) * 12), allowance, info?.flat);
    const expLo = (lo / 12) * 100 * 0.9, expHi = (hi / 12) * 100 * 1.1;
    const ni = (employeeNI(annual) / 12) * 100;
    const label = p.taxCode ? ` on code ${p.taxCode}` : ' (assuming code 1257L)';
    const range = `£${Math.round(expLo / 100)}–£${Math.round(expHi / 100)}`;
    if (p.tax < expLo - 5000) problems.push(`Income tax £${Math.round(p.tax / 100)} looks low${label}; about ${range} expected. You may be underpaying and owe HMRC later.`);
    if (p.tax > expHi + 5000) problems.push(`Income tax £${Math.round(p.tax / 100)} looks high${label}; about ${range} expected. You may be overpaying — check your tax code.`);
    if (Math.abs(p.ni - ni) > Math.max(3000, ni * 0.15)) problems.push(`National Insurance £${Math.round(p.ni / 100)} differs from the ~£${Math.round(ni / 100)} expected.`);
  }
  return { problems, code: p.taxCode };
}

/** Kept for callers that want one message. */
export function taxSanity(p: Payslip): string | null {
  const c = taxCheck(p);
  return c.problems.length ? `${c.problems.join(' ')} Indicative only (England tax bands).` : null;
}

export interface EarningsSummary { slips: number; gross: number; overtime: number; bonus: number; basic: number; avgOvertime: number; overtimeShare: number; swing: number; }

/** Earnings to date over a set of payslips (e.g. last six months or the tax year). */
export function earningsSummary(slips: Payslip[]): EarningsSummary {
  const gross = slips.reduce((s, p) => s + p.gross, 0);
  const overtime = slips.reduce((s, p) => s + (p.overtime ?? 0), 0);
  const bonus = slips.reduce((s, p) => s + (p.bonus ?? 0), 0);
  const basic = slips.reduce((s, p) => s + (p.basic ?? Math.max(0, p.gross - (p.overtime ?? 0) - (p.bonus ?? 0))), 0);
  const nets = slips.map((p) => p.net);
  return { slips: slips.length, gross, overtime, bonus, basic, avgOvertime: slips.length ? Math.round(overtime / slips.length) : 0,
    overtimeShare: gross ? overtime / gross : 0, swing: nets.length ? Math.max(...nets) - Math.min(...nets) : 0 };
}

/** UK tax year (6 Apr – 5 Apr) containing a date, as [start, end] ISO dates. */
export function taxYearOf(date: string): [string, string] {
  const y = +date.slice(0, 4);
  const startYear = date >= `${y}-04-06` ? y : y - 1;
  return [`${startYear}-04-06`, `${startYear + 1}-04-05`];
}
