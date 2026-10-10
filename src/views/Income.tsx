import { useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Field, Head, Modal } from '../components/ui';
import { Icon } from '../components/Icon';
import { fmt, fmt0, parseMoney, uid } from '../lib/money';
import { fmtDate, todayISO } from '../lib/dates';
import { earningsSummary, impliedNet, parsePayslipLines, takeHome, taxCheck, taxYearOf } from '../lib/payslip';
import { dividendSummaries, unassignedDividends } from '../lib/dividends';
import { jointAnalysis, personalSpend } from '../lib/joint';
import { latestMonth } from '../lib/analytics';
import type { Payslip } from '../types';

const F: { k: keyof Payslip; l: string }[] = [
  { k: 'gross', l: 'Gross pay' }, { k: 'tax', l: 'Income tax' }, { k: 'ni', l: 'National Insurance' },
  { k: 'pension', l: 'Pension (employee)' }, { k: 'studentLoan', l: 'Student loan' }, { k: 'otherDeductions', l: 'Other deductions' }, { k: 'net', l: 'Net pay (take-home)' },
];

export function Income() {
  const { vault: v, update } = useStore();
  const [edit, setEdit] = useState<Payslip | null>(null);
  const th = takeHome(v.payslips);
  const name = (id: string) => v.household.members.find((m) => m.id === id)?.name ?? '';
  const blank = (): Payslip => ({ id: uid(), memberId: v.household.members[0].id, date: todayISO(), employer: '', gross: 0, tax: 0, ni: 0, pension: 0, studentLoan: 0, otherDeductions: 0, net: 0 });
  return (
    <>
      <Head title="Income" sub="Take-home worked out from your payslips, automatically.">
        <button className="btn primary" onClick={() => setEdit(blank())}><Icon n="plus" />Add payslip</button>
      </Head>
      <div className="grid g3">
        <Card><div className="stat"><div className="label">Household take-home</div><div className="val pos">{fmt0(th)}</div><div className="note">monthly · average of each person’s latest 3 payslips</div></div></Card>
        {v.household.members.map((m) => {
          const t = takeHome(v.payslips.filter((p) => p.memberId === m.id));
          return <Card key={m.id}><div className="stat"><div className="label">{m.name}</div><div className="val">{t ? fmt0(t) : '—'}</div></div></Card>;
        }).slice(0, 2)}
      </div>
      {v.household.members.map((m) => {
        const mine = v.payslips.filter((p) => p.memberId === m.id).sort((a, b) => b.date.localeCompare(a.date));
        return mine.length ? <Breakdown key={m.id} name={m.name} slips={mine} /> : null;
      })}
      <Dividends />
      <Joint />
      <Card title="Payslips">
        {v.payslips.length ? [...v.payslips].sort((a, b) => b.date.localeCompare(a.date)).map((p, _i, all) => {
          const isLatest = all.find((x) => x.memberId === p.memberId)?.id === p.id; // warn once per person, not on every slip
          const warn = isLatest ? taxCheck(p).problems.join(' ') : '';
          return (
            <div className="li" key={p.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(p)}>
              <div><div className="t">{name(p.memberId)} · {p.employer || 'Employer'}</div>
                <div className="s">{fmtDate(p.date)} · gross {fmt(p.gross)} · tax {fmt(p.tax)} · NI {fmt(p.ni)} · pension {fmt(p.pension)}</div>
                {warn && <div className="s warn">{warn}</div>}</div>
              <div className="r">{fmt(p.net)}<div className="s">take-home</div></div>
            </div>
          );
        }) : <Empty title="No payslips">Upload a payslip PDF or type the figures in. Parsing runs on this device.</Empty>}
      </Card>
      {edit && <PayslipEditor p={edit} isNew={!v.payslips.some((x) => x.id === edit.id)} onClose={() => setEdit(null)}
        onSave={(p) => { update((x) => ({ ...x, payslips: x.payslips.some((y) => y.id === p.id) ? x.payslips.map((y) => (y.id === p.id ? p : y)) : [...x.payslips, p] })); setEdit(null); }}
        onDelete={() => { update((x) => ({ ...x, payslips: x.payslips.filter((y) => y.id !== edit.id) })); setEdit(null); }} />}
    </>
  );
}

