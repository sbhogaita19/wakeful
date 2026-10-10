import type { Bank } from '../types';
import { parseCsv } from './csv';
import { parseDate } from './dates';
import { parseMoney } from './money';

export interface ParsedRow {
  date: string;
  desc: string;
  pence: number;
  balance?: number;
  transfer?: boolean;
  hint?: string;
}
export interface CsvResult { bank: Bank; rows: ParsedRow[]; skipped: number; }

const norm = (s: string) => s.trim().toLowerCase();

/** Detect Monzo / Starling / Nationwide / generic CSV and parse it. */
export function importCsv(text: string): CsvResult | null {
  const all = parseCsv(text);
  const hi = all.findIndex((r) => r.filter((c) => c.trim()).length >= 3 && r.some((c) => /date/i.test(c)));
  if (hi < 0) return null;
  const head = all[hi].map(norm);
  const body = all.slice(hi + 1);
  const col = (...names: string[]) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));

  let bank: Bank = 'other';
  if (head.includes('transaction id') && head.includes('name') && head.includes('amount')) bank = 'monzo';
  else if (head.includes('counter party') && head.some((h) => h.startsWith('amount'))) bank = 'starling';
  else if (head.includes('paid out') && head.includes('paid in')) bank = 'nationwide';

  const cDate = col('date');
  if (cDate < 0) return null;
  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (const r of body) {
    const date = parseDate(r[cDate] ?? '');
    let desc = '';
    let pence: number | null = null;
    let balance: number | undefined;
    let transfer = false;
    let hint: string | undefined;

    if (bank === 'monzo') {
      desc = (r[head.indexOf('name')] || r[head.indexOf('description')] || '').trim();
      pence = parseMoney(r[head.indexOf('amount')] ?? '');
      const type = norm(r[head.indexOf('type')] ?? '');
      if (type.includes('pot transfer')) transfer = true;
      hint = r[head.indexOf('category')];
    } else if (bank === 'starling') {
      const ref = (r[col('reference')] ?? '').trim();
      desc = `${(r[head.indexOf('counter party')] ?? '').trim()}${ref ? ' ' + ref : ''}`.trim();
      pence = parseMoney(r[head.findIndex((h) => h.startsWith('amount'))] ?? '');
      balance = parseMoney(r[head.findIndex((h) => h.startsWith('balance'))] ?? '') ?? undefined;
      if (norm(r[col('type')] ?? '').includes('internal transfer')) transfer = true;
      hint = r[col('spending category')];
    } else if (bank === 'nationwide') {
      desc = (r[col('description')] ?? '').trim();
      const out = parseMoney(r[head.indexOf('paid out')] ?? '') ?? 0;
      const inn = parseMoney(r[head.indexOf('paid in')] ?? '') ?? 0;
      pence = Math.abs(inn) - Math.abs(out);
      if (!r[head.indexOf('paid out')]?.trim() && !r[head.indexOf('paid in')]?.trim()) pence = null;
      balance = parseMoney(r[col('balance')] ?? '') ?? undefined;
    } else {
      desc = (r[col('description', 'details', 'name', 'payee', 'reference', 'narrative')] ?? '').trim();
      const ia = col('amount', 'value');
      if (ia >= 0) pence = parseMoney(r[ia] ?? '');
      else {
        const d = parseMoney(r[col('debit', 'money out', 'paid out', 'out')] ?? '') ?? 0;
        const c = parseMoney(r[col('credit', 'money in', 'paid in', 'in')] ?? '') ?? 0;
        pence = Math.abs(c) - Math.abs(d);
      }
    }

    if (!date || pence === null || Number.isNaN(pence)) { skipped++; continue; }
    rows.push({ date, desc: desc || '(no description)', pence, balance, transfer, hint });
  }
  if (!rows.length) return null;
  return { bank, rows, skipped };
}
