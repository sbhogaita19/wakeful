import { NON_SPEND, isLiability, type Account, type Txn, type Vault } from '../types';
import { addMonths, ym } from './dates';
import { merchantKey } from './categorise';
import { takeHome } from './payslip';

export const months = (txns: Txn[]) => [...new Set(txns.map((t) => ym(t.date)))].sort();
export const latestMonth = (txns: Txn[]) => months(txns).at(-1);

/** Spend by category for a month, in positive pence. Refunds offset. */
export function spendByCategory(txns: Txn[], month: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const t of txns) {
    if (ym(t.date) !== month || t.transfer || NON_SPEND.has(t.category)) continue;
    out[t.category] = (out[t.category] ?? 0) - t.pence;
  }
  for (const k of Object.keys(out)) if (out[k] <= 0) delete out[k];
  return out;
}

export const totalSpend = (txns: Txn[], month: string) =>
  Object.values(spendByCategory(txns, month)).reduce((a, b) => a + b, 0);

export function incomeOf(txns: Txn[], month: string): number {
  return txns.filter((t) => ym(t.date) === month && !t.transfer && (t.category === 'Income' || t.category === 'Dividends') && t.pence > 0)
    .reduce((s, t) => s + t.pence, 0);
}

export function monthlySeries(txns: Txn[], upTo: string, n = 6) {
  const list: { month: string; income: number; spend: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(upTo, -i);
    list.push({ month: m, income: incomeOf(txns, m), spend: totalSpend(txns, m) });
  }
  return list;
}

/** Household monthly income: payslip take-home if known, else recorded income. */
export function householdIncome(v: Vault, month: string): number {
  const th = takeHome(v.payslips);
  if (th <= 0) return incomeOf(v.txns, month);
  // payslips don't show dividends, so add their recent monthly average
  const ms = Array.from({ length: 6 }, (_, i) => addMonths(month, -i));
  const divs = v.txns.filter((t) => t.category === 'Dividends' && t.pence > 0 && !t.transfer && ms.includes(ym(t.date))).reduce((s, t) => s + t.pence, 0);
  return th + Math.round(divs / 6);
}

export function avgSpendByCategory(txns: Txn[], upTo: string, n = 6): Record<string, number> {
  const out: Record<string, number> = {};
  const ms = Array.from({ length: n }, (_, i) => addMonths(upTo, -i)).filter((m) => months(txns).includes(m));
  for (const m of ms) for (const [c, v] of Object.entries(spendByCategory(txns, m))) out[c] = (out[c] ?? 0) + v;
  for (const c of Object.keys(out)) out[c] = Math.round(out[c] / Math.max(1, ms.length));
  return out;
}

export interface Recurring { key: string; label: string; category: string; monthly: number; months: number; lastDate: string; annual: boolean }

/** Merchants that charge a near-identical amount in 3+ distinct months. */
export function recurring(txns: Txn[]): Recurring[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.pence >= 0 || t.transfer || NON_SPEND.has(t.category)) continue;
    const k = merchantKey(t.desc);
    if (!k) continue;
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    const ms = new Set(list.map((t) => ym(t.date)));
    if (ms.size < 3) continue;
    const amts = list.map((t) => -t.pence).sort((a, b) => a - b);
    const med = amts[Math.floor(amts.length / 2)];
    if (!amts.every((a) => Math.abs(a - med) <= med * 0.15 + 50)) continue;
    const last = list.sort((a, b) => b.date.localeCompare(a.date))[0];
    out.push({ key, label: last.desc, category: last.category, monthly: med, months: ms.size, lastDate: last.date, annual: false });
  }
  return out.sort((a, b) => b.monthly - a.monthly);
}

const latestEntry = (a: Account) => [...a.balances].sort((x, y) => y.date.localeCompare(x.date))[0];
export const latestBalance = (a: Account) => latestEntry(a)?.pence ?? 0;

/** Current value: for property with a growth assumption, projects forward from the last valuation. */
export function valueNow(a: Account, today = new Date().toISOString().slice(0, 10)): number {
  const e = latestEntry(a);
  if (!e) return 0;
  if (a.kind !== 'property' || !a.growthPct) return e.pence;
  const years = Math.max(0, (Date.parse(today) - Date.parse(e.date)) / 31557600000);
  return Math.round(e.pence * Math.pow(1 + a.growthPct / 100, years));
}

/** Equity and loan-to-value across the household's properties and mortgages. */
export function homeEquity(accounts: Account[], today?: string) {
  const value = accounts.filter((a) => a.kind === 'property').reduce((s, a) => s + valueNow(a, today), 0);
  const owed = accounts.filter((a) => a.kind === 'mortgage').reduce((s, a) => s + latestBalance(a), 0);
  return value > 0 ? { value, owed, equity: value - owed, ltv: (owed / value) * 100 } : null;
}

export function netWorth(accounts: Account[], skip?: Set<string>) {
  let assets = 0, debts = 0;
  for (const a of accounts) {
    if (skip?.has(a.id)) continue;
    const b = valueNow(a);
    if (isLiability(a.kind)) debts += b; else assets += b;
  }
  return { assets, debts, net: assets - debts };
}

export function netWorthHistory(accounts: Account[], skip?: Set<string>) {
  accounts = skip ? accounts.filter((a) => !skip.has(a.id)) : accounts;
  const dates = [...new Set(accounts.flatMap((a) => a.balances.map((b) => b.date)))].sort();
  return dates.map((d) => {
    let net = 0;
    for (const a of accounts) {
      const b = [...a.balances].filter((x) => x.date <= d).sort((x, y) => y.date.localeCompare(x.date))[0];
      if (!b) continue;
      net += isLiability(a.kind) ? -b.pence : b.pence;
    }
    return { date: d, net };
  });
}
