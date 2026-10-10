export type Pence = number;
export type Bank = 'monzo' | 'starling' | 'nationwide' | 'other';
export type AccountKind =
  | 'current' | 'savings' | 'isa' | 'pension' | 'investment' | 'property'
  | 'credit-card' | 'loan' | 'mortgage' | 'owed';

export const LIABILITY_KINDS: AccountKind[] = ['credit-card', 'loan', 'mortgage', 'owed'];
export const isLiability = (k: AccountKind) => LIABILITY_KINDS.includes(k);

export const KIND_LABEL: Record<AccountKind, string> = {
  current: 'Current account', savings: 'Savings', isa: 'ISA', pension: 'Pension',
  investment: 'Investment', property: 'Property', 'credit-card': 'Credit card', loan: 'Loan',
  mortgage: 'Mortgage', owed: 'Money I owe',
};

export interface Member { id: string; name: string; }
export interface Property { id: string; name: string; }

export interface Account {
  id: string;
  name: string;
  bank: Bank;
  kind: AccountKind;
  /** member id, or 'joint' */
  ownerId: string;
  /** interest rate (savings) or APR (debt), percent */
  rate?: number;
  /** credit limit, pence */
  limit?: number;
  /** regular monthly payment / minimum, pence */
  monthly?: number;
  /** property: assumed yearly growth %, applied from the last valuation date */
  growthPct?: number;
  /** mortgage fixed-rate end, YYYY-MM-DD */
  fixedUntil?: string;
  /** Liabilities store the positive amount owed. */
  balances: { date: string; pence: Pence }[];
}

export interface Txn {
  id: string;
  accountId: string;
  date: string;
  desc: string;
  pence: Pence;
  category: string;
  transfer?: boolean;
  review?: boolean;
  src: 'csv' | 'pdf' | 'manual' | 'demo';
  /** donation eligible for Gift Aid */
  giftAid?: boolean;
  /** user's own mindful tag */
  tag?: 'mindful' | 'regret';
}

export interface Payslip {
  id: string;
  memberId: string;
  date: string;
  employer: string;
  gross: Pence;
  tax: Pence;
  ni: Pence;
  pension: Pence;
  studentLoan: Pence;
  otherDeductions: Pence;
  net: Pence;
}

export type BillKind =
  | 'energy' | 'water' | 'council-tax' | 'broadband' | 'mobile'
  | 'insurance' | 'security' | 'tv-licence' | 'subscription' | 'other';

export interface Bill {
  id: string;
  kind: BillKind;
  provider: string;
  propertyId: string;
  /** current monthly cost */
  monthly: Pence;
  /** electricity / gas unit rate in pence per kWh, standing charge pence per day */
  unitRate?: number;
  standingCharge?: number;
  fuel?: 'electricity' | 'gas';
  contractEnd?: string;
  /** monthly cost history, oldest first */
  history: { date: string; monthly: Pence }[];
  /** share per member id, percent, sums to 100 */
  split: Record<string, number>;
  /** substring that identifies this bill in bank transactions */
  match?: string;
  note?: string;
  reviewedOn?: string;
}

export interface Reading { id: string; propertyId: string; fuel: 'electricity' | 'gas' | 'water'; date: string; value: number; }

export interface Rule { match: string; category: string; }

export interface Values {
  enabled: boolean;
  /** target share of take-home to give, percent */
  givingPct: number;
  /** monthly spending that feels like "enough", pence (0 = unset) */
  enough: number;
}

export interface Settings { autoLockMins: number; }

export interface Vault {
  v: 2;
  household: { name: string; members: Member[]; properties: Property[] };
  accounts: Account[];
  txns: Txn[];
  payslips: Payslip[];
  bills: Bill[];
  readings: Reading[];
  budget: Record<string, Pence>;
  /** user-defined spending categories, in addition to the built-in list */
  customCategories: string[];
  rules: Rule[];
  values: Values;
  settings: Settings;
}

export const emptyVault = (): Vault => ({
  v: 2,
  household: {
    name: 'Our home',
    members: [{ id: 'm1', name: 'Me' }],
    properties: [{ id: 'p1', name: 'Home' }],
  },
  accounts: [], txns: [], payslips: [], bills: [], readings: [],
  budget: {}, customCategories: [], rules: [],
  values: { enabled: true, givingPct: 2, enough: 0 },
  settings: { autoLockMins: 5 },
});

export const CATEGORIES = [
  'Income', 'Housing', 'Bills', 'Groceries', 'Eating out', 'Transport', 'Subscriptions',
  'Shopping', 'Health', 'Entertainment', 'Travel', 'Family', 'Giving', 'Debt payments',
  'Fees & interest', 'Cash', 'Savings & transfers', 'Other',
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Categories that are not "spending". */
export const NON_SPEND = new Set<string>(['Income', 'Savings & transfers']);

export const CATEGORY_COLOR: Record<string, string> = {
  Income: '#4fd1a5', Housing: '#6aa7ff', Bills: '#8b8cff', Groceries: '#7bd88f',
  'Eating out': '#f5b14c', Transport: '#5ec8e5', Subscriptions: '#c58bff',
  Shopping: '#ff8fb1', Health: '#ff7a7a', Entertainment: '#ffd166', Travel: '#4dd0c8',
  Family: '#e0a96d', Giving: '#e6c27a', 'Debt payments': '#ef6f6f', 'Fees & interest': '#ff5d73',
  Cash: '#9aa4b2', 'Savings & transfers': '#6e7a8a', Other: '#7d8794',
};

/** Built-in plus user-defined categories. */
export const allCategories = (v: { customCategories?: string[] }): string[] => [...CATEGORIES, ...(v.customCategories ?? [])];

/** Stable colour for any category, including custom ones. */
export function colorOf(c: string): string {
  if (CATEGORY_COLOR[c]) return CATEGORY_COLOR[c];
  let h = 0;
  for (const ch of c) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 62%)`;
}