function PayslipEditor({ p, isNew, onSave, onDelete, onClose }: { p: Payslip; isNew: boolean; onSave: (p: Payslip) => void; onDelete: () => void; onClose: () => void }) {
  const { vault: v } = useStore();
  const [d, setD] = useState({ memberId: p.memberId, date: p.date, employer: p.employer });
  const [n, setN] = useState<Record<string, string>>(Object.fromEntries(F.map((f) => [f.k, p[f.k] ? ((p[f.k] as number) / 100).toFixed(2) : ''])));
  const [extra, setExtra] = useState({ basic: p.basic ? (p.basic / 100).toFixed(2) : '', overtime: p.overtime ? (p.overtime / 100).toFixed(2) : '', bonus: p.bonus ? (p.bonus / 100).toFixed(2) : '', taxCode: p.taxCode ?? '' });
  const [msg, setMsg] = useState('');
  const val = (k: string) => parseMoney(n[k] ?? '') ?? 0;
  const parts = { gross: val('gross'), tax: val('tax'), ni: val('ni'), pension: val('pension'), studentLoan: val('studentLoan'), otherDeductions: val('otherDeductions') };
  const diff = val('net') - impliedNet(parts);

  const onFile = async (file: File) => {
    setMsg('Reading…');
    try {
      let lines: string[];
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const { pdfToLines } = await import('../lib/pdf');
        lines = await pdfToLines(await file.arrayBuffer());
        if (!lines.length) { setMsg('No text found — this looks like a scan. Type the figures in instead.'); return; }
      } else lines = (await file.text()).split(/\r?\n/);
      const g = parsePayslipLines(lines);
      setN((x) => { const o = { ...x }; for (const f of F) if (g[f.k] !== undefined) o[f.k] = ((g[f.k] as number) / 100).toFixed(2); return o; });
      setD((x) => ({ ...x, date: g.date ?? x.date, employer: g.employer ?? x.employer }));
      setExtra((x) => ({ basic: g.basic ? (g.basic / 100).toFixed(2) : x.basic, overtime: g.overtime ? (g.overtime / 100).toFixed(2) : x.overtime, bonus: g.bonus ? (g.bonus / 100).toFixed(2) : x.bonus, taxCode: g.taxCode ?? x.taxCode }));
      setMsg(`Found ${g.found.length} fields — please check them against your payslip.`);
    } catch { setMsg('Could not read that file. Type the figures in instead.'); }
  };
  const net = val('net') || impliedNet(parts);
  return (
    <Modal title={isNew ? 'Add payslip' : 'Edit payslip'} onClose={onClose}>
      <label className="drop" style={{ cursor: 'pointer' }}>Drop or <b>choose a payslip PDF</b> to fill this in
        <input type="file" accept=".pdf,.txt" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} /></label>
      {msg && <div className="note">{msg}</div>}
      <div className="fgrid">
        <Field label="Whose payslip"><select value={d.memberId} onChange={(e) => setD({ ...d, memberId: e.target.value })}>{v.household.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Pay date"><input type="date" value={d.date} onChange={(e) => setD({ ...d, date: e.target.value })} /></Field>
        <Field label="Employer"><input value={d.employer} onChange={(e) => setD({ ...d, employer: e.target.value })} /></Field>
        <span />
        {F.map((f) => <Field key={f.k} label={`${f.l} (£)`}><input inputMode="decimal" value={n[f.k]} onChange={(e) => setN({ ...n, [f.k]: e.target.value })} /></Field>)}
      </div>
      <div className="eyebrow">Optional — earnings and tax code</div>
      <div className="fgrid">
        <Field label="Basic pay (£)"><input inputMode="decimal" value={extra.basic} onChange={(e) => setExtra({ ...extra, basic: e.target.value })} /></Field>
        <Field label="Overtime (£)"><input inputMode="decimal" value={extra.overtime} onChange={(e) => setExtra({ ...extra, overtime: e.target.value })} /></Field>
        <Field label="Bonus / commission (£)"><input inputMode="decimal" value={extra.bonus} onChange={(e) => setExtra({ ...extra, bonus: e.target.value })} /></Field>
        <Field label="Tax code"><input value={extra.taxCode} placeholder="e.g. 1257L" onChange={(e) => setExtra({ ...extra, taxCode: e.target.value.toUpperCase() })} /></Field>
      </div>
      {val('net') > 0 && val('gross') > 0 && Math.abs(diff) > 100 && <div className="note warn">Gross minus deductions is {fmt(impliedNet(parts))}, {fmt(Math.abs(diff))} {diff > 0 ? 'less' : 'more'} than net pay. Add the missing deduction under “other” if there is one.</div>}
      <div className="row between">{!isNew ? <button className="btn danger" onClick={onDelete}>Delete</button> : <span />}
        <button className="btn primary" disabled={!net} onClick={() => onSave({ id: p.id, ...d, ...parts, net, basic: parseMoney(extra.basic) || undefined, overtime: parseMoney(extra.overtime) || undefined, bonus: parseMoney(extra.bonus) || undefined, taxCode: extra.taxCode.trim() || undefined })}>Save</button></div>
    </Modal>
  );
}

