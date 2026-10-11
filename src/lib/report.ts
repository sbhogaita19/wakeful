import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { activeBills, adults, children, childAccountIds, isLiability, KIND_LABEL, NON_SPEND, type Account, type Vault } from '../types';
import { avgSpendByCategory, homeEquity, householdIncome, latestBalance, latestMonth, monthlySeries, netWorth, spendByCategory, totalSpend, valueNow } from './analytics';
import { buildInsights, totalSavingPotential } from './insights';
import { pulse } from './pulse';
import { dividendSummaries } from './dividends';
import { earningsSummary, taxCheck } from './payslip';
import { fmtDate, monthLabel, todayISO } from './dates';
import { fmt, fmt0 } from './money';

export interface ReportOptions {
  overview: boolean; income: boolean; spending: boolean; bills: boolean; wealth: boolean; pensions: boolean; insights: boolean; children: boolean;
  /** show real names; otherwise "Adult 1", "Adult 2", "Child 1" and generic account names */
  names: boolean;
  title?: string;
}
export const PRESETS: Record<'partner' | 'adviser' | 'summary', { label: string; opts: ReportOptions }> = {
  partner: { label: 'For my partner', opts: { overview: true, income: true, spending: true, bills: true, wealth: true, pensions: true, insights: true, children: true, names: true } },
  adviser: { label: 'For a financial adviser', opts: { overview: true, income: true, spending: true, bills: false, wealth: true, pensions: true, insights: false, children: false, names: false } },
  summary: { label: 'One-page summary', opts: { overview: true, income: false, spending: false, bills: false, wealth: false, pensions: false, insights: true, children: false, names: false } },
};

/** Standard PDF fonts only cover Latin-1 plus a few typographic marks. Replace anything else. */
const clean = (s: string) => s
  .replace(/[→⟶]/g, '->').replace(/[▲]/g, '+').replace(/[▼]/g, '-').replace(/[≈~]/g, '~').replace(/[✓✔]/g, 'v').replace(/ /g, ' ')
  .replace(/[^\x20-\x7E¡-ÿ–—‘’“”•…€]/g, '');

const INK = rgb(0.1, 0.1, 0.12), MUTE = rgb(0.42, 0.42, 0.46), LINE = rgb(0.85, 0.85, 0.87), ACC = rgb(0.76, 0, 0.61), GOOD = rgb(0.07, 0.5, 0.29), WARN = rgb(0.64, 0.38, 0);

