import type { Vault } from '../types';
import { dividendTax } from './tax';
import { taxYearOf } from './payslip';
import { daysUntil, todayISO } from './dates';

export interface DividendSummary {
  memberId: string; name: string;
  ytd: number; projected: number;          // pence, this tax year
  other: number;                           // annual non-dividend income used, pence
  taxYear: string; estTax: number; setAsidePct: number; band: string; net: number;
  deadline: { label: string; date: string; days: number };
  unassigned: boolean;
}

/** Whose dividend is it? An explicit choice wins, then the account owner. */
const owner = (v: Vault, t: { memberId?: string; accountId: string }) =>
  t.memberId ?? v.accounts.find((a) => a.id === t.accountId)?.ownerId ?? 'joint';

export function dividendSummaries(v: Vault, today = todayISO()): DividendSummary[] {
  const [start, end] = taxYearOf(today);
  const divs = v.txns.filter((t) => t.category === 'Dividends' && t.pence > 0 && !t.transfer);
  const out: DividendSummary[] = [];
  const elapsed = Math.max(1 / 12, Math.min(1, (Date.parse(today) - Date.parse(start)) / (Date.parse(end) - Date.parse(start) + 86400000)));
  const yearEnd = +end.slice(0, 4);
  for (const m of v.household.members) {
    const mine = divs.filter((t) => owner(v, t) === m.id);
    if (!mine.length) continue;
    const inYear = mine.filter((t) => t.date >= start && t.date <= end);
    const ytd = inYear.reduce((s, t) => s + t.pence, 0);
    // run-rate over the tax year so far; if nothing yet this year, use the last 12 months
    const last12 = mine.filter((t) => daysUntil(today, t.date) <= 365 && t.date <= today).reduce((s, t) => s + t.pence, 0);
    const projected = ytd > 0 ? Math.round(ytd / elapsed) : last12;
    const slips = v.payslips.filter((p) => p.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date));
    const other = slips[0] ? slips[0].gross * 12 : 0;
    const r = dividendTax(other / 100, projected / 100);
    const estTax = Math.round(r.tax * 100);
    const filing = `31 Jan ${yearEnd + 1}`;
    const filingDate = `${yearEnd + 1}-01-31`;
    out.push({ memberId: m.id, name: m.name, ytd, projected, other, taxYear: `${yearEnd - 1}/${String(yearEnd).slice(2)}`, estTax,
      setAsidePct: projected > 0 ? Math.round((estTax / projected) * 100) : 0, band: r.band, net: projected - estTax,
      deadline: { label: `Self Assessment return and payment (${filing})`, date: filingDate, days: daysUntil(filingDate, today) }, unassigned: false });
  }
  return out;
}

export function unassignedDividends(v: Vault): number {
  return v.txns.filter((t) => t.category === 'Dividends' && t.pence > 0 && owner(v, t) === 'joint').reduce((s, t) => s + t.pence, 0);
}