const PARTS: { k: 'net' | 'tax' | 'ni' | 'pension' | 'studentLoan' | 'otherDeductions'; l: string; c: string }[] = [
  { k: 'net', l: 'Take-home', c: 'var(--good)' }, { k: 'tax', l: 'Income tax', c: 'var(--bad)' }, { k: 'ni', l: 'National Insurance', c: 'var(--warn)' },
  { k: 'pension', l: 'Pension', c: 'var(--info)' }, { k: 'studentLoan', l: 'Student loan', c: 'var(--accent)' }, { k: 'otherDeductions', l: 'Other', c: 'var(--dim)' },
];

/** Where each person's gross pay goes, from their latest payslip, with averages. */
function Breakdown({ name, slips }: { name: string; slips: Payslip[] }) {
  const p = slips[0];
  const recent = slips.slice(0, 6);
  const avg = (f: (x: Payslip) => number) => Math.round(recent.reduce((s, x) => s + f(x), 0) / recent.length);
  const gross = p.gross || 1;
  const deductions = p.tax + p.ni + p.pension + p.studentLoan + p.otherDeductions;
  return (
    <Card title={`${name}’s pay`} sub={`${fmtDate(p.date)} · ${p.employer || 'employer'}`}>
      <div style={{ display: 'flex', height: 14, marginBottom: 16, gap: 2 }} role="img" aria-label="How gross pay is split">
        {PARTS.map((x) => (p[x.k] > 0 ? <i key={x.k} title={`${x.l} ${fmt(p[x.k])}`} style={{ flex: p[x.k] / gross, background: x.c, display: 'block' }} /> : null))}
      </div>
      <table className="table">
        <thead><tr><th>Where it goes</th><th className="num">This slip</th><th className="num">% of gross</th><th className="num hide-s">Avg ({recent.length})</th></tr></thead>
        <tbody>
          <tr><td>Gross pay</td><td className="num">{fmt(p.gross)}</td><td className="num">100%</td><td className="num hide-s">{fmt(avg((x) => x.gross))}</td></tr>
          {PARTS.filter((x) => p[x.k] > 0 || x.k === 'net').map((x) => (
            <tr key={x.k}><td><i className="dot" style={{ background: x.c }} /> {x.l}</td><td className="num">{fmt(p[x.k])}</td>
              <td className="num">{((p[x.k] / gross) * 100).toFixed(1)}%</td><td className="num hide-s">{fmt(avg((s) => s[x.k]))}</td></tr>
          ))}
        </tbody>
      </table>
      <Earnings slips={slips} />
      {taxCheck(p).problems.map((m, i) => <p key={i} className="note warn" style={{ marginTop: 10 }}>⚑ {m}</p>)}
      {!p.taxCode && <p className="note" style={{ marginTop: 10 }}>No tax code on this payslip — add it (Edit payslip) and Wakeful will check it.</p>}
      <p className="note" style={{ marginTop: 12 }}>
        {fmt0(deductions)} ({((deductions / gross) * 100).toFixed(0)}%) is deducted before you see it — {((((p.tax + p.ni) / gross) * 100)).toFixed(0)}% is tax and NI.
        On this pay, about {fmt0(p.gross * 12)} a year gross and {fmt0(p.net * 12)} a year take-home.
      </p>
    </Card>
  );
}

function Earnings({ slips }: { slips: Payslip[] }) {
  const [mode, setMode] = useState<'six' | 'year'>('six');
  const [ys, ye] = taxYearOf(slips[0].date);
  const set = mode === 'six' ? slips.slice(0, 6) : slips.filter((x) => x.date >= ys && x.date <= ye);
  const e = earningsSummary(set);
  const any = e.overtime > 0 || e.bonus > 0;
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row between"><div className="eyebrow">Earnings to date</div>
        <div className="seg"><button className={mode === 'six' ? 'on' : ''} onClick={() => setMode('six')}>Last 6</button><button className={mode === 'year' ? 'on' : ''} onClick={() => setMode('year')}>Tax year</button></div></div>
      <table className="table" style={{ marginTop: 8 }}>
        <tbody>
          <tr><td>Payslips counted</td><td className="num">{e.slips}</td></tr>
          <tr><td>Gross to date</td><td className="num">{fmt(e.gross)}</td></tr>
          <tr><td>Basic pay</td><td className="num">{fmt(e.basic)}</td></tr>
          <tr><td>Overtime to date</td><td className="num">{fmt(e.overtime)}{e.gross ? ` · ${(e.overtimeShare * 100).toFixed(0)}%` : ''}</td></tr>
          {e.bonus > 0 && <tr><td>Bonus / commission</td><td className="num">{fmt(e.bonus)}</td></tr>}
          <tr><td>Average overtime per payslip</td><td className="num">{fmt(e.avgOvertime)}</td></tr>
        </tbody>
      </table>
      {!any && <p className="note" style={{ marginTop: 6 }}>No overtime recorded. If you do overtime, drop a payslip PDF (it’s read automatically) or add it when you edit a payslip.</p>}
      {any && e.swing > 0 && <p className="note" style={{ marginTop: 6 }}>Take-home varies by {fmt0(e.swing)} between payslips. Budget your fixed costs from basic pay.</p>}
    </div>
  );
}

