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

import { allCategories, colorOf } from '../src/types';
describe('utilities & custom categories', () => {
  it('files utilities and alarm providers under Bills', () => {
    for (const d of ['OCTOPUS ENERGY DD', 'BT GROUP PLC', 'VERISURE SECURITY', 'UTILITA ENERGY', 'ADT ALARM'])
      expect(categorise(d, -3000, [])).toBe('Bills');
  });
  it('reads a Verisure bill as security', () => {
    expect(parseBillLines(['Verisure', 'Alarm monitoring', 'Total amount due £39.00'])).toMatchObject({ kind: 'security', provider: 'Verisure', monthly: 3900 });
  });
  it('supports custom categories with stable colours', () => {
    expect(allCategories({ customCategories: ['Home security'] })).toContain('Home security');
    expect(colorOf('Home security')).toBe(colorOf('Home security'));
    expect(colorOf('Groceries')).toMatch(/^#/);
  });
});

import { buildCuts } from '../src/lib/cuts';
describe('could go', () => {
  const cuts = buildCuts(demoVault());
  it('finds overlapping streaming, subscriptions and fees', () => {
    const ids = cuts.map((c) => c.id);
    expect(ids).toContain('ovl-video');
    expect(ids).toContain('fees');
    expect(cuts.some((c) => /PUREGYM/i.test(c.title))).toBe(true);
    expect(cuts.every((c, i) => i === 0 || cuts[i - 1].yearly >= c.yearly)).toBe(true);
  });
});

import { classifyLines, ingest, syncBills } from '../src/lib/ingest';
import { activeBills } from '../src/types';
const file = (name: string, text: string) => new File([text], name);
describe('automatic ingest', () => {
  it('classifies documents', () => {
    expect(classifyLines(['Pay date 25/09/2026', 'Gross Pay 4,458.00', 'Income Tax 639.00', 'Net Pay 3,298.00'])).toBe('payslip');
    expect(classifyLines(['Octopus Energy', 'Your electricity: 28.5p per kWh', 'Standing charge 55.2p per day', 'Total amount due £112.40'])).toBe('bill');
    expect(classifyLines(['Statement 1 Oct 2025', 'Balance brought forward £1,000.00', '02 Oct TESCO 25.00 975.00', '03 Oct COSTA 5.00 970.00', '04 Oct ALDI 15.00 955.00', '05 Oct SALARY 2,000.00 2,955.00', '06 Oct PRET 4.00 2,951.00'])).toBe('statement');
    expect(classifyLines(['hello world'])).toBe('unknown');
  });

  it('files mixed uploads with no questions, creates accounts and bills, and is idempotent', async () => {
    const mk = (n: string) => file(`${n}-sample.csv`, readFileSync(`samples/${n}-sample.csv`, 'utf8'));
    const v0 = emptyVault();
    const a = await ingest(v0, [mk('monzo'), mk('starling'), mk('nationwide')]);
    expect(a.report.accounts).toBe(3);
    expect(a.report.txns).toBeGreaterThan(200);
    expect(a.vault.accounts.map((x) => x.bank).sort()).toEqual(['monzo', 'nationwide', 'starling']);
    expect(a.vault.txns.every((t) => t.category)).toBe(true);
    expect(a.report.billsAdded).toBeGreaterThan(3);
    expect(a.vault.bills.some((b) => /octopus/i.test(b.provider) && b.kind === 'energy')).toBe(true);
    expect(a.vault.bills.some((b) => /vodafone|giffgaff/i.test(b.provider) && b.kind === 'mobile')).toBe(true);
    // second upload of the same files adds nothing and creates no extra accounts
    const b = await ingest(a.vault, [mk('monzo'), mk('starling'), mk('nationwide')]);
    expect(b.report.txns).toBe(0);
    expect(b.report.dupes).toBe(a.report.txns);
    expect(b.vault.accounts).toHaveLength(3);
    expect(b.vault.bills).toHaveLength(a.vault.bills.length);
  });

  it('reads a payslip and a bill dropped together', async () => {
    const slip = file('payslip.txt', 'Pay date 25/09/2026\nGross Pay 4,458.00\nIncome Tax 639.00\nNational Insurance 298.00\nPension 223.00\nNet Pay 3,298.00\n');
    const bill = file('verisure.txt', 'Verisure\nAlarm monitoring\nTotal amount due £39.00\nInvoice 123\n');
    const r = await ingest(emptyVault(), [slip, bill]);
    expect(r.report.payslips).toBe(1);
    expect(r.vault.payslips[0].net).toBe(329800);
    expect(r.vault.bills.find((b) => /verisure/i.test(b.provider))).toMatchObject({ kind: 'security', monthly: 3900 });
  });

  it('ended bills stop counting and are not recreated', async () => {
    const v = (await ingest(emptyVault(), [file('monzo-sample.csv', readFileSync('samples/monzo-sample.csv', 'utf8'))])).vault;
    const oct = v.bills.find((b) => /octopus/i.test(b.provider))!;
    const ended = { ...v, bills: v.bills.map((b) => (b.id === oct.id ? { ...b, endedOn: '2026-09-30' } : b)) };
    expect(activeBills(ended).some((b) => b.id === oct.id)).toBe(false);
    expect(syncBills(ended).bills.filter((b) => /octopus/i.test(b.provider))).toHaveLength(1);
  });
});

describe('payslip owner', () => {
  it('assigns by name on the slip and by employer later', async () => {
    const v0 = { ...emptyVault(), household: { ...emptyVault().household, members: [{ id: 'm1', name: 'Asha' }, { id: 'm2', name: 'Ben' }] } };
    const slip = (who: string, net: string) => file(`${who}.txt`, `Employee: ${who} Rivers\nEmployer: Northern Health Trust\nPay date 25/09/2026\nGross Pay 3,667.00\nIncome Tax 471.00\nNational Insurance 238.00\nNet Pay ${net}\n`);
    const a = await ingest(v0, [slip('Ben', '2,890.00')]);
    expect(a.vault.payslips[0].memberId).toBe('m2');
    // an unnamed slip from the same employer follows the earlier one
    const noName = file('x.txt', 'Employer: Northern Health Trust\nPay date 25/10/2026\nGross Pay 3,667.00\nIncome Tax 471.00\nNational Insurance 238.00\nNet Pay 2,958.00\n');
    const b = await ingest(a.vault, [noName]);
    expect(b.vault.payslips.find((p) => p.date === '2026-10-25')!.memberId).toBe('m2');
  });
});
