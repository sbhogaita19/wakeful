const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });

export const fmt = (p: number) => gbp.format(p / 100);
export const fmt0 = (p: number) => gbp0.format(Math.round(p / 100));
export const fmtSigned = (p: number) => (p > 0 ? '+' : '') + fmt(p);
export const pct = (n: number, d = 0) => `${n.toFixed(d)}%`;

/** Parse "£1,234.56", "(12.30)", "-12.30", "12.30 CR/DR" into pence. */
export function parseMoney(s: string): number | null {
  let t = (s ?? '').trim();
  if (!t) return null;
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (/\bDR\b/i.test(t)) neg = true;
  t = t.replace(/\b(CR|DR)\b/gi, '').replace(/[£,\s]/g, '');
  if (t.startsWith('-')) { neg = true; t = t.slice(1); }
  if (t.startsWith('+')) t = t.slice(1);
  if (!/^(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const p = Math.round(Number(t) * 100);
  return neg ? -p : p;
}

export const uid = () => crypto.randomUUID();
