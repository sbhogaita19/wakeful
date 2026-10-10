import { adults, type Account, type Bank, type Bill, type BillKind, type Payslip, type Txn, type Vault } from '../types';
import { importCsv, type ParsedRow } from './bankCsv';
import { parseStatementLines } from './statement';
import { categorise, dedupe, markTransfers, merchantKey } from './categorise';
import { parsePayslipLines } from './payslip';
import { parseBillLines } from './billParse';
import { recurring } from './analytics';
import { ym, todayISO } from './dates';
import { uid } from './money';

export type DocKind = 'statement' | 'payslip' | 'bill' | 'unknown';

export interface FileResult { name: string; kind: DocKind; ok: boolean; message: string; batch?: string; accountId?: string; payslipId?: string; memberId?: string; }
export interface Report {
  files: FileResult[];
  txns: number; dupes: number; review: number;
  billsAdded: number; billsUpdated: number; payslips: number; accounts: number;
}
export const emptyReport = (): Report => ({ files: [], txns: 0, dupes: 0, review: 0, billsAdded: 0, billsUpdated: 0, payslips: 0, accounts: 0 });

const count = (lines: string[], re: RegExp) => lines.filter((l) => re.test(l)).length;

/** Decide what a document is from its text lines. */
export function classifyLines(lines: string[]): DocKind {
  const pay = count(lines, /\b(gross pay|net pay|take[- ]?home|national insurance|income tax|paye|tax code|pay date|ni number|student loan)\b/i);
  if (pay >= 3) return 'payslip';
  const rows = parseStatementLines(lines).length;
  if (rows >= 5) return 'statement';
  const bill = count(lines, /\b(kwh|standing charge|unit rate|total amount due|amount due|amount to pay|your bill|meter|account number|billing period|invoice|direct debit)\b/i);
  if (bill >= 2) return 'bill';
  if (rows >= 3) return 'statement';
  return 'unknown';
}

export function detectBank(text: string): Bank {
  const m = text.match(/\b(monzo|starling|nationwide)\b/i);
  return (m ? m[1].toLowerCase() : 'other') as Bank;
}

const BANK_NAME: Record<Bank, string> = { monzo: 'Monzo', starling: 'Starling', nationwide: 'Nationwide', other: 'Bank account' };

const ENERGY = /octopus|edf|e\.?on|bulb|ovo|scottish ?power|british gas|utilita|sse|so energy|shell energy|economy 7/i;
const WATER = /water|severn trent|thames|anglian|yorkshire|united utilities|southern|wessex|northumbrian|affinity|dwr cymru/i;
const BROADBAND = /virgin|\bbt\b|talktalk|plusnet|broadband|sky/i;
const MOBILE = /vodafone|\bee\b|\bo2\b|three|giffgaff|\bsim\b|tesco mobile/i;
const INSURANCE = /aviva|admiral|direct line|insurance|hastings|lv=|churchill/i;
const SECURITY = /verisure|\badt\b|alarm|ring protect|yale/i;

function billKindOf(text: string, category: string): BillKind {
  if (/council tax/i.test(text)) return 'council-tax';
  if (SECURITY.test(text)) return 'security';
  if (ENERGY.test(text)) return 'energy';
  if (WATER.test(text)) return 'water';
  if (MOBILE.test(text)) return 'mobile';
  if (BROADBAND.test(text)) return 'broadband';
  if (INSURANCE.test(text)) return 'insurance';
  if (/tv licen[cs]e/i.test(text)) return 'tv-licence';
  return category === 'Subscriptions' ? 'subscription' : 'other';
}

const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Dd|Ltd|Plc)\b/g, '').replace(/\s+/g, ' ').trim();

const equalSplit = (v: Vault) => { const a = adults(v); return Object.fromEntries(a.map((m) => [m.id, Math.round(100 / a.length)])); };

/** Pick the account an upload belongs to, creating one if needed. */
function pickAccount(v: Vault, bank: Bank, rows: { date: string; pence: number; desc: string }[]): { v: Vault; account: Account; created: boolean } {
  const candidates = v.accounts.filter((a) => a.bank === bank && ['current', 'credit-card', 'savings'].includes(a.kind));
  if (candidates.length) {
    let best = candidates[0], bestScore = -1;
    for (const a of candidates) {
      const existing = v.txns.filter((t) => t.accountId === a.id);
      const score = dedupe(existing, rows.map((r) => ({ ...r, accountId: a.id }))).dupes;
      if (score > bestScore) { best = a; bestScore = score; }
    }
    return { v, account: best, created: false };
  }
  const account: Account = { id: uid(), name: BANK_NAME[bank], bank, kind: 'current', ownerId: 'joint', balances: [] };
  return { v: { ...v, accounts: [...v.accounts, account] }, account, created: true };
}

