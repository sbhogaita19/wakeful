import { parseDate } from './dates';
import { parseMoney } from './money';
import type { ParsedRow } from './bankCsv';

const MONEY = /\(?-?£?\d{1,3}(?:,\d{3})*\.\d{2}\)?(?:\s?(?:CR|DR))?/g;
const DATE_AT_START = /^(\d{1,2}[ /.-](?:[A-Za-z]{3,9}|\d{1,2})(?:[ /.,-]+(?:\d{4}|\d{2}))?)\s+(.*)$/;

export interface StatementRow extends ParsedRow { review: boolean; }

/** Best-effort parse of text lines extracted from a bank statement PDF. */
export function parseStatementLines(lines: string[], fallbackYear = new Date().getFullYear()): StatementRow[] {
  const yearLine = lines.slice(0, 40).join(' ').match(/\b(20\d{2})\b/);
  const year = yearLine ? Number(yearLine[1]) : fallbackYear;
  const rows: StatementRow[] = [];
  let prevBal: number | undefined;

  for (const raw of lines) {
    const line = raw.replace(/\s+/g, ' ').trim();
    const bf = line.match(/balance (brought|b\/?f)(?:orward)?\s.*?(-?£?[\d,]+\.\d{2})/i);
    if (bf) { prevBal = parseMoney(bf[2]) ?? prevBal; continue; }
    const m = line.match(DATE_AT_START);
    if (!m) continue;
    const date = parseDate(m[1].replace(/,/g, ''), year);
    if (!date) continue;
    const rest = m[2];
    const tokens = rest.match(MONEY);
    if (!tokens) continue;
    const desc = rest.replace(MONEY, ' ').replace(/\s+/g, ' ').trim();
    if (!desc) continue;
    const vals = tokens.map((t) => parseMoney(t)!).filter((v) => v !== null);
    let pence: number;
    let balance: number | undefined;
    let review = false;

    if (vals.length >= 2) {
      const amt = Math.abs(vals[vals.length - 2]);
      balance = vals[vals.length - 1];
      if (prevBal !== undefined) {
        const delta = balance - prevBal;
        if (Math.abs(delta - amt) <= 1) pence = amt;
        else if (Math.abs(delta + amt) <= 1) pence = -amt;
        else { pence = signGuess(rest, vals[vals.length - 2]); review = true; }
      } else { pence = signGuess(rest, vals[vals.length - 2]); review = true; }
      prevBal = balance;
    } else {
      pence = signGuess(rest, vals[0]);
      review = true;
    }
    rows.push({ date, desc, pence, balance, review });
  }
  return rows;
}

function signGuess(text: string, v: number): number {
  if (v < 0) return v;
  if (/\bCR\b|\bcredit\b|salary|refund|interest paid|deposit/i.test(text)) return Math.abs(v);
  return -Math.abs(v);
}
