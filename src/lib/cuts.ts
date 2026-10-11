import { recurring, spendByCategory, latestMonth, months as monthsOf } from './analytics';
import { merchantKey } from './categorise';
import { fmt0 } from './money';
import { NON_SPEND, activeBills, type Vault } from '../types';
import { ym } from './dates';

export interface Cut {
  id: string;
  title: string;
  why: string;
  action: 'cancel' | 'reduce' | 'review';
  /** pence per year freed if you act */
  yearly: number;
}

const VIDEO = /netflix|disney|prime video|amazon prime|now tv|apple tv|paramount|britbox|discovery|sky/i;
const MUSIC = /spotify|apple music|youtube|amazon music|tidal|deezer/i;
const DISCRETIONARY = new Set(['Subscriptions', 'Entertainment', 'Shopping', 'Eating out', 'Takeaways', 'Travel', 'Other', 'Health']);

/** Things that could be cancelled, reduced or reviewed, each with a yearly saving. */
export function buildCuts(v: Vault): Cut[] {
  const out: Cut[] = [];
  const rec = recurring(v.txns).filter((r) => DISCRETIONARY.has(r.category) || v.customCategories.includes(r.category));
  const used = new Set<string>();

  // Overlapping services: keep the dearest, question the rest.
  for (const [id, re, name] of [['ovl-video', VIDEO, 'video streaming'], ['ovl-music', MUSIC, 'music']] as const) {
    const group = rec.filter((r) => re.test(r.label));
    if (group.length >= 2) {
      const total = group.reduce((s, r) => s + r.monthly, 0);
      const keep = Math.max(...group.map((r) => r.monthly));
      out.push({ id, action: 'cancel', yearly: (total - keep) * 12,
        title: `${group.length} ${name} services (${fmt0(total)}/month)`,
        why: `${group.map((r) => r.label).join(', ')}. Most people use one at a time — rotate, or keep just one.` });
      group.forEach((r) => used.add(r.key));
    }
  }

  for (const r of rec) {
    if (used.has(r.key)) continue;
    out.push({ id: `rec-${r.key}`, action: 'cancel', yearly: r.monthly * 12,
      title: `${r.label} — ${fmt0(r.monthly)}/month`,
      why: `Paid for ${r.months} months in a row (${r.category}). When did you last use it? If you can’t say, cancel it — you can always rejoin.` });
  }

  // Bills you may not need
  for (const b of activeBills(v)) {
    if (['subscription', 'security', 'other'].includes(b.kind) && b.monthly > 0 && !out.some((c) => c.id === `rec-${merchantKey(b.provider)}`))
      out.push({ id: `bill-${b.id}`, action: 'review', yearly: b.monthly * 12,
        title: `${b.provider || b.kind} — ${fmt0(b.monthly)}/month`, why: `A ${b.kind} bill. Is it still worth its price? Ask for a cheaper tier or a loyalty discount before cancelling.` });
    if (b.kind === 'tv-licence')
      out.push({ id: `bill-${b.id}`, action: 'review', yearly: b.monthly * 12,
        title: 'TV licence', why: 'Only needed if you watch live TV or BBC iPlayer. If you don’t, you can cancel it.' });
  }

  // Fees and interest — avoidable entirely
  const ms = monthsOf(v.txns).slice(-6);
  const fees = ms.reduce((s, m) => s + (spendByCategory(v.txns, m)['Fees & interest'] ?? 0), 0);
  if (fees > 1000) out.push({ id: 'fees', action: 'cancel', yearly: Math.round(fees * (12 / Math.max(1, ms.length))),
    title: `Fees and interest (${fmt0(fees)} in ${ms.length} months)`, why: 'Overdraft, card interest and charges. Switch to 0% / clear the balance, and set a buffer to avoid overdraft fees.' });

  // Spending you flagged yourself
  const regret = v.txns.filter((t) => t.tag === 'regret' && t.pence < 0 && !t.transfer && !NON_SPEND.has(t.category));
  if (regret.length) {
    const total = regret.reduce((s, t) => s - t.pence, 0);
    const span = Math.max(1, new Set(regret.map((t) => ym(t.date))).size);
    out.push({ id: 'regret', action: 'reduce', yearly: Math.round((total / span) * 12),
      title: `${regret.length} purchases you tagged as regret`, why: `${fmt0(total)} so far. Notice what triggered them — then make the next one wait 48 hours.` });
  }

  // Habits to trim, not cancel: takeaways
  const cur = latestMonth(v.txns);
  if (cur) {
    const cats = spendByCategory(v.txns, cur);
    const take = cats['Takeaways'] ?? 0;
    if (take > 8000) out.push({ id: 'takeaways', action: 'reduce', yearly: Math.round(take * 0.3 * 12),
      title: `Takeaways: ${fmt0(take)} this month`, why: 'Delivery fees and mark-ups add up. Cutting a third is realistic — cook one extra night a week. Saving shown is 30%.' });
    const eat = cats['Eating out'] ?? 0;
    if (eat > 15000) out.push({ id: 'eatout', action: 'reduce', yearly: Math.round(eat * 0.25 * 12),
      title: `Eating out: ${fmt0(eat)} this month`, why: 'Cutting a quarter is realistic — fewer meals out, same treats. Saving shown is 25%.' });
  }

  const dedup = new Map(out.map((c) => [c.id, c]));
  return [...dedup.values()].sort((a, b) => b.yearly - a.yearly);
}
