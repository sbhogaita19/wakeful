import { describe, expect, it } from 'vitest';
import { importCsv } from '../src/lib/bankCsv';
import { categorise, dedupe, markTransfers, merchantKey } from '../src/lib/categorise';
import { parseMoney } from '../src/lib/money';
import { parseDate } from '../src/lib/dates';
import { parseStatementLines } from '../src/lib/statement';
import { parsePayslipLines, takeHome, taxSanity } from '../src/lib/payslip';
import { open, seal, changePass, passphraseProblem, normaliseRecovery } from '../src/lib/crypto';
import { demoVault } from '../src/lib/demo';
import { buildInsights } from '../src/lib/insights';
import { pulse } from '../src/lib/pulse';
import { netWorth, recurring } from '../src/lib/analytics';

describe('money & dates', () => {
  it('parses money', () => {
    expect(parseMoney('£1,234.56')).toBe(123456);
    expect(parseMoney('(12.30)')).toBe(-1230);
    expect(parseMoney('-0.99')).toBe(-99);
    expect(parseMoney('45.00 DR')).toBe(-4500);
    expect(parseMoney('abc')).toBeNull();
  });
  it('parses dates', () => {
    expect(parseDate('03/10/2025')).toBe('2025-10-03');
    expect(parseDate('3 Oct 2025')).toBe('2025-10-03');
    expect(parseDate('03 Oct', 2025)).toBe('2025-10-03');
    expect(parseDate('31/02/2025')).toBeNull();
  });
});

describe('bank CSVs', () => {
  it('Monzo', () => {
    const csv = 'Transaction ID,Date,Time,Type,Name,Emoji,Category,Amount,Currency,Local amount,Local currency,Notes and #tags,Address,Receipt,Description,Category split,Money Out,Money In\n' +
      'tx_1,03/10/2025,10:00:00,Card payment,Tesco,,Groceries,-12.50,GBP,-12.50,GBP,,,,TESCO,,-12.50,\n' +
      'tx_2,04/10/2025,10:00:00,Pot transfer,Holiday pot,,General,-50.00,GBP,-50.00,GBP,,,,,,-50.00,\n';
    const r = importCsv(csv)!;
    expect(r.bank).toBe('monzo');
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]).toMatchObject({ date: '2025-10-03', pence: -1250, desc: 'Tesco' });
    expect(r.rows[1].transfer).toBe(true);
  });
  it('Starling', () => {
    const csv = 'Date,Counter Party,Reference,Type,Amount (GBP),Balance (GBP),Spending Category,Notes\n' +
      '03/10/2025,Pret,,CARD PAYMENT,-4.20,100.00,EATING_OUT,\n05/10/2025,Employer,Salary,FASTER PAYMENT,2000.00,2100.00,INCOME,\n';
    const r = importCsv(csv)!;
    expect(r.bank).toBe('starling');
    expect(r.rows.map((x) => x.pence)).toEqual([-420, 200000]);
  });
  it('Nationwide with preamble', () => {
    const csv = '"Account Name:","Flex"\n"Balance:","£100.00"\n\n"Date","Transaction type","Description","Paid out","Paid in","Balance"\n' +
      '"03 Oct 2025","Visa purchase","SAINSBURYS","£23.10","","£1,000.00"\n"04 Oct 2025","Bank credit","SALARY","","£2,000.00","£3,000.00"\n';
    const r = importCsv(csv)!;
    expect(r.bank).toBe('nationwide');
    expect(r.rows.map((x) => x.pence)).toEqual([-2310, 200000]);
  });
});

describe('categorise', () => {
  it('keywords and learned rules', () => {
    expect(categorise('TESCO STORES 1234', -500, [])).toBe('Groceries');
    expect(categorise('OXFAM DONATION', -500, [])).toBe('Giving');
    expect(categorise('ACME SALARY', 300000, [])).toBe('Income');
    expect(categorise('UBER EATS', -900, [])).toBe('Eating out');
    expect(categorise('RANDOM SHOP', -900, [{ match: merchantKey('RANDOM SHOP'), category: 'Health' }])).toBe('Health');
  });
  it('dedupes re-imports but keeps genuine same-day repeats', () => {
    const t = { accountId: 'a', date: '2025-10-01', pence: -300, desc: 'COSTA' };
    const existing = [{ ...t, id: '1', category: 'Eating out', src: 'csv' as const }];
    const r = dedupe(existing, [t, t]);
    expect(r.dupes).toBe(1);
    expect(r.fresh).toHaveLength(1);
  });
  it('pairs transfers between accounts', () => {
    const base = { category: 'Other', src: 'csv' as const, desc: 'x' };
    const out = markTransfers([
      { ...base, id: '1', accountId: 'a', date: '2025-10-01', pence: -5000 },
      { ...base, id: '2', accountId: 'b', date: '2025-10-02', pence: 5000 },
    ]);
    expect(out.every((t) => t.transfer)).toBe(true);
  });
});

describe('PDF statement lines', () => {
  it('derives sign from running balance', () => {
    const rows = parseStatementLines([
      'Statement 1 Oct 2025 to 31 Oct 2025',
      'Balance brought forward £1,000.00',
      '02 Oct TESCO STORES 25.00 975.00',
      '05 Oct SALARY ACME 2,000.00 2,975.00',
    ]);
    expect(rows.map((r) => r.pence)).toEqual([-2500, 200000]);
    expect(rows.every((r) => !r.review)).toBe(true);
    expect(rows[0].date).toBe('2025-10-02');
  });
});

