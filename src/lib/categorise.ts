import type { Rule, Txn } from '../types';

const K: [RegExp, string][] = [
  [/\b(salary|wages|payroll|dividend|child benefit|hmrc (tax )?refund|interest paid|gross interest)\b/i, 'Income'],
  [/\b(oxfam|british red cross|cancer research|macmillan|unicef|wateraid|shelter|save the children|charity|just ?giving|donation|temple|buddhist|dana|age uk|rspca|wwf|greenpeace|barnardo|marie curie|oxfam|msf|doctors without borders|samaritans)\b/i, 'Giving'],
  [/\b(mortgage|rent|council tax|landlord|letting|ground rent|service charge)\b/i, 'Housing'],
  [/\b(credit card|barclaycard|mbna|capital one|amex|american express|loan repayment|klarna|clearpay|paypal credit|student loan|santander cards)\b/i, 'Debt payments'],
  [/\b(overdraft|unarranged|monthly fee|account fee|interest charged|late fee|foreign (transaction|usage) fee|returned payment)\b/i, 'Fees & interest'],
  [/\b(uber eats|deliveroo|just ?eat|mcdonald|greggs|starbucks|costa|pret|nando|pizza|kfc|burger king|wagamama|restaurant|cafe|caf[eé]|pub|coffee|bakery|takeaway|domino|subway|five guys|wetherspoon|itsu|leon)\b/i, 'Eating out'],
  [/\b(tesco|sainsbury|asda|aldi|lidl|morrisons|waitrose|ocado|co-?op|iceland|m&s food|marks (&|and) spencer food|farmfoods|booths)\b/i, 'Groceries'],
  [/\b(netflix|spotify|disney|amazon prime|prime video|apple\.com\/bill|icloud|google one|youtube|now tv|audible|dropbox|microsoft 365|openai|anthropic|patreon|puregym|the gym|david lloyd|headspace|calm|insight timer|substack|kindle unlimited)\b/i, 'Subscriptions'],
  [/\b(british gas|edf|octopus|e\.?on|bulb|ovo|scottish power|thames water|severn trent|united utilities|anglian water|yorkshire water|southern water|virgin media|bt group|bt broadband|sky|vodafone|ee limited|o2|three|giffgaff|tv licen[cs]e|aviva|admiral|direct line|insurance|hastings|lv=|broadband|talktalk|plusnet)\b/i, 'Bills'],
  [/\b(tfl|trainline|uber|bolt|shell|bp|esso|texaco|national rail|parking|ringgo|dvla|petrol|fuel|lner|avanti|gwr|southern rail|oyster|ncp)\b/i, 'Transport'],
  [/\b(boots|pharmacy|superdrug|dentist|optician|specsavers|nhs|physio|vision express|holland (&|and) barrett)\b/i, 'Health'],
  [/\b(ryanair|easyjet|british airways|booking\.com|airbnb|hotel|premier inn|jet2|expedia|travelodge|eurostar)\b/i, 'Travel'],
  [/\b(cinema|odeon|vue|ticketmaster|steam|playstation|xbox|nintendo|theatre|cineworld|eventbrite)\b/i, 'Entertainment'],
  [/\b(school|nursery|childcare|toys|mothercare|kids|tutor|club)\b/i, 'Family'],
  [/\b(amazon|ebay|argos|john lewis|ikea|next|h&m|zara|primark|asos|currys|b&q|screwfix|etsy|tk maxx|wilko|apple store)\b/i, 'Shopping'],
  [/\b(atm|cash withdrawal|cashpoint|cash machine)\b/i, 'Cash'],
  [/\b(pot|savings|transfer (to|from)|standing order to|isa|round ?up)\b/i, 'Savings & transfers'],
];

/** Reduce a merchant description to a stable key (used for learned rules and recurrence). */
export function merchantKey(desc: string): string {
  return desc
    .toUpperCase()
    .replace(/\b(CARD|PURCHASE|PAYMENT|DEBIT|DD|SO|FPI|FPO|BGC|BACS|VIS|POS|CD|\d{4}|\d{2}[/-]\d{2})\b/g, ' ')
    .replace(/[^A-Z&]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .join(' ');
}

export function categorise(desc: string, pence: number, rules: Rule[], hint?: string): string {
  const key = merchantKey(desc);
  const learned = rules.find((r) => r.match === key);
  if (learned) return learned.category;
  for (const [re, cat] of K) if (re.test(desc)) {
    if (pence > 0 && cat !== 'Income' && cat !== 'Savings & transfers') return cat; // refund offsets spend
    return cat;
  }
  if (pence > 0) return 'Income';
  const h = (hint ?? '').toLowerCase();
  const map: Record<string, string> = {
    groceries: 'Groceries', eating_out: 'Eating out', 'eating out': 'Eating out', transport: 'Transport',
    shopping: 'Shopping', entertainment: 'Entertainment', bills: 'Bills', 'bills & fees': 'Bills',
    health: 'Health', holidays: 'Travel', travel: 'Travel', charity: 'Giving', family: 'Family',
    general: 'Other', expenses: 'Other', cash: 'Cash', finances: 'Fees & interest', lifestyle: 'Other',
  };
  return map[h] ?? 'Other';
}

export function learnRule(rules: Rule[], desc: string, category: string): Rule[] {
  const key = merchantKey(desc);
  if (!key) return rules;
  return [...rules.filter((r) => r.match !== key), { match: key, category }];
}

/** Mark matching opposite-sign movements between different accounts as internal transfers. */
export function markTransfers(txns: Txn[]): Txn[] {
  const out = txns.map((t) => ({ ...t }));
  const used = new Set<number>();
  const day = (d: string) => Date.parse(d) / 86400000;
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    if (used.has(i) || a.pence >= 0) continue;
    for (let j = 0; j < out.length; j++) {
      const b = out[j];
      if (i === j || used.has(j) || b.pence !== -a.pence || b.accountId === a.accountId) continue;
      if (Math.abs(day(a.date) - day(b.date)) > 3) continue;
      a.transfer = b.transfer = true;
      a.category = b.category = 'Savings & transfers';
      used.add(i); used.add(j);
      break;
    }
  }
  return out;
}

const dkey = (t: Pick<Txn, 'accountId' | 'date' | 'pence' | 'desc'>) =>
  `${t.accountId}|${t.date}|${t.pence}|${merchantKey(t.desc)}`;

/** Split incoming rows into new vs already-imported (handles genuine same-day duplicates). */
export function dedupe<T extends Pick<Txn, 'accountId' | 'date' | 'pence' | 'desc'>>(existing: Txn[], incoming: T[]) {
  const have = new Map<string, number>();
  for (const t of existing) have.set(dkey(t), (have.get(dkey(t)) ?? 0) + 1);
  const seen = new Map<string, number>();
  const fresh: T[] = [];
  let dupes = 0;
  for (const t of incoming) {
    const k = dkey(t);
    const n = (seen.get(k) ?? 0) + 1;
    seen.set(k, n);
    if (n <= (have.get(k) ?? 0)) dupes++;
    else fresh.push(t);
  }
  return { fresh, dupes };
}
