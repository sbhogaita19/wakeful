import type { Account, Bill, Payslip, Txn, Vault } from '../types';
import { emptyVault } from '../types';
import { addMonths } from './dates';
import { categorise, markTransfers } from './categorise';

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Entirely fictional two-adult household. Deterministic. */
export function demoVault(endMonth = '2026-09'): Vault {
  const r = rng(42);
  const v = emptyVault();
  v.household = {
    name: 'The Rivers household',
    members: [{ id: 'm1', name: 'Asha', kind: 'adult' }, { id: 'm2', name: 'Ben', kind: 'adult' }, { id: 'm3', name: 'Maya', kind: 'child' }],
    properties: [{ id: 'p1', name: 'Family home' }],
  };
  const accounts: Account[] = [
    { id: 'a1', name: 'Joint current', bank: 'monzo', kind: 'current', ownerId: 'joint', balances: [{ date: `${endMonth}-28`, pence: 214000 }] },
    { id: 'a2', name: 'Asha — Starling', bank: 'starling', kind: 'current', ownerId: 'm1', balances: [{ date: `${endMonth}-28`, pence: 86500 }] },
    { id: 'a3', name: 'Ben — Nationwide', bank: 'nationwide', kind: 'current', ownerId: 'm2', balances: [{ date: `${endMonth}-28`, pence: 132000 }] },
    { id: 'a4', name: 'Rainy-day savings', bank: 'nationwide', kind: 'savings', ownerId: 'joint', rate: 3.1, balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 640000 }, { date: `${endMonth}-28`, pence: 910000 }] },
    { id: 'a5', name: 'Stocks & shares ISA', bank: 'other', kind: 'isa', ownerId: 'm1', balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 1820000 }, { date: `${endMonth}-28`, pence: 2140000 }] },
    { id: 'a6', name: 'Workplace pension — Asha', bank: 'other', kind: 'pension', ownerId: 'm1', balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 4150000 }, { date: `${endMonth}-28`, pence: 4520000 }] },
    { id: 'a7', name: 'Workplace pension — Ben', bank: 'other', kind: 'pension', ownerId: 'm2', balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 2890000 }, { date: `${endMonth}-28`, pence: 3110000 }] },
    { id: 'a12', name: 'Maya — Junior ISA', bank: 'other', kind: 'jisa', ownerId: 'm3', rate: 4.1, balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 310000 }, { date: `${endMonth}-28`, pence: 342000 }] },
    { id: 'a13', name: 'Maya — savings pot', bank: 'monzo', kind: 'savings', ownerId: 'm3', rate: 2.0, balances: [{ date: `${endMonth}-28`, pence: 82000 }] },
    { id: 'a11', name: 'Family home (estimate)', bank: 'other', kind: 'property', ownerId: 'joint', balances: [{ date: `${addMonths(endMonth, -5)}-28`, pence: 34000000 }, { date: `${endMonth}-28`, pence: 34500000 }] },
    { id: 'a8', name: 'Mortgage', bank: 'other', kind: 'mortgage', ownerId: 'joint', rate: 4.2, monthly: 112000, fixedUntil: '2027-01-31', balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 21540000 }, { date: `${endMonth}-28`, pence: 21280000 }] },
    { id: 'a9', name: 'Rewards credit card', bank: 'other', kind: 'credit-card', ownerId: 'm2', rate: 24.9, limit: 400000, monthly: 6000, balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 182000 }, { date: `${endMonth}-28`, pence: 154000 }] },
    { id: 'a10', name: 'Family loan (Mum)', bank: 'other', kind: 'owed', ownerId: 'm1', monthly: 15000, balances: [
      { date: `${addMonths(endMonth, -5)}-28`, pence: 300000 }, { date: `${endMonth}-28`, pence: 210000 }] },
  ];
  v.accounts = accounts;

  const txns: Txn[] = [];
  let n = 0;
  const add = (accountId: string, date: string, desc: string, pence: number) => {
    txns.push({ id: `t${n++}`, accountId, date, desc, pence, category: categorise(desc, pence, []), src: 'demo' });
  };
  const jit = (base: number, spread = 0.2) => Math.round(base * (1 - spread / 2 + r() * spread));

  for (let i = 5; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    const d = (day: number) => `${m}-${pad(day)}`;
    add('a2', d(25), 'ACME DESIGN LTD SALARY', 342000);
    add('a3', d(28), 'NORTHERN HEALTH TRUST PAYROLL', 289000);
    add('a1', d(1), 'MORTGAGE HALIFAX DD', -112000);
    add('a1', d(1), 'COUNCIL TAX DD', -17800);
    add('a1', d(3), 'OCTOPUS ENERGY DD', -(i < 2 ? 13400 : 11800));
    add('a1', d(5), 'THAMES WATER DD', -4200);
    add('a1', d(6), 'VIRGIN MEDIA DD', -(i < 3 ? 6900 : 5400));
    add('a2', d(7), 'GIFFGAFF', -1200);
    add('a3', d(7), 'VODAFONE', -3400);
    add('a1', d(9), 'AVIVA HOME INSURANCE', -3100);
    add('a1', d(10), 'NETFLIX.COM', -1099);
    add('a2', d(10), 'SPOTIFY', -1199);
    add('a3', d(12), 'AMAZON PRIME', -899);
    add('a3', d(12), 'PUREGYM', -2499);
    add('a2', d(13), 'HEADSPACE', -1299);
    add('a1', d(14), 'DISNEY PLUS', -799);
    add('a1', d(15), 'BARCLAYCARD PAYMENT', -6000);
    add('a1', d(2), 'LOAN REPAYMENT TO MUM', -15000);
    add('a1', d(20), 'OXFAM DONATION', -2000);
    if (i % 2 === 0) add('a2', d(21), 'CANCER RESEARCH UK', -1500);
    for (let w = 0; w < 4; w++) {
      add('a1', d(2 + w * 7), 'TESCO STORES', -jit(9500));
      add('a1', d(4 + w * 7), 'ALDI', -jit(4200));
    }
    for (let k = 0; k < 6; k++) add(k % 2 ? 'a2' : 'a3', d(3 + k * 4), k % 3 === 0 ? 'DELIVEROO' : k % 3 === 1 ? 'COSTA COFFEE' : 'NANDOS', -jit(k % 3 === 0 ? 2800 : 900, 0.5));
    for (let k = 0; k < 4; k++) add(k % 2 ? 'a2' : 'a3', d(2 + k * 7), 'TFL TRAVEL', -jit(2400, 0.4));
    add('a3', d(17), 'SHELL PETROL', -jit(5500));
    add('a2', d(18), 'AMAZON MKTPLACE', -jit(4500, 0.9));
    add('a2', d(22), 'ASOS', -jit(3500, 0.9));
    add('a3', d(19), 'BOOTS PHARMACY', -jit(1800, 0.6));
    if (i === 1) add('a1', d(23), 'RYANAIR', -42000);
    if (i === 3) add('a1', d(23), 'BOOKING.COM', -61000);
    if (i % 2 === 1) add('a3', d(26), 'CARD INTEREST CHARGED', -jit(3100, 0.1));
    add('a2', d(27), 'TRANSFER TO JOINT ACCOUNT', -150000);
    add('a1', d(27), 'TRANSFER FROM ASHA', 150000);
    add('a3', d(27), 'TRANSFER TO JOINT ACCOUNT', -190000);
    add('a1', d(27), 'TRANSFER FROM BEN', 190000);
    if (i === 3 || i === 0) add('a3', d(15), 'SMITH CONSULTING LTD DIVIDEND', 150000);
    add('a1', d(26), 'TRANSFER TO RAINY-DAY SAVINGS', -(i % 2 ? 30000 : 60000));
    add('a4', d(26), 'TRANSFER FROM JOINT', i % 2 ? 30000 : 60000);
    if (i === 0) add('a1', d(4), 'OCTOPUS ENERGY DD', -13400);
  }
  v.txns = markTransfers(txns);

  const slip = (id: string, memberId: string, m: string, employer: string, gross: number, tax: number, ni: number, pension: number, net: number): Payslip =>
    ({ id, memberId, date: `${m}-25`, employer, gross, tax, ni, pension, studentLoan: 0, otherDeductions: 0, net });
  const ps: Payslip[] = [];
  for (let i = 2; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    ps.push(slip(`ps-a-${i}`, 'm1', m, 'Acme Design Ltd', 445800, 63900, 25700, 22300, 342000 - 8000 + 8000));
    ps.push(slip(`ps-b-${i}`, 'm2', m, 'Northern Health Trust', 366700, 47100, 23800, 20400, 289000 - 0));
  }
  v.payslips = ps.map((p) => ({ ...p, net: p.gross - p.tax - p.ni - p.pension }));
  // make the demo payslip nets line up with salary credits
  v.payslips.forEach((p) => { p.net = p.memberId === 'm1' ? 342000 : 289000; p.otherDeductions = p.gross - p.tax - p.ni - p.pension - p.net; });

  const ben = v.payslips.filter((p) => p.memberId === 'm2').sort((a, b) => a.date.localeCompare(b.date));
  [60000, 0, 90000].forEach((o, i) => { if (ben[i]) { ben[i].overtime = o; ben[i].basic = ben[i].gross - o; ben[i].taxCode = '1060L'; } });
  v.payslips.filter((p) => p.memberId === 'm1').forEach((p) => { p.basic = p.gross; p.taxCode = '1257L'; });

  const hist = (a: number, b: number) => [
    { date: `${addMonths(endMonth, -5)}-01`, monthly: a }, { date: `${addMonths(endMonth, -1)}-01`, monthly: b },
  ];
  const bills: Bill[] = [
    { id: 'b1', kind: 'energy', provider: 'Octopus Energy', propertyId: 'p1', monthly: 13400, fuel: 'electricity', unitRate: 29.4, standingCharge: 60.1,
      contractEnd: '2026-11-15', history: hist(11800, 13400), split: { m1: 50, m2: 50 }, match: 'OCTOPUS', note: 'Fixed deal' },
    { id: 'b2', kind: 'energy', provider: 'Octopus Energy', propertyId: 'p1', monthly: 0, fuel: 'gas', unitRate: 8.6, standingCharge: 31.2,
      contractEnd: '2026-11-15', history: [], split: { m1: 50, m2: 50 } },
    { id: 'b3', kind: 'broadband', provider: 'Virgin Media', propertyId: 'p1', monthly: 6900, contractEnd: '2026-08-30',
      history: hist(5400, 6900), split: { m1: 50, m2: 50 }, match: 'VIRGIN' },
    { id: 'b4', kind: 'water', provider: 'Thames Water', propertyId: 'p1', monthly: 4200, history: [], split: { m1: 50, m2: 50 }, match: 'THAMES', reviewedOn: `${endMonth}-01` },
    { id: 'b5', kind: 'council-tax', provider: 'Local council', propertyId: 'p1', monthly: 17800, history: [], split: { m1: 50, m2: 50 }, match: 'COUNCIL', reviewedOn: `${endMonth}-01` },
    { id: 'b6', kind: 'insurance', provider: 'Aviva', propertyId: 'p1', monthly: 3100, contractEnd: '2027-03-01', history: [], split: { m1: 50, m2: 50 }, match: 'AVIVA' },
    { id: 'b7', kind: 'mobile', provider: 'Vodafone', propertyId: 'p1', monthly: 3400, history: [], split: { m1: 0, m2: 100 }, match: 'VODAFONE' },
    { id: 'b8', kind: 'mobile', provider: 'Giffgaff', propertyId: 'p1', monthly: 1200, history: [], split: { m1: 100, m2: 0 }, match: 'GIFFGAFF', reviewedOn: `${endMonth}-01` },
  ];
  v.bills = bills;
  v.readings = [
    { id: 'r1', propertyId: 'p1', fuel: 'electricity', date: `${addMonths(endMonth, -2)}-30`, value: 41820 },
    { id: 'r2', propertyId: 'p1', fuel: 'electricity', date: `${endMonth}-30`, value: 42170 },
  ];
  v.budget = { Groceries: 52000, 'Eating out': 8000, Transport: 14000, Subscriptions: 7500, Shopping: 9000, Health: 3000, Giving: 6000, Entertainment: 4000 };
  v.values = { enabled: true, givingPct: 2, enough: 420000 };
  return v;
}
