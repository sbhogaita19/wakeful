import { latestBalance } from './analytics';
import { daysUntil, todayISO } from './dates';
import type { Vault } from '../types';
import type { Tab } from '../nav';

export interface Gap { id: string; text: string; tab: Tab; }

/** What the system doesn't know yet — each item makes the insights sharper. */
export function findGaps(v: Vault, today = todayISO()): Gap[] {
  const g: Gap[] = [];
  if (!v.txns.length) g.push({ id: 'txns', text: 'Import up to 6 months of statements', tab: 'import' });
  else {
    const accts = v.accounts.filter((a) => ['current', 'credit-card'].includes(a.kind));
    if (!accts.length) g.push({ id: 'accts', text: 'No current accounts yet', tab: 'wealth' });
  }
  for (const m of v.household.members)
    if (!v.payslips.some((p) => p.memberId === m.id)) g.push({ id: `ps-${m.id}`, text: `Add a payslip for ${m.name} to work out take-home`, tab: 'income' });
  if (!v.bills.length) g.push({ id: 'bills', text: 'Add your utilities and services (energy, water, broadband, mobile, insurance, council tax)', tab: 'bills' });
  for (const b of v.bills) {
    const n = `${b.provider || b.kind}`;
    if (b.kind === 'energy' && (!b.unitRate || !b.standingCharge)) g.push({ id: `rate-${b.id}`, text: `${n}: add unit rate and standing charge to check against the price cap`, tab: 'bills' });
    if (['energy', 'broadband', 'mobile', 'insurance'].includes(b.kind) && !b.contractEnd) g.push({ id: `end-${b.id}`, text: `${n}: when does the contract end?`, tab: 'bills' });
    if (b.monthly === 0) g.push({ id: `amt-${b.id}`, text: `${n}: add the monthly cost`, tab: 'bills' });
  }
  if (!v.accounts.some((a) => ['savings', 'isa'].includes(a.kind))) g.push({ id: 'sav', text: 'Add savings or ISA balances', tab: 'wealth' });
  if (!v.accounts.some((a) => a.kind === 'pension')) g.push({ id: 'pen', text: 'Add pension balances', tab: 'wealth' });
  if (!v.accounts.some((a) => a.kind === 'mortgage' || a.kind === 'credit-card' || a.kind === 'loan' || a.kind === 'owed')) g.push({ id: 'debt', text: 'Add any mortgage, cards, loans or money you owe (or ignore if none)', tab: 'wealth' });
  const stale = v.accounts.filter((a) => a.balances.length && daysUntil(today, a.balances.reduce((m, b) => (b.date > m ? b.date : m), '0000')) > 60 && latestBalance(a) !== 0);
  if (stale.length) g.push({ id: 'stale', text: `${stale.length} account balance${stale.length > 1 ? 's' : ''} older than 2 months`, tab: 'wealth' });
  if (v.values.enabled && !v.values.enough) g.push({ id: 'enough', text: 'Set what “enough” means for your household', tab: 'values' });
  return g;
}