function addStatement(v: Vault, name: string, bank: Bank, rows: (ParsedRow & { review?: boolean })[], via: 'csv' | 'pdf', report: Report): { v: Vault; res: FileResult } {
  const picked = pickAccount(v, bank, rows);
  let nv = picked.v;
  const acc = picked.account;
  if (picked.created) report.accounts++;
  const existing = nv.txns.filter((t) => t.accountId === acc.id);
  const { fresh, dupes } = dedupe(existing, rows.map((r) => ({ ...r, accountId: acc.id })));
  const batch = uid();
  const incoming: Txn[] = fresh.map((r) => {
    const category = r.transfer ? 'Savings & transfers' : categorise(r.desc, r.pence, nv.rules, r.hint);
    return { id: uid(), accountId: acc.id, date: r.date, desc: r.desc, pence: r.pence, category, transfer: r.transfer || undefined, review: r.review || undefined, src: via, batch };
  });
  const last = rows.filter((r) => r.balance !== undefined).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  const accounts = nv.accounts.map((a) => (a.id === acc.id && last ? { ...a, balances: [...a.balances.filter((b) => b.date !== last.date), { date: last.date, pence: last.balance! }] } : a));
  nv = { ...nv, accounts, txns: [...nv.txns, ...incoming] };
  report.txns += incoming.length; report.dupes += dupes;
  report.review += incoming.filter((t) => t.review || t.category === 'Other').length;
  const msg = `${incoming.length} new${dupes ? `, ${dupes} already imported` : ''} → ${acc.name}${picked.created ? ' (new account)' : ''}`;
  return { v: nv, res: { name, kind: 'statement', ok: true, message: msg, batch, accountId: acc.id } };
}

function addPayslip(v: Vault, name: string, lines: string[], report: Report): { v: Vault; res: FileResult } {
  const g = parsePayslipLines(lines);
  if (!g.gross || !g.net) return { v, res: { name, kind: 'payslip', ok: false, message: 'Looks like a payslip but I couldn’t read the gross and net pay. Add it in Income.' } };
  // Whose payslip? Match a name on the slip, else the same employer as an earlier slip, else the first person.
  const text = lines.join(' ').toLowerCase();
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const byName = adults(v).filter((m) => m.name.trim().length >= 3 && new RegExp(`\\b${esc(m.name.trim().toLowerCase())}\\b`).test(text));
  const prev = g.employer ? v.payslips.find((x) => x.employer.toLowerCase() === g.employer!.toLowerCase()) : undefined;
  const found = byName.length === 1 ? byName[0] : prev ? adults(v).find((m) => m.id === prev.memberId) : undefined;
  const member = found ?? adults(v)[0];
  const guessed = !found && adults(v).length > 1;
  const p: Payslip = { id: uid(), memberId: member.id, date: g.date ?? todayISO(), employer: g.employer ?? '', gross: g.gross, tax: g.tax ?? 0, ni: g.ni ?? 0,
    pension: g.pension ?? 0, studentLoan: g.studentLoan ?? 0, otherDeductions: Math.max(0, g.gross - (g.tax ?? 0) - (g.ni ?? 0) - (g.pension ?? 0) - (g.studentLoan ?? 0) - g.net), net: g.net };
  if (v.payslips.some((x) => x.memberId === p.memberId && x.date === p.date && x.net === p.net)) return { v, res: { name, kind: 'payslip', ok: true, message: 'Payslip already added' } };
  report.payslips++;
  return { v: { ...v, payslips: [...v.payslips, p] }, res: { name, kind: 'payslip', ok: true, payslipId: p.id, memberId: member.id,
    message: `Payslip added for ${member.name} (take-home £${(g.net / 100).toFixed(2)})${guessed ? ' — couldn’t tell whose it is, please check' : ''}` } };
}