function Dividends() {
  const { vault: v, update } = useStore();
  const list = dividendSummaries(v);
  const un = unassignedDividends(v);
  if (!list.length && !un) return null;
  return (
    <>
      {list.map((d) => (
        <Card key={d.memberId} title={`${d.name}’s dividends`} sub={`tax year ${d.taxYear}`}>
          <div className="grid g3">
            <div className="stat"><div className="label">Received so far</div><div className="val">{fmt0(d.ytd)}</div><div className="note">projected {fmt0(d.projected)} for the year</div></div>
            <div className="stat"><div className="label">Estimated tax</div><div className="val warn">{fmt0(d.estTax)}</div><div className="note">{d.estTax > 0 ? `${d.band} rate · set aside ${d.setAsidePct}%` : 'within allowances'}</div></div>
            <div className="stat"><div className="label">After dividend tax</div><div className="val pos">{fmt0(d.net)}</div><div className="note">per year, projected</div></div>
          </div>
          <p className="note" style={{ marginTop: 14 }}>
            {d.deadline.label}: {d.deadline.days >= 0 ? `${d.deadline.days} days away` : 'due now'}. Dividend tax isn’t taken by your employer — keep the set-aside amount in a separate pot.
            Based on 2026/27 rates (£500 allowance; 10.75% / 35.75% / 39.35%) and {d.other ? `salary of about ${fmt0(d.other)} a year` : 'no salary on file (add a payslip for a better estimate)'}.
          </p>
        </Card>
      ))}
      {un > 0 && <Card title="Dividends to assign"><p className="note">{fmt0(un)} of dividends went into a joint account. Open Spending → Transactions, click the dividend and choose whose it is.</p></Card>}
      <p className="note">This estimates <b>personal</b> dividend tax only. Corporation tax, director’s loan accounts and the company’s own books belong in accounting software such as Xero or Sage; an accountant should confirm the figures.</p>
    </>
  );
}

function Joint() {
  const { vault: v, month } = useStore();
  const [basis, setBasis] = useState<'income' | 'equal'>('income');
  const m = month || latestMonth(v.txns) || '';
  const ja = m ? jointAnalysis(v, m, basis) : null;
  if (!ja) return null;
  const ps = personalSpend(v, m);
  return (
    <Card title="Joint account" sub={ja.accounts.join(', ')} action={<div className="seg"><button className={basis === 'income' ? 'on' : ''} onClick={() => setBasis('income')}>By income</button><button className={basis === 'equal' ? 'on' : ''} onClick={() => setBasis('equal')}>Equal</button></div>}>
      <p style={{ marginBottom: 12 }}>Joint costs this month: <b>{fmt0(ja.outgoings)}</b></p>
      <table className="table">
        <thead><tr><th>Person</th><th className="num">Paid in</th><th className="num">Fair share</th><th className="num">Difference</th><th className="num hide-s">Own spending</th></tr></thead>
        <tbody>{ja.rows.map((r) => (
          <tr key={r.memberId}><td>{r.name}</td><td className="num">{fmt0(r.paidIn)}</td><td className="num">{fmt0(r.fair)} <span className="mute">({Math.round(r.share * 100)}%)</span></td>
            <td className={`num ${r.diff < -5000 ? 'warn' : r.diff > 5000 ? 'pos' : ''}`}>{r.diff >= 0 ? '+' : '−'}{fmt0(Math.abs(r.diff))}</td>
            <td className="num hide-s">{fmt0(ps.find((x) => x.memberId === r.memberId)?.spend ?? 0)}</td></tr>))}</tbody>
      </table>
      <p className="note" style={{ marginTop: 10 }}>Contributions are matched from transfers out of each person’s own account and salary paid straight in. {ja.unattributed > 0 ? `${fmt0(ja.unattributed)} of other money in couldn’t be matched to a person. ` : ''}“By income” shares costs in proportion to take-home pay; “Equal” splits them evenly. Neither is right or wrong — it’s a fairness conversation, not a rule.</p>
    </Card>
  );
}
