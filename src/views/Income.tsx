import { useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Field, Head, Modal } from '../components/ui';
import { Icon } from '../components/Icon';
import { fmt, fmt0, parseMoney, uid } from '../lib/money';
import { fmtDate, todayISO } from '../lib/dates';
import { impliedNet, parsePayslipLines, takeHome, taxSanity } from '../lib/payslip';
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
      <Card title="Payslips">
        {v.payslips.length ? [...v.payslips].sort((a, b) => b.date.localeCompare(a.date)).map((p) => {
          const warn = taxSanity(p);
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
      {val('net') > 0 && val('gross') > 0 && Math.abs(diff) > 100 && <div className="note warn">Gross minus deductions is {fmt(impliedNet(parts))}, {fmt(Math.abs(diff))} {diff > 0 ? 'less' : 'more'} than net pay. Add the missing deduction under “other” if there is one.</div>}
      <div className="row between">{!isNew ? <button className="btn danger" onClick={onDelete}>Delete</button> : <span />}
        <button className="btn primary" disabled={!net} onClick={() => onSave({ id: p.id, ...d, ...parts, net })}>Save</button></div>
    </Modal>
  );
}