function addBill(v: Vault, name: string, lines: string[], report: Report): { v: Vault; res: FileResult } {
  const g = parseBillLines(lines);
  if (!g.provider && !g.kind) return { v, res: { name, kind: 'bill', ok: false, message: 'Looks like a bill but I couldn’t tell which service. Add it in Bills.' } };
  const provider = g.provider ?? title(g.kind ?? 'Bill');
  const kind = (g.kind ?? 'other') as BillKind;
  const existing = v.bills.find((b) => b.provider.toLowerCase() === provider.toLowerCase() && b.kind === kind && (b.fuel ?? '') === (g.fuel ?? b.fuel ?? ''));
  if (existing) {
    report.billsUpdated++;
    const monthly = g.monthly ?? existing.monthly;
    const history = monthly !== existing.monthly ? [...existing.history, { date: todayISO(), monthly }] : existing.history;
    const bills = v.bills.map((b) => (b.id === existing.id ? { ...b, monthly, history, unitRate: g.unitRate ?? b.unitRate, standingCharge: g.standingCharge ?? b.standingCharge, contractEnd: g.contractEnd ?? b.contractEnd } : b));
    return { v: { ...v, bills }, res: { name, kind: 'bill', ok: true, message: `${provider} bill updated` } };
  }
  const bill: Bill = { id: uid(), kind, provider, propertyId: v.household.properties[0].id, monthly: g.monthly ?? 0, fuel: g.fuel, unitRate: g.unitRate, standingCharge: g.standingCharge,
    contractEnd: g.contractEnd, history: g.monthly ? [{ date: todayISO(), monthly: g.monthly }] : [], split: equalSplit(v), auto: true };
  report.billsAdded++;
  return { v: { ...v, bills: [...v.bills, bill] }, res: { name, kind: 'bill', ok: true, message: `${provider} added to Bills${g.monthly ? '' : ' — add the monthly cost'}` } };
}

/** Create Bills from recurring bank payments, and track price changes on existing ones. */
export function syncBills(v: Vault, report?: Report): Vault {
  let bills = v.bills;
  for (const r of recurring(v.txns).filter((x) => ['Bills', 'Subscriptions'].includes(x.category) || /council tax/i.test(x.label))) {
    const found = bills.find((b) => (b.match && r.key.includes(b.match.toUpperCase())) || merchantKey(b.provider) === r.key || (b.provider && r.label.toUpperCase().includes(b.provider.toUpperCase())));
    if (found) {
      if (found.endedOn) continue;
      if (found.monthly && Math.abs(r.monthly - found.monthly) > found.monthly * 0.02) {
        bills = bills.map((b) => (b.id === found.id ? { ...b, monthly: r.monthly, history: [...b.history, { date: r.lastDate, monthly: r.monthly }] } : b));
        if (report) report.billsUpdated++;
      } else if (!found.monthly) bills = bills.map((b) => (b.id === found.id ? { ...b, monthly: r.monthly } : b));
      continue;
    }
    bills = [...bills, { id: uid(), kind: billKindOf(r.label, r.category), provider: title(r.label), propertyId: v.household.properties[0].id, monthly: r.monthly,
      history: [{ date: r.lastDate, monthly: r.monthly }], split: equalSplit(v), match: r.key, auto: true }];
    if (report) report.billsAdded++;
  }
  return bills === v.bills ? v : { ...v, bills };
}

/** Take any mix of files and fold them into the vault with no questions asked. */
export async function ingest(v0: Vault, files: File[]): Promise<{ vault: Vault; report: Report }> {
  const report = emptyReport();
  let v = v0;
  for (const f of files) {
    try {
      const isPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf';
      let lines: string[] | null = null;
      if (!isPdf) {
        const text = await f.text();
        const csv = /\.(csv|tsv)$/i.test(f.name) || text.includes(',') ? importCsv(text) : null;
        if (csv) {
          const r = addStatement(v, f.name, csv.bank, csv.rows, 'csv', report);
          v = r.v; report.files.push(r.res); continue;
        }
        lines = text.split(/\r?\n/);
      } else {
        const { pdfToLines } = await import('./pdf');
        lines = await pdfToLines(await f.arrayBuffer());
        if (!lines.length) { report.files.push({ name: f.name, kind: 'unknown', ok: false, message: 'No text in this PDF (a scan?). Export a CSV or type it in.' }); continue; }
      }
      const kind = classifyLines(lines);
      if (kind === 'payslip') { const r = addPayslip(v, f.name, lines, report); v = r.v; report.files.push(r.res); }
      else if (kind === 'bill') { const r = addBill(v, f.name, lines, report); v = r.v; report.files.push(r.res); }
      else if (kind === 'statement') {
        const rows = parseStatementLines(lines);
        const r = addStatement(v, f.name, detectBank(lines.slice(0, 40).join(' ')), rows, 'pdf', report);
        v = r.v; report.files.push(r.res);
      } else report.files.push({ name: f.name, kind: 'unknown', ok: false, message: 'Couldn’t recognise this file. Try the CSV export, or add it by hand.' });
    } catch {
      report.files.push({ name: f.name, kind: 'unknown', ok: false, message: 'Couldn’t be read.' });
    }
  }
  v = { ...v, txns: markTransfers(v.txns) };
  v = syncBills(v, report);
  return { vault: v, report };
}

export const latestTxnMonth = (v: Vault) => v.txns.map((t) => ym(t.date)).sort().at(-1);
