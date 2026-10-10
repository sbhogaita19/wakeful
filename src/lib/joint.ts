import { NON_SPEND, adults, type Vault } from '../types';
import { ym } from './dates';
import { takeHome } from './payslip';

export interface JointRow { memberId: string; name: string; paidIn: number; share: number; fair: number; diff: number; incomeShare: number; paidShare: number; }
export interface JointAnalysis { accounts: string[]; outgoings: number; rows: JointRow[]; unattributed: number; basis: 'income' | 'equal'; }

/**
 * Who funds the joint account, and is it fair? Inflows are attributed to a person by the account the money
 * came from (transfers) or the employer on the credit (salary paid straight in).
 */
export function jointAnalysis(v: Vault, month: string, basis: 'income' | 'equal' = 'income'): JointAnalysis | null {
  const joint = v.accounts.filter((a) => a.ownerId === 'joint' && a.kind === 'current');
  const ppl = adults(v);
  if (!joint.length || ppl.length < 2) return null;
  const ids = new Set(joint.map((a) => a.id));
  const mine = v.txns.filter((t) => ids.has(t.accountId) && ym(t.date) === month);
  const outgoings = mine.filter((t) => t.pence < 0 && !t.transfer && !NON_SPEND.has(t.category)).reduce((s, t) => s - t.pence, 0);
  if (!outgoings && !mine.length) return null;

  const day = (d: string) => Date.parse(d) / 86400000;
  const paid: Record<string, number> = {};
  let unattributed = 0;
  for (const t of mine.filter((x) => x.pence > 0)) {
    let who: string | undefined;
    if (t.transfer) {
      const src = v.txns.find((o) => !ids.has(o.accountId) && o.pence === -t.pence && Math.abs(day(o.date) - day(t.date)) <= 3);
      const owner = src && v.accounts.find((a) => a.id === src.accountId)?.ownerId;
      if (owner && owner !== 'joint') who = owner;
      else { continue; }                       // e.g. from joint savings: not a contribution
    } else {
      const text = t.desc.toLowerCase();
      who = v.payslips.find((p) => p.employer && p.employer.length >= 3 && text.includes(p.employer.toLowerCase().slice(0, 12)))?.memberId
        ?? ppl.find((m) => m.name.length >= 3 && text.includes(m.name.toLowerCase()))?.id;
    }
    if (who) paid[who] = (paid[who] ?? 0) + t.pence; else unattributed += t.pence;
  }

  const net: Record<string, number> = Object.fromEntries(ppl.map((m) => [m.id, takeHome(v.payslips.filter((p) => p.memberId === m.id))]));
  const totalNet = Object.values(net).reduce((a, b) => a + b, 0);
  const totalPaid = Object.values(paid).reduce((a, b) => a + b, 0);
  const n = ppl.length;
  const rows = ppl.map((m): JointRow => {
    const incomeShare = totalNet > 0 ? net[m.id] / totalNet : 1 / n;
    const share = basis === 'income' && totalNet > 0 ? incomeShare : 1 / n;
    const fair = Math.round(outgoings * share);
    const paidIn = paid[m.id] ?? 0;
    return { memberId: m.id, name: m.name, paidIn, share, fair, diff: paidIn - fair, incomeShare, paidShare: totalPaid ? paidIn / totalPaid : 0 };
  });
  return { accounts: joint.map((a) => a.name), outgoings, rows, unattributed, basis };
}

/** Spending made from each person's own accounts. */
export function personalSpend(v: Vault, month: string): { memberId: string; name: string; spend: number }[] {
  return v.household.members.map((m) => {
    const ids = new Set(v.accounts.filter((a) => a.ownerId === m.id).map((a) => a.id));
    const spend = v.txns.filter((t) => ids.has(t.accountId) && ym(t.date) === month && t.pence < 0 && !t.transfer && !NON_SPEND.has(t.category)).reduce((s, t) => s - t.pence, 0);
    return { memberId: m.id, name: m.name, spend };
  });
}