describe('payslips', () => {
  const lines = ['Pay date 25/09/2026', 'Gross Pay 4,458.00 53,496.00', 'Income Tax 639.00', 'National Insurance 298.00', 'Pension Employee 223.00', 'Net Pay 3,298.00'];
  it('extracts figures', () => {
    const g = parsePayslipLines(lines);
    expect(g).toMatchObject({ gross: 445800, tax: 63900, ni: 29800, pension: 22300, net: 329800, date: '2026-09-25' });
  });
  it('averages take-home per member', () => {
    const mk = (m: string, d: string, net: number) => ({ id: m + d, memberId: m, date: d, employer: '', gross: 0, tax: 0, ni: 0, pension: 0, studentLoan: 0, otherDeductions: 0, net });
    expect(takeHome([mk('a', '2026-07-25', 300000), mk('a', '2026-08-25', 310000), mk('b', '2026-08-25', 200000)])).toBe(305000 + 200000);
  });
  it('flags implausible tax', () => {
    const p = { id: '1', memberId: 'a', date: '2026-09-25', employer: '', gross: 500000, tax: 10000, ni: 40000, pension: 0, studentLoan: 0, otherDeductions: 0, net: 450000 };
    expect(taxSanity(p)).toMatch(/low/);
  });
});

describe('crypto', () => {
  it('round-trips with passphrase and recovery key; rejects wrong passphrase', async () => {
    const { stored, recoveryKey } = await seal({ secret: 'balance 123' }, 'correct horse battery', 1000);
    expect(JSON.stringify(stored)).not.toContain('balance');
    const a = await open<{ secret: string }>(stored, 'correct horse battery', 'pass');
    expect(a.vault.secret).toBe('balance 123');
    const b = await open<{ secret: string }>(stored, recoveryKey.toLowerCase(), 'recovery');
    expect(b.vault.secret).toBe('balance 123');
    await expect(open(stored, 'wrong passphrase!', 'pass')).rejects.toBeTruthy();
    const re = await changePass(stored, 'correct horse battery', 'a brand new passphrase', 1000);
    await expect(open(re, 'correct horse battery', 'pass')).rejects.toBeTruthy();
    expect((await open<{ secret: string }>(re, 'a brand new passphrase', 'pass')).vault.secret).toBe('balance 123');
    expect(normaliseRecovery(recoveryKey)).toHaveLength(26);
  });
  it('rejects weak passphrases', () => {
    expect(passphraseProblem('short')).toBeTruthy();
    expect(passphraseProblem('a much longer passphrase 42')).toBeNull();
  });
});

describe('demo household end-to-end', () => {
  const v = demoVault();
  it('has sensible net worth and recurring detection', () => {
    expect(netWorth(v.accounts).net).toBeGreaterThan(0);
    expect(recurring(v.txns).some((r) => /NETFLIX/i.test(r.label))).toBe(true);
  });
  it('raises the expected flags', () => {
    const ids = buildInsights(v, '2026-10-10').map((i) => i.id);
    expect(ids).toContain('end-b3'); // broadband contract ended
    expect(ids).toContain('fix-a8'); // mortgage fix ending
    expect(ids).toContain('apr-a9'); // card APR
    expect(ids).toContain('unit-b1'); // unit rate above cap
    expect(ids.some((i) => i.startsWith('dup-'))).toBe(true);
  });
  it('produces a balance score', () => {
    const p = pulse(v, '2026-10-10')!;
    expect(p.overall).toBeGreaterThan(0);
    expect(p.pillars).toHaveLength(5);
  });
});

import { parseBillLines } from '../src/lib/billParse';
import { findGaps } from '../src/lib/gaps';
import { emptyVault } from '../src/types';
describe('bills & gaps', () => {
  it('reads an energy bill', () => {
    const g = parseBillLines(['Octopus Energy', 'Your electricity: 28.5p per kWh', 'Standing charge 55.2p per day', 'Your fixed tariff ends 15 Nov 2026', 'Total amount due £112.40']);
    expect(g).toMatchObject({ kind: 'energy', fuel: 'electricity', unitRate: 28.5, standingCharge: 55.2, monthly: 11240, provider: 'Octopus', contractEnd: '2026-11-15' });
  });
  it('lists gaps for an empty vault', () => {
    expect(findGaps(emptyVault()).map((g) => g.id)).toContain('bills');
  });
});

import { readFileSync } from 'node:fs';
describe('sample statements', () => {
  for (const f of ['monzo', 'starling', 'nationwide']) {
    it(`${f} sample imports`, () => {
      const r = importCsv(readFileSync(`samples/${f}-sample.csv`, 'utf8'))!;
      expect(r.bank).toBe(f);
      expect(r.rows.length).toBeGreaterThan(30);
    });
  }
});

import { homeEquity, valueNow } from '../src/lib/analytics';
describe('home equity', () => {
  const acc = (kind: any, pence: number, extra = {}) => ({ id: kind, name: kind, bank: 'other' as const, kind, ownerId: 'joint', balances: [{ date: '2025-10-01', pence }], ...extra });
  it('projects growth and computes equity/LTV', () => {
    expect(valueNow(acc('property', 30000000, { growthPct: 3 }), '2026-10-01')).toBeGreaterThan(30800000);
    const e = homeEquity([acc('property', 30000000), acc('mortgage', 18000000)], '2026-10-01')!;
    expect(e.equity).toBe(12000000);
    expect(Math.round(e.ltv)).toBe(60);
  });
});
