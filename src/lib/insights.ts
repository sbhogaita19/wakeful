import { BENCH } from './benchmarks';
import { avgSpendByCategory, homeEquity, householdIncome, latestBalance, latestMonth, netWorth, recurring, spendByCategory, totalSpend, months as monthsOf } from './analytics';
import { addMonths, daysUntil, todayISO, ym } from './dates';
import { fmt0 } from './money';
import { taxSanity } from './payslip';
import { activeBills, isLiability, type Vault } from '../types';
import { merchantKey } from './categorise';

export type Severity = 'high' | 'medium' | 'info';
export type Area = 'spending' | 'bills' | 'debt' | 'saving' | 'giving' | 'planet' | 'income';

export interface Insight {
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  detail: string;
  /** estimated saving per year, pence */
  yearly?: number;
}

const sevRank: Record<Severity, number> = { high: 0, medium: 1, info: 2 };

export function buildInsights(v: Vault, today = todayISO()): Insight[] {
  const out: Insight[] = [];
  const cur = latestMonth(v.txns);
  const income = cur ? householdIncome(v, cur) : 0;

  // ---- Bills: contracts, price rises, benchmarks
  for (const b of activeBills(v)) {
    const label = `${b.provider} (${b.kind.replace('-', ' ')})`;
    if (b.contractEnd) {
      const d = daysUntil(b.contractEnd, today);
      if (d < 0 && b.kind !== 'council-tax') {
        out.push({ id: `end-${b.id}`, area: 'bills', severity: 'high', title: `${label}: contract has ended`,
          detail: `Ended ${-d} days ago. You are probably on a more expensive default rate — compare and switch.`, yearly: Math.round(b.monthly * 12 * 0.15) });
      } else if (d >= 0 && d <= 60) {
        out.push({ id: `end-${b.id}`, area: 'bills', severity: 'medium', title: `${label}: renewal in ${d} days`,
          detail: 'Review before it rolls onto a higher rate. Switching or negotiating often saves 10–20%.', yearly: Math.round(b.monthly * 12 * 0.1) });
      }
    }
    const h = [...b.history].sort((a, c) => a.date.localeCompare(c.date));
    if (h.length >= 2) {
      const first = h[0], last = h[h.length - 1];
      const months = Math.max(1, (Date.parse(last.date) - Date.parse(first.date)) / 2629800000);
      const rise = (last.monthly - first.monthly) / first.monthly;
      if (rise > 0.08 && months <= 14 && last.monthly - first.monthly > 300) {
        out.push({ id: `rise-${b.id}`, area: 'bills', severity: 'medium', title: `${label} is up ${(rise * 100).toFixed(0)}%`,
          detail: `From ${fmt0(first.monthly)} to ${fmt0(last.monthly)} a month. Check for a mid-contract rise or a missed discount.`, yearly: (last.monthly - first.monthly) * 12 });
      }
    }
    if (b.kind === 'energy' && b.unitRate && b.fuel) {
      const ref = BENCH[b.fuel];
      if (b.unitRate > ref.unit * 1.08) {
        const kwh = BENCH.typicalKwh[b.fuel];
        out.push({ id: `unit-${b.id}`, area: 'bills', severity: 'high', title: `${b.provider} ${b.fuel} unit rate above the price cap`,
          detail: `${b.unitRate}p/kWh vs ${ref.unit}p cap average (${BENCH.source}). A fixed deal at or below the cap would help.`,
          yearly: Math.round(((b.unitRate - ref.unit) / 100) * kwh * 100) });
      }
      if (b.standingCharge && b.standingCharge > ref.standing * 1.1) {
        out.push({ id: `sc-${b.id}`, area: 'bills', severity: 'medium', title: `${b.provider} ${b.fuel} standing charge is high`,
          detail: `${b.standingCharge}p/day vs ${ref.standing}p cap average.`, yearly: Math.round((b.standingCharge - ref.standing) * 365) });
      }
    }
    if (b.kind === 'broadband' && b.monthly > BENCH.indicative.broadbandMonthly * 1.3) {
      out.push({ id: `bb-${b.id}`, area: 'bills', severity: 'medium', title: `Broadband looks expensive`,
        detail: `${fmt0(b.monthly)}/mo vs roughly ${fmt0(BENCH.indicative.broadbandMonthly)} typical. Ask for a loyalty deal or compare.`, yearly: (b.monthly - BENCH.indicative.broadbandMonthly) * 12 });
    }
    if (b.kind === 'mobile' && b.monthly > BENCH.indicative.mobileSimMonthly * 2) {
      out.push({ id: `mob-${b.id}`, area: 'bills', severity: 'medium', title: `Mobile plan looks expensive`,
        detail: `${fmt0(b.monthly)}/mo vs roughly ${fmt0(BENCH.indicative.mobileSimMonthly)} for a SIM-only plan.`, yearly: (b.monthly - BENCH.indicative.mobileSimMonthly) * 12 });
    }
    if (!b.reviewedOn || daysUntil(today, b.reviewedOn) > 365) {
      if (['energy', 'broadband', 'mobile', 'insurance'].includes(b.kind))
        out.push({ id: `rev-${b.id}`, area: 'bills', severity: 'info', title: `${label}: not reviewed in a year`,
          detail: 'Loyalty rarely pays. A 10-minute review is the best-value saving there is.' });
    }
  }
  const dupKinds = activeBills(v).filter((b) => b.kind === 'subscription');
  if (dupKinds.length >= 5) {
    const tot = dupKinds.reduce((s, b) => s + b.monthly, 0);
    out.push({ id: 'subs-many', area: 'spending', severity: 'info', title: `${dupKinds.length} subscriptions`, detail: `${fmt0(tot)} a month. Which ones do you truly use?`, yearly: Math.round(tot * 12 * 0.25) });
  }

  // Bills that have stopped appearing in the bank data — probably cancelled or switched.
  if (v.txns.length) {
    const lastDay = v.txns.reduce((m, t) => (t.date > m ? t.date : m), '0000');
    for (const b of activeBills(v)) {
      if (!b.match || b.monthly <= 0) continue;
      const seen = v.txns.filter((t) => t.pence < 0 && t.desc.toUpperCase().includes(b.match!.toUpperCase())).map((t) => t.date).sort();
      if (seen.length >= 2 && daysUntil(lastDay, seen[seen.length - 1]) > 75) {
        const repl = activeBills(v).find((x) => x.kind === b.kind && x.id !== b.id && x.auto);
        out.push({ id: `gone-${b.id}`, area: 'bills', severity: 'info',
          title: `${b.provider}: no payments since ${seen[seen.length - 1]}`,
          detail: repl ? `Did you switch to ${repl.provider}? Open Bills → ${b.provider} → “I’ve switched provider” to keep your records and savings accurate.` : 'Cancelled or switched? Mark it as ended in Bills so it stops counting.' });
      }
    }
  }

  if (!cur) return finish(out, v);

  // ---- Subscriptions (detected from transactions)
  const rec = recurring(v.txns).filter((r) => ['Subscriptions', 'Entertainment', 'Shopping', 'Other', 'Health'].includes(r.category));
  if (rec.length) {
    const tot = rec.reduce((s, r) => s + r.monthly, 0);
    out.push({ id: 'subs', area: 'spending', severity: tot > 6000 ? 'medium' : 'info',
      title: `${rec.length} recurring charges: ${fmt0(tot)}/month`,
      detail: rec.slice(0, 5).map((r) => `${r.label} ${fmt0(r.monthly)}`).join(' · ') + (rec.length > 5 ? ' …' : ''),
      yearly: Math.round(tot * 12 * 0.2) });
  }

  // ---- Duplicate charges
  const seen = new Map<string, string>();
  for (const t of v.txns) {
    if (t.pence >= 0 || t.transfer) continue;
    const k = `${merchantKey(t.desc)}|${t.pence}`;
    const prev = seen.get(k);
    if (prev && Math.abs(Date.parse(t.date) - Date.parse(prev)) <= 2 * 86400000 && merchantKey(t.desc)) {
      out.push({ id: `dup-${t.id}`, area: 'spending', severity: 'medium', title: `Possible duplicate: ${t.desc}`,
        detail: `${fmt0(-t.pence)} charged twice within 2 days (${prev} and ${t.date}).`, yearly: -t.pence });
    }
    seen.set(k, t.date);
  }

  // ---- Fees & interest
  const fees = Object.values(
    Object.fromEntries(monthsOf(v.txns).slice(-6).map((m) => [m, spendByCategory(v.txns, m)['Fees & interest'] ?? 0])),
  ).reduce((a, b) => a + b, 0);
  if (fees > 1000) out.push({ id: 'fees', area: 'spending', severity: fees > 5000 ? 'high' : 'medium', title: `${fmt0(fees)} in fees and interest`,
    detail: 'Overdraft, card interest and fees over the last 6 months. These are almost entirely avoidable.', yearly: fees * 2 });

  // ---- Category trend
  const prev = addMonths(cur, -1);
  const now = spendByCategory(v.txns, cur);
  const avg = avgSpendByCategory(v.txns, addMonths(cur, -1), 5);
  if (monthsOf(v.txns).includes(prev)) {
    for (const [c, val] of Object.entries(now)) {
      const a = avg[c] ?? 0;
      if (a > 0 && val > a * 1.25 && val - a > 3000 && c !== 'Housing')
        out.push({ id: `trend-${c}`, area: 'spending', severity: 'medium', title: `${c} up ${Math.round(((val - a) / a) * 100)}% this month`,
          detail: `${fmt0(val)} vs ${fmt0(a)} average.`, yearly: (val - a) * 12 });
    }
  }

  // ---- Budget overruns
  for (const [c, limit] of Object.entries(v.budget)) {
    const s = now[c] ?? 0;
    if (limit > 0 && s > limit * 1.05) out.push({ id: `over-${c}`, area: 'spending', severity: s > limit * 1.25 ? 'high' : 'medium',
      title: `${c} over budget`, detail: `${fmt0(s)} spent against ${fmt0(limit)}.`, yearly: (s - limit) * 12 });
  }

  // ---- Savings rate, uncategorised
  const spend = totalSpend(v.txns, cur);
  if (income > 0) {
    const rate = (income - spend) / income;
    if (rate < 0) out.push({ id: 'deficit', area: 'saving', severity: 'high', title: 'Spending exceeds take-home pay',
      detail: `${fmt0(spend)} spent vs ${fmt0(income)} income in the latest month.`, yearly: (spend - income) * 12 });
    else if (rate < 0.1) out.push({ id: 'rate', area: 'saving', severity: 'medium', title: `Saving ${(rate * 100).toFixed(0)}% of take-home`,
      detail: 'A common aim is 10–20%. Small, automatic transfers on payday work best.' });
  }
  if (income > 0 && v.values.enabled && (income - spend) / income > 0.5) out.push({ id: 'middle', area: 'saving', severity: 'info', title: 'The Middle Way: are you living enough?',
    detail: 'You are keeping over half of your take-home. Saving is wise; so is spending on what brings real wellbeing, rest and generosity.' });
  const other = now['Other'] ?? 0;
  if (spend > 0 && other / spend > 0.15) out.push({ id: 'other', area: 'spending', severity: 'info', title: 'A lot of spending is uncategorised',
    detail: `${fmt0(other)} in “Other”. Recategorise to sharpen every insight here.` });

  // ---- Debt
  for (const a of v.accounts.filter((x) => isLiability(x.kind))) {
    const bal = latestBalance(a);
    if (a.kind === 'credit-card' && a.rate && bal > 0) {
      const interest = Math.round((bal * a.rate) / 100);
      if (a.rate >= 18) out.push({ id: `apr-${a.id}`, area: 'debt', severity: 'high', title: `${a.name}: ${a.rate}% APR on ${fmt0(bal)}`,
        detail: `Costs about ${fmt0(interest)} a year in interest. Consider a 0% balance-transfer card or paying this down first.`, yearly: interest });
    }
    if (a.kind === 'credit-card' && a.limit && bal / a.limit > 0.5)
      out.push({ id: `util-${a.id}`, area: 'debt', severity: 'medium', title: `${a.name} is ${Math.round((bal / a.limit) * 100)}% used`,
        detail: 'High utilisation can hurt your credit score and signals stress.' });
    if (a.kind === 'mortgage' && a.fixedUntil) {
      const d = daysUntil(a.fixedUntil, today);
      if (d >= 0 && d <= 180) out.push({ id: `fix-${a.id}`, area: 'debt', severity: 'high', title: `${a.name}: fixed rate ends in ${d} days`,
        detail: 'You can usually lock a new deal up to 6 months ahead. Start now to avoid the lender’s standard variable rate.', yearly: Math.round(bal * 0.01) });
      else if (d < 0) out.push({ id: `fix-${a.id}`, area: 'debt', severity: 'high', title: `${a.name}: fixed rate has ended`,
        detail: 'You may be on a standard variable rate. Remortgaging could save thousands.', yearly: Math.round(bal * 0.01) });
    }
  }
  const eq = homeEquity(v.accounts);
  if (eq && eq.owed > 0) {
    const bands = [60, 75, 80, 85, 90, 95];
    const target = bands.slice().reverse().find((b) => b < eq.ltv);
    if (target && eq.ltv - target <= 5) {
      const need = Math.round(eq.owed - (eq.value * target) / 100);
      out.push({ id: 'ltv', area: 'debt', severity: 'info', title: `You’re ${(eq.ltv - target).toFixed(1)}% from a lower mortgage rate band`,
        detail: `LTV is ${eq.ltv.toFixed(0)}%. Paying down about ${fmt0(need)} (or a higher valuation) crosses ${target}% LTV — lenders price better below each band.` });
    }
  }
  const saversLow = v.accounts.filter((a) => (a.kind === 'savings' || a.kind === 'isa') && a.rate !== undefined && a.rate < 3.5 && latestBalance(a) > 100000);
  for (const a of saversLow) out.push({ id: `rate-${a.id}`, area: 'saving', severity: 'medium', title: `${a.name} pays only ${a.rate}%`,
    detail: `${fmt0(latestBalance(a))} could earn more. Compare easy-access and fixed savings rates.`, yearly: Math.round(latestBalance(a) * 0.01) });
  // high-interest debt + savings sitting idle
  const cc = v.accounts.filter((a) => a.kind === 'credit-card' && (a.rate ?? 0) >= 15 && latestBalance(a) > 0);
  const idle = v.accounts.filter((a) => (a.kind === 'savings') && (a.rate ?? 0) < 6 && latestBalance(a) > 50000);
  if (cc.length && idle.length) out.push({ id: 'offset', area: 'debt', severity: 'medium', title: 'Savings earn less than your debt costs',
    detail: 'Paying card debt from savings earning less than the card APR is a guaranteed return.' });

  // ---- FSCS
  const byBank = new Map<string, number>();
  for (const a of v.accounts) if (['current', 'savings', 'isa'].includes(a.kind)) byBank.set(a.bank, (byBank.get(a.bank) ?? 0) + latestBalance(a));
  for (const [bank, bal] of byBank) if (bank !== 'other' && bal > 8500000) out.push({ id: `fscs-${bank}`, area: 'saving', severity: 'medium',
    title: `${fmt0(bal)} at one banking group`, detail: 'FSCS protects £85,000 per person per authorised firm. Consider spreading it.' });

  // ---- Payslips
  for (const p of v.payslips.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2)) {
    const m = taxSanity(p);
    if (m) out.push({ id: `tax-${p.id}`, area: 'income', severity: 'medium', title: `Payslip ${p.date}: check your tax`, detail: m });
    const rate = p.gross ? p.pension / p.gross : 0;
    if (p.gross > 150000 && rate < 0.05) out.push({ id: `pen-${p.id}`, area: 'saving', severity: 'medium', title: 'Pension contribution looks low',
      detail: `You contribute about ${(rate * 100).toFixed(1)}% of gross. Ask whether your employer matches higher contributions — it is free money.` });
  }

  // ---- Giving (values)
  if (v.values.enabled && cur && income > 0) {
    const given = now['Giving'] ?? 0;
    const target = Math.round((income * v.values.givingPct) / 100);
    if (v.values.givingPct > 0 && given < target * 0.5) out.push({ id: 'give', area: 'giving', severity: 'info', title: 'Giving is below your intention',
      detail: `${fmt0(given)} given vs ${fmt0(target)} you aimed for (${v.values.givingPct}% of take-home).` });
    const ga = v.txns.filter((t) => t.category === 'Giving' && t.pence < 0 && !t.giftAid).reduce((s, t) => s - t.pence, 0);
    if (ga > 5000) out.push({ id: 'giftaid', area: 'giving', severity: 'info', title: 'Gift Aid could add to your giving',
      detail: `${fmt0(ga)} of donations aren’t marked Gift Aid. Charities can claim 25% extra, and higher-rate taxpayers can reclaim more.`, yearly: Math.round(ga * 0.25) });
    if (v.values.enough > 0 && spend > v.values.enough * 1.1) out.push({ id: 'enough', area: 'spending', severity: 'info', title: 'Spending is above what you called “enough”',
      detail: `${fmt0(spend)} this month vs ${fmt0(v.values.enough)}. Notice what has crept up.` });
    const regret = v.txns.filter((t) => t.tag === 'regret' && ym(t.date) === cur && t.pence < 0).reduce((s, t) => s - t.pence, 0);
    if (regret > 0) out.push({ id: 'regret', area: 'spending', severity: 'info', title: `${fmt0(regret)} you tagged as regret`, detail: 'Patterns you notice are patterns you can change.' });
  }

  // ---- Planet
  const energy = activeBills(v).filter((b) => b.kind === 'energy');
  if (energy.length) {
    const hasGreen = energy.some((b) => /green|renewable|octopus|ecotricity|good energy/i.test(`${b.provider} ${b.note ?? ''}`));
    if (!hasGreen) out.push({ id: 'green', area: 'planet', severity: 'info', title: 'Consider a renewable electricity tariff',
      detail: 'Many 100% renewable tariffs now cost the same as standard ones.' });
  }
  const nw = netWorth(v.accounts);
  if (nw.net < 0 && v.accounts.length) out.push({ id: 'nw', area: 'debt', severity: 'info', title: 'Net worth is negative', detail: 'Mortgages often cause this. Track the trend, not the number.' });

  return finish(out, v);
}

function finish(list: Insight[], _v: Vault): Insight[] {
  const seen = new Set<string>();
  return list.filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)))
    .sort((a, b) => sevRank[a.severity] - sevRank[b.severity] || (b.yearly ?? 0) - (a.yearly ?? 0));
}

export const totalSavingPotential = (list: Insight[]) => list.reduce((s, i) => s + Math.max(0, i.yearly ?? 0), 0);
