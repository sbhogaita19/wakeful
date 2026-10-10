import { avgSpendByCategory, householdIncome, latestBalance, latestMonth, netWorth, spendByCategory, totalSpend } from './analytics';
import { daysUntil, todayISO } from './dates';
import { activeBills, isLiability, type Vault } from '../types';

export interface Pillar { key: string; label: string; score: number; note: string; }

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** Transparent household "balance" score: five pillars, each 0–100, averaged. */
export function pulse(v: Vault, today = todayISO()): { overall: number; pillars: Pillar[] } | null {
  const cur = latestMonth(v.txns);
  if (!cur) return null;
  const income = householdIncome(v, cur);
  const spend = totalSpend(v.txns, cur);
  const pillars: Pillar[] = [];

  // Saving: 20% savings rate = 100
  const rate = income > 0 ? (income - spend) / income : 0;
  pillars.push({ key: 'saving', label: 'Saving', score: clamp((rate / 0.2) * 100),
    note: income > 0 ? `${Math.round(rate * 100)}% of take-home kept` : 'Add a payslip to measure' });

  // Spending: budget adherence, else spend vs income
  const budgeted = Object.entries(v.budget).filter(([, b]) => b > 0);
  const now = spendByCategory(v.txns, cur);
  if (budgeted.length) {
    const within = budgeted.filter(([c, b]) => (now[c] ?? 0) <= b * 1.05).length;
    pillars.push({ key: 'spending', label: 'Spending', score: clamp((within / budgeted.length) * 100),
      note: `${within} of ${budgeted.length} budgets on track` });
  } else {
    pillars.push({ key: 'spending', label: 'Spending', score: income > 0 ? clamp(100 - (spend / income) * 70) : 50,
      note: 'Set a budget to sharpen this' });
  }

  // Debt: unsecured debt vs annual income
  const unsecured = v.accounts.filter((a) => ['credit-card', 'loan', 'owed'].includes(a.kind)).reduce((s, a) => s + latestBalance(a), 0);
  const annual = income * 12;
  const ratio = annual > 0 ? unsecured / annual : 0;
  pillars.push({ key: 'debt', label: 'Debt', score: unsecured === 0 ? 100 : clamp(100 - ratio * 200),
    note: unsecured === 0 ? 'No unsecured debt' : `${Math.round(ratio * 100)}% of yearly income owed` });

  // Bills awareness: reviewed, nothing expiring unaddressed
  const bills = activeBills(v);
  if (bills.length) {
    const ok = bills.filter((b) => {
      const reviewed = b.reviewedOn && daysUntil(today, b.reviewedOn) <= 365;
      const expired = b.contractEnd && daysUntil(b.contractEnd, today) < 0 && b.kind !== 'council-tax';
      return reviewed && !expired;
    }).length;
    pillars.push({ key: 'bills', label: 'Bills', score: clamp((ok / bills.length) * 100), note: `${ok} of ${bills.length} bills reviewed this year` });
  } else pillars.push({ key: 'bills', label: 'Bills', score: 40, note: 'Add your household bills' });

  // Resilience: months of spending in liquid savings
  const liquid = v.accounts.filter((a) => ['current', 'savings', 'isa'].includes(a.kind)).reduce((s, a) => s + latestBalance(a), 0);
  const avg = Object.values(avgSpendByCategory(v.txns, cur)).reduce((a, b) => a + b, 0) || spend;
  const mos = avg > 0 ? liquid / avg : 0;
  pillars.push({ key: 'resilience', label: 'Resilience', score: clamp((mos / 6) * 100), note: `${mos.toFixed(1)} months of spending in cash` });

  const overall = clamp(pillars.reduce((s, p) => s + p.score, 0) / pillars.length);
  return { overall, pillars };
}

export { netWorth, isLiability };