class Doc {
  pdf!: PDFDocument; font!: PDFFont; bold!: PDFFont; mono!: PDFFont;
  page!: PDFPage; y = 0; n = 0;
  W = 595.28; H = 841.89; M = 48;
  constructor(private footer: string) {}
  async init() {
    this.pdf = await PDFDocument.create();
    this.font = await this.pdf.embedFont(StandardFonts.Helvetica);
    this.bold = await this.pdf.embedFont(StandardFonts.HelveticaBold);
    this.mono = await this.pdf.embedFont(StandardFonts.Courier);
    this.pdf.setCreator('Wakeful'); this.pdf.setProducer('Wakeful (on-device)');
    this.add();
  }
  add() {
    this.page = this.pdf.addPage([this.W, this.H]); this.n++; this.y = this.H - this.M;
    this.page.drawText(clean(this.footer), { x: this.M, y: 26, size: 7.5, font: this.font, color: MUTE });
    this.page.drawText(`Page ${this.n}`, { x: this.W - this.M - 30, y: 26, size: 7.5, font: this.font, color: MUTE });
  }
  need(h: number) { if (this.y - h < this.M + 20) this.add(); }
  gap(h = 10) { this.y -= h; }
  text(s: string, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; x?: number; right?: number } = {}) {
    const size = o.size ?? 10, font = o.font ?? this.font, t = clean(s);
    const x = o.right !== undefined ? o.right - font.widthOfTextAtSize(t, size) : o.x ?? this.M;
    this.page.drawText(t, { x, y: this.y, size, font, color: o.color ?? INK });
  }
  wrap(s: string, width: number, size: number, font: PDFFont): string[] {
    const out: string[] = [];
    for (const para of clean(s).split('\n')) {
      let line = '';
      for (const w of para.split(/\s+/)) {
        const t = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(t, size) > width && line) { out.push(line); line = w; } else line = t;
      }
      out.push(line);
    }
    return out;
  }
  para(s: string, o: { size?: number; color?: ReturnType<typeof rgb>; font?: PDFFont } = {}) {
    const size = o.size ?? 9.5, lh = size * 1.45;
    for (const l of this.wrap(s, this.W - this.M * 2, size, o.font ?? this.font)) { this.need(lh); this.y -= lh; this.text(l, { size, color: o.color, font: o.font }); }
  }
  h1(s: string) { this.need(40); this.y -= 22; this.text(s, { size: 20, font: this.bold }); this.y -= 6; }
  h2(s: string) {
    this.need(46); this.y -= 26; this.text(s.toUpperCase(), { size: 9, font: this.bold, color: ACC });
    this.y -= 6; this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.W - this.M, y: this.y }, thickness: 0.6, color: LINE });
  }
  /** A bold sub-heading with room above it. */
  sub(s: string) { this.need(40); this.y -= 24; this.text(s, { size: 10, font: this.bold }); this.y -= 2; }
  stat(items: { label: string; value: string; color?: ReturnType<typeof rgb> }[]) {
    this.need(46); this.y -= 8;
    const w = (this.W - this.M * 2) / items.length;
    items.forEach((it, i) => {
      const x = this.M + i * w;
      this.page.drawText(clean(it.label.toUpperCase()), { x, y: this.y - 8, size: 7, font: this.bold, color: MUTE });
      this.page.drawText(clean(it.value), { x, y: this.y - 26, size: 15, font: this.bold, color: it.color ?? INK });
    });
    this.y -= 38;
  }
  /** cols: widths in points; right-align numeric columns; optional bar column value 0..1 */
  table(head: string[], rows: string[][], cols: number[], right: number[] = [], bars?: (number | null)[]) {
    const rowH = 16;
    const draw = (cells: string[], f: PDFFont, color = INK, size = 9) => {
      let x = this.M;
      cells.forEach((c, i) => {
        let t = clean(c);
        while (t.length > 1 && f.widthOfTextAtSize(t, size) > cols[i] - 6) t = t.slice(0, -2) + '…';
        this.page.drawText(t, { x: right.includes(i) ? x + cols[i] - 6 - f.widthOfTextAtSize(t, size) : x, y: this.y + 4, size, font: f, color });
        x += cols[i];
      });
    };
    this.need(rowH * 2); this.y -= rowH; draw(head.map((h) => h.toUpperCase()), this.bold, MUTE, 7);
    this.page.drawLine({ start: { x: this.M, y: this.y + 1 }, end: { x: this.M + cols.reduce((a, b) => a + b, 0), y: this.y + 1 }, thickness: 0.5, color: LINE });
    rows.forEach((r, ri) => {
      this.need(rowH); this.y -= rowH; draw(r, this.font);
      const b = bars?.[ri];
      if (b != null) this.page.drawRectangle({ x: this.M + cols.reduce((a, c) => a + c, 0) + 6, y: this.y + 4, width: Math.max(1, b * 70), height: 6, color: ACC, opacity: 0.55 });
      this.page.drawLine({ start: { x: this.M, y: this.y }, end: { x: this.M + cols.reduce((a, c) => a + c, 0), y: this.y }, thickness: 0.3, color: LINE });
    });
  }
}

