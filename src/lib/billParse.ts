import type { Bill, BillKind } from '../types';
import { parseDate } from './dates';
import { parseMoney } from './money';

/** Best-effort read of a utility bill's text. The user always confirms the result. */
export function parseBillLines(lines: string[]): Partial<Bill> & { found: string[] } {
  const text = lines.join('\n');
  const out: Partial<Bill> & { found: string[] } = { found: [] };

  const kinds: [BillKind, RegExp][] = [
    ['security', /\b(alarm|verisure|intruder|monitoring centre|keyholder)\b/i],
    ['energy', /\b(kwh|electricity|gas supply|meter point|mpan|mprn)\b/i],
    ['water', /\b(water|sewerage|wastewater|m3|cubic met)/i],
    ['broadband', /\b(broadband|fibre|wi-?fi|router)\b/i],
    ['mobile', /\b(sim|mobile|data allowance|minutes)\b/i],
    ['council-tax', /\bcouncil tax\b/i],
    ['insurance', /\b(policy number|premium|insurance)\b/i],
  ];
  const k = kinds.find(([, re]) => re.test(text));
  if (k) { out.kind = k[0]; out.found.push('type'); }

  if (out.kind === 'energy') {
    out.fuel = /\bgas\b/i.test(text) && !/\belectricity\b/i.test(text) ? 'gas' : 'electricity';
    const u = text.match(/(\d{1,2}\.\d{1,4})\s*p\s*(?:per|\/)\s*kwh/i);
    if (u) { out.unitRate = +u[1]; out.found.push('unit rate'); }
    const s = text.match(/(\d{1,3}\.\d{1,4})\s*p\s*(?:per|\/)\s*day/i);
    if (s) { out.standingCharge = +s[1]; out.found.push('standing charge'); }
  }

  const total = lines.find((l) => /\b(total (amount )?(due|to pay)|amount (due|to pay)|your monthly (payment|direct debit)|monthly payment|direct debit amount)\b/i.test(l));
  if (total) {
    const m = total.match(/£\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\d+\.\d{2}/);
    const v = m ? parseMoney(m[0].replace('£', '')) : null;
    if (v) { out.monthly = Math.abs(v); out.found.push('amount'); }
  }

  const end = text.match(/\b(?:contract|fixed (?:term|price|rate)|tariff|agreement|minimum term)[^\n]{0,40}?(?:ends?|expires?|until|to)[^\d\n]{0,10}(\d{1,2}[ /.-](?:[A-Za-z]{3,9}|\d{1,2})[ /.-]\d{2,4})/i);
  if (end) { const d = parseDate(end[1]); if (d) { out.contractEnd = d; out.found.push('contract end'); } }

  const prov = ['Octopus', 'British Gas', 'EDF', 'E.ON', 'OVO', 'Scottish Power', 'Bulb', 'Thames Water', 'Severn Trent', 'United Utilities', 'Anglian Water', 'Yorkshire Water',
    'Southern Water', 'Virgin Media', 'BT', 'Sky', 'TalkTalk', 'Plusnet', 'Vodafone', 'EE', 'O2', 'Three', 'Giffgaff', 'Aviva', 'Admiral', 'Direct Line', 'Verisure', 'ADT', 'Utilita', 'Shell Energy', 'SSE', 'Utility Warehouse', 'So Energy', 'Welsh Water'].find((p) => new RegExp(`\\b${p.replace('.', '\\.')}\\b`, 'i').test(text));
  if (prov) { out.provider = prov; out.found.push('provider'); }
  return out;
}
