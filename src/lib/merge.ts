import type { Account, Bill, Member, Payslip, Property, Reading, Txn, Vault } from '../types';
import { dedupe } from './categorise';
import { uid } from './money';

export interface MergeReport {
  people: number; properties: number; accounts: number;
  txns: number; dupes: number; payslips: number; bills: number; billsEnded: number; readings: number;
  budget: number; rules: number; categories: number;
  /** items present in both with different values — the current vault's version was kept */
  kept: number;
}
const empty = (): MergeReport => ({ people: 0, properties: 0, accounts: 0, txns: 0, dupes: 0, payslips: 0, bills: 0, billsEnded: 0, readings: 0, budget: 0, rules: 0, categories: 0, kept: 0 });
const same = (x?: string, y?: string) => !!x && !!y && x.trim().toLowerCase() === y.trim().toLowerCase();

/**
 * Merge `b` (an imported backup) into `a` (the vault you're using). `a` wins any disagreement;
 * everything only `b` knows is added. Safe to run twice: the second run adds nothing.
 */
export function mergeVaults(a: Vault, b: Vault): { vault: Vault; report: MergeReport } {
  const r = empty();

  // ---- people & properties: match by name (ids differ between devices); otherwise add
  const members: Member[] = [...a.household.members];
  const memberMap = new Map<string, string>();
  for (const m of b.household.members) {
    const hit = members.find((x) => same(x.name, m.name) && (x.kind ?? 'adult') === (m.kind ?? 'adult')) ?? members.find((x) => same(x.name, m.name));
    if (hit) memberMap.set(m.id, hit.id);
    else {
      const id = members.some((x) => x.id === m.id) ? uid() : m.id;
      members.push({ ...m, id }); memberMap.set(m.id, id); r.people++;
    }
  }
  const props: Property[] = [...a.household.properties];
  const propMap = new Map<string, string>();
  for (const p of b.household.properties) {
    const hit = props.find((x) => same(x.name, p.name));
    if (hit) propMap.set(p.id, hit.id);
    else {
      const id = props.some((x) => x.id === p.id) ? uid() : p.id;
      props.push({ ...p, id }); propMap.set(p.id, id); r.properties++;
    }
  }
  const mem = (id?: string) => (id && id !== 'joint' ? memberMap.get(id) ?? id : id);
  const prop = (id: string) => propMap.get(id) ?? id;

  // ---- accounts: same id, else same name+bank+kind, else new
  const accounts: Account[] = a.accounts.map((x) => ({ ...x, balances: [...x.balances] }));
  const accMap = new Map<string, string>();
  for (const acc of b.accounts) {
    const hit = accounts.find((x) => x.id === acc.id && same(x.name, acc.name))
      ?? accounts.find((x) => same(x.name, acc.name) && x.bank === acc.bank && x.kind === acc.kind);
    if (hit) {
      accMap.set(acc.id, hit.id);
      for (const bal of acc.balances) {
        const has = hit.balances.find((y) => y.date === bal.date);
        if (!has) hit.balances.push(bal); else if (has.pence !== bal.pence) r.kept++;
      }
      hit.balances.sort((p, q) => p.date.localeCompare(q.date));
      for (const k of ['rate', 'limit', 'monthly', 'fixedUntil', 'growthPct'] as const) if (hit[k] === undefined && acc[k] !== undefined) (hit as unknown as Record<string, unknown>)[k] = acc[k];
    } else {
      const id = accounts.some((x) => x.id === acc.id) ? uid() : acc.id;
      accounts.push({ ...acc, id, ownerId: mem(acc.ownerId) ?? 'joint', balances: [...acc.balances] });
      accMap.set(acc.id, id); r.accounts++;
    }
  }

  // ---- transactions: remap, then skip anything already there
  const have = new Set(a.txns.map((t) => t.id));
  const incoming = b.txns.filter((t) => !have.has(t.id) && accMap.has(t.accountId))
    .map((t): Txn => ({ ...t, accountId: accMap.get(t.accountId)!, memberId: t.memberId ? mem(t.memberId) : undefined }));
  const { fresh, dupes } = dedupe(a.txns, incoming);
  const txns = [...a.txns, ...fresh.map((t) => (a.txns.some((x) => x.id === t.id) ? { ...t, id: uid() } : t))];
  r.txns = fresh.length; r.dupes = dupes + (b.txns.length - incoming.length);

  // ---- payslips
  const payslips: Payslip[] = [...a.payslips];
  for (const p of b.payslips) {
    const m = mem(p.memberId) ?? p.memberId;
    if (payslips.some((x) => x.memberId === m && x.date === p.date && x.gross === p.gross && x.net === p.net)) continue;
    payslips.push({ ...p, id: payslips.some((x) => x.id === p.id) ? uid() : p.id, memberId: m }); r.payslips++;
  }

  // ---- bills: same provider+kind(+fuel) is the same bill
  const bills: Bill[] = a.bills.map((x) => ({ ...x, history: [...x.history] }));
  for (const bill of b.bills) {
    const split = Object.fromEntries(Object.entries(bill.split).map(([k, v]) => [mem(k) ?? k, v]));
    const hit = bills.find((x) => same(x.provider, bill.provider) && x.kind === bill.kind && (x.fuel ?? '') === (bill.fuel ?? ''));
    if (hit) {
      for (const h of bill.history) if (!hit.history.some((y) => y.date === h.date)) hit.history.push(h);
      hit.history.sort((p, q) => p.date.localeCompare(q.date));
      if (bill.endedOn && !hit.endedOn) { hit.endedOn = bill.endedOn; r.billsEnded++; }
      for (const k of ['unitRate', 'standingCharge', 'contractEnd', 'match', 'note', 'reviewedOn'] as const) if (hit[k] === undefined && bill[k] !== undefined) (hit as unknown as Record<string, unknown>)[k] = bill[k];
      if (hit.monthly !== bill.monthly && !bill.endedOn) r.kept++;
    } else {
      bills.push({ ...bill, id: bills.some((x) => x.id === bill.id) ? uid() : bill.id, propertyId: prop(bill.propertyId), split, history: [...bill.history] }); r.bills++;
    }
  }

  // ---- readings
  const readings: Reading[] = [...a.readings];
  for (const rd of b.readings) {
    const pid = prop(rd.propertyId);
    if (readings.some((x) => x.propertyId === pid && x.fuel === rd.fuel && x.date === rd.date)) continue;
    readings.push({ ...rd, id: readings.some((x) => x.id === rd.id) ? uid() : rd.id, propertyId: pid }); r.readings++;
  }

  // ---- settings-like data: the current vault wins, the other fills the gaps
  const budget = { ...a.budget };
  for (const [k, v] of Object.entries(b.budget)) if (budget[k] === undefined) { budget[k] = v; r.budget++; } else if (budget[k] !== v) r.kept++;
  const rules = [...a.rules];
  for (const rule of b.rules) if (!rules.some((x) => x.match === rule.match)) { rules.push(rule); r.rules++; }
  const customCategories = [...a.customCategories];
  for (const c of b.customCategories) if (!customCategories.some((x) => same(x, c))) { customCategories.push(c); r.categories++; }
  const decisions = { ...b.decisions, ...a.decisions };

  const vault: Vault = {
    ...a,
    household: { ...a.household, members, properties: props },
    accounts, txns, payslips, bills, readings, budget, rules, customCategories,
    categoryNotes: { ...b.categoryNotes, ...a.categoryNotes },
    aliases: { ...b.aliases, ...a.aliases },
    decisions,
  };
  return { vault, report: r };
}

export const mergeSummary = (r: MergeReport) => {
  const parts: [number, string][] = [[r.txns, 'transactions'], [r.accounts, 'accounts'], [r.payslips, 'payslips'], [r.bills, 'bills'], [r.people, 'people'], [r.readings, 'meter readings'], [r.budget, 'budget lines'], [r.rules, 'category rules']];
  const added = parts.filter(([n]) => n > 0).map(([n, l]) => `${n} ${l}`);
  return added.length ? added.join(', ') : 'nothing new';
};