/** Build a PDF summary of the household entirely on this device. Nothing is uploaded. */
export async function buildReport(v: Vault, o: ReportOptions, today = todayISO()): Promise<Uint8Array> {
  const cur = latestMonth(v.txns);
  const people = v.household.members;
  const nameOf = (id: string) => {
    if (id === 'joint') return 'Joint';
    const m = people.find((x) => x.id === id);
    if (!m) return '';
    if (o.names) return m.name;
    const group = m.kind === 'child' ? children(v) : adults(v);
    return `${m.kind === 'child' ? 'Child' : 'Adult'} ${group.findIndex((x) => x.id === id) + 1}`;
  };
  const acctName = (a: Account) => (o.names ? a.name : `${KIND_LABEL[a.kind]}${a.ownerId !== 'joint' ? ` (${nameOf(a.ownerId)})` : ' (joint)'}`);
  const kids = childAccountIds(v);
  const title = o.title || (o.names ? v.household.name : 'Household');

  const d = new Doc(`Wakeful · ${o.names ? title : 'Household'} · prepared ${fmtDate(today)} · Confidential. General information from user-entered data, not financial advice.`);
  await d.init();

  d.h1(`${title} — financial summary`);
  d.para(`Prepared ${fmtDate(today)}${cur ? ` · latest month of transactions: ${monthLabel(cur)}` : ''} · ${adults(v).length} adult${adults(v).length > 1 ? 's' : ''}${children(v).length ? `, ${children(v).length} child${children(v).length > 1 ? 'ren' : ''}` : ''}`, { color: MUTE });

  const nw = netWorth(v.accounts, kids);
  const income = cur ? householdIncome(v, cur) : 0;
  const spend = cur ? totalSpend(v.txns, cur) : 0;

  if (o.overview) {
    d.h2('Overview');
    d.stat([
      { label: 'Net worth', value: fmt0(nw.net), color: nw.net < 0 ? WARN : INK },
      { label: 'Monthly take-home', value: income ? fmt0(income) : 'n/a' },
      { label: 'Monthly spending', value: cur ? fmt0(spend) : 'n/a' },
      { label: 'Kept', value: income && cur ? `${Math.round(((income - spend) / income) * 100)}%` : 'n/a', color: GOOD },
    ]);
    const p = pulse(v, today);
    if (p) {
      d.para(`Balance score ${p.overall}/100 — ${p.pillars.map((x) => `${x.label} ${x.score}`).join(' · ')}.`, { color: MUTE });
    }
    if (cur) {
      const series = monthlySeries(v.txns, cur, 6);
      d.gap(6);
      d.table(['Month', 'Income', 'Spending', 'Kept'], series.map((s) => [monthLabel(s.month), fmt0(s.income), fmt0(s.spend), fmt0(s.income - s.spend)]), [140, 100, 100, 100], [1, 2, 3]);
    }
  }

  if (o.income) {
    d.h2('Income');
    for (const m of adults(v)) {
      const slips = v.payslips.filter((p) => p.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date));
      if (!slips.length) continue;
      const p = slips[0], e = earningsSummary(slips.slice(0, 6));
      d.sub(`${nameOf(m.id)} — ${o.names ? p.employer || 'employer' : 'employer'}, payslip ${fmtDate(p.date)}`);
      d.table(['', 'This payslip', '% of gross'], [
        ['Gross pay', fmt(p.gross), '100%'], ['Income tax', fmt(p.tax), `${((p.tax / (p.gross || 1)) * 100).toFixed(1)}%`], ['National Insurance', fmt(p.ni), `${((p.ni / (p.gross || 1)) * 100).toFixed(1)}%`],
        ['Pension (employee)', fmt(p.pension), `${((p.pension / (p.gross || 1)) * 100).toFixed(1)}%`], ['Take-home', fmt(p.net), `${((p.net / (p.gross || 1)) * 100).toFixed(1)}%`],
      ], [200, 120, 100], [1, 2]);
      d.para(`Annualised: about ${fmt0(p.gross * 12)} gross, ${fmt0(p.net * 12)} take-home.${p.taxCode ? ` Tax code ${p.taxCode}.` : ''}${e.overtime > 0 ? ` Overtime in the last ${e.slips} payslips: ${fmt0(e.overtime)} (${Math.round(e.overtimeShare * 100)}% of gross).` : ''}`, { color: MUTE });
      for (const prob of taxCheck(p).problems) d.para(`Note: ${prob}`, { color: WARN, size: 8.5 });
    }
    for (const dv of dividendSummaries(v, today)) {
      d.gap(8);
      d.para(`${nameOf(dv.memberId)} dividends, ${dv.taxYear}: ${fmt0(dv.ytd)} received so far, about ${fmt0(dv.projected)} projected. Estimated dividend tax ${fmt0(dv.estTax)}${dv.estTax > 0 ? ` (set aside about ${dv.setAsidePct}%)` : ' (within allowances)'}. Based on 2026/27 rates.`);
    }
  }

  if (o.spending && cur) {
    d.h2(`Spending — ${monthLabel(cur)} vs 6-month average`);
    const now = spendByCategory(v.txns, cur), avg = avgSpendByCategory(v.txns, cur);
    const cats = Object.keys({ ...now, ...avg }).filter((c) => !NON_SPEND.has(c)).sort((a, b) => (now[b] ?? 0) - (now[a] ?? 0));
    const mx = Math.max(1, ...cats.map((c) => now[c] ?? 0));
    d.table(['Category', 'This month', '6-mo average', 'Budget'], cats.map((c) => [c, fmt0(now[c] ?? 0), fmt0(avg[c] ?? 0), v.budget[c] ? fmt0(v.budget[c]) : '—']), [170, 90, 90, 80], [1, 2, 3], cats.map((c) => (now[c] ?? 0) / mx));
    d.para(`Total this month ${fmt0(spend)}. Transfers between your own accounts and savings are excluded.`, { color: MUTE });
  }

  if (o.bills) {
    const bills = activeBills(v).sort((a, b) => b.monthly - a.monthly);
    if (bills.length) {
      d.h2('Household bills');
      d.table(['Provider', 'Type', 'Monthly', 'Renews / ends'], bills.map((b) => [o.names ? b.provider : b.kind.replace('-', ' '), (b.fuel ?? b.kind).replace('-', ' '), fmt(b.monthly), b.contractEnd ? fmtDate(b.contractEnd) : '—']), [190, 100, 80, 120], [2]);
      d.para(`Total ${fmt0(bills.reduce((s, b) => s + b.monthly, 0))} a month (${fmt0(bills.reduce((s, b) => s + b.monthly, 0) * 12)} a year).`, { color: MUTE });
    }
  }

  if (o.wealth) {
    d.h2('Assets and debts');
    d.stat([{ label: 'Assets', value: fmt0(nw.assets), color: GOOD }, { label: 'Owed', value: fmt0(nw.debts) }, { label: 'Net worth', value: fmt0(nw.net) }]);
    const assets = v.accounts.filter((a) => !isLiability(a.kind) && !kids.has(a.id) && (o.pensions || a.kind !== 'pension'));
    d.table(['Asset', 'Type', 'Owner', 'Value'], assets.map((a) => [acctName(a), KIND_LABEL[a.kind], nameOf(a.ownerId), fmt0(valueNow(a))]), [210, 100, 80, 90], [3]);
    const debts = v.accounts.filter((a) => isLiability(a.kind));
    if (debts.length) {
      d.gap(10);
      d.table(['Debt', 'Rate', 'Monthly', 'Owed'], debts.map((a) => [acctName(a) + (a.fixedUntil ? ` (fixed to ${fmtDate(a.fixedUntil)})` : ''), a.rate ? `${a.rate}%` : '—', a.monthly ? fmt0(a.monthly) : '—', fmt0(latestBalance(a))]), [250, 60, 80, 90], [1, 2, 3]);
    }
    const eq = homeEquity(v.accounts, today);
    if (eq) d.para(`Home: value ${fmt0(eq.value)}, mortgage ${fmt0(eq.owed)}, equity ${fmt0(eq.equity)}, loan-to-value ${eq.ltv.toFixed(0)}%. Property values are the household's own estimates.`, { color: MUTE });
  }

  if (o.pensions) {
    const pens = v.accounts.filter((a) => a.kind === 'pension');
    if (pens.length) {
      d.h2('Pensions');
      d.table(['Pension', 'Owner', 'Value'], pens.map((a) => [acctName(a), nameOf(a.ownerId), fmt0(latestBalance(a))]), [250, 120, 110], [2]);
      const lines = adults(v).map((m) => {
        const s = v.payslips.filter((p) => p.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date))[0];
        return s && s.gross ? `${nameOf(m.id)}: employee contribution ${((s.pension / s.gross) * 100).toFixed(1)}% of gross` : null;
      }).filter(Boolean);
      if (lines.length) d.para(`${lines.join(' · ')}. Employer contributions, state pension and growth projections are not tracked by Wakeful.`, { color: MUTE });
    }
  }

  if (o.children && children(v).length) {
    d.h2("Children's savings (not part of household net worth)");
    for (const c of children(v)) {
      const mine = v.accounts.filter((a) => a.ownerId === c.id);
      if (!mine.length) continue;
      d.table([nameOf(c.id), 'Type', 'Rate', 'Value'], mine.map((a) => [acctName(a), KIND_LABEL[a.kind], a.rate ? `${a.rate}%` : '—', fmt0(latestBalance(a))]), [210, 100, 60, 110], [2, 3]);
    }
  }

  if (o.insights) {
    const ins = buildInsights(v, today).filter((i) => i.severity !== 'info' || (i.yearly ?? 0) > 0).slice(0, 12);
    if (ins.length) {
      d.h2(`Where to look — up to ${fmt0(totalSavingPotential(buildInsights(v, today)))} a year`);
      for (const i of ins) {
        d.need(46); d.y -= 14;
        d.text(i.severity === 'high' ? 'ACT' : i.severity === 'medium' ? 'REVIEW' : 'NOTE', { size: 7, font: d.bold, color: i.severity === 'high' ? WARN : MUTE });
        if (i.yearly && i.yearly > 0) d.text(`${fmt0(i.yearly)} / yr`, { right: d.W - d.M, size: 8.5, font: d.bold, color: GOOD });
        d.para(o.names ? i.title : i.title.replace(/^[A-Z][a-z]+(?= — | is | has | pays )/, 'Item'), { font: d.bold, size: 9.5 });
        d.para(i.detail, { size: 8.5, color: MUTE });
      }
    }
  }

  d.gap(14);
  d.para('This summary was generated on the owner’s device from information they entered or imported. Figures are estimates and may contain errors. It is general information, not financial, tax or legal advice. The PDF is not encrypted: share it only with people you trust.', { size: 8, color: MUTE });
  return d.pdf.save();
}
