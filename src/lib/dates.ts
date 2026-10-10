const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const pad = (n: number) => String(n).padStart(2, '0');

function valid(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Parse common UK bank date formats to YYYY-MM-DD. */
export function parseDate(s: string, fallbackYear?: number): string | null {
  const t = (s ?? '').trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return valid(y, +m[2], +m[1]);
  }
  m = t.match(/^(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ ,-]*(\d{4}|\d{2})?$/);
  if (m) {
    const mi = MON.indexOf(m[2].toLowerCase());
    if (mi < 0) return null;
    const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : fallbackYear;
    if (!y) return null;
    return valid(y, mi + 1, +m[1]);
  }
  return null;
}

export const ym = (d: string) => d.slice(0, 7);
export const todayISO = () => new Date().toISOString().slice(0, 10);

export function addMonths(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function monthLabel(month: string, short = false): string {
  const d = new Date(`${month}-01T12:00:00Z`);
  return d.toLocaleDateString('en-GB', {
    month: short ? 'short' : 'long', year: short ? undefined : 'numeric', timeZone: 'UTC',
  });
}

export function daysUntil(date: string, from = todayISO()): number {
  return Math.round((Date.parse(date) - Date.parse(from)) / 86400000);
}

export const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
