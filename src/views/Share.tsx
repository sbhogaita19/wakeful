import { useState } from 'react';
import { useStore } from '../store';
import { Card, Head } from '../components/ui';
import { PRESETS, buildReport, type ReportOptions } from '../lib/report';
import { saveFile } from '../lib/saveFile';

const SECTIONS: { k: keyof ReportOptions; l: string; d: string }[] = [
  { k: 'overview', l: 'Overview', d: 'net worth, take-home, spending, 6-month trend' },
  { k: 'income', l: 'Income', d: 'payslip breakdown, overtime, tax code check, dividends' },
  { k: 'spending', l: 'Spending', d: 'by category vs 6-month average and budget' },
  { k: 'bills', l: 'Bills', d: 'household services, costs and renewal dates' },
  { k: 'wealth', l: 'Assets and debts', d: 'savings, ISAs, property, mortgage, cards, loans' },
  { k: 'pensions', l: 'Pensions', d: 'pot values and contribution rates' },
  { k: 'children', l: 'Children’s savings', d: 'shown separately from household net worth' },
  { k: 'insights', l: 'Where to look', d: 'the biggest saving opportunities' },
];

export function Share() {
  const { vault: v } = useStore();
  const [o, setO] = useState<ReportOptions>(PRESETS.partner.opts);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (p: Partial<ReportOptions>) => setO((x) => ({ ...x, ...p }));
  const empty = !v.txns.length && !v.accounts.length;

  const make = async () => {
    setBusy(true); setMsg('');
    try {
      const bytes = await buildReport(v, o);
      const name = `wakeful-summary-${new Date().toISOString().slice(0, 10)}.pdf`;
      const r = await saveFile(name, bytes, 'application/pdf', 'Household summary');
      setMsg(r === 'shared' ? 'Choose where to send or save it.' : 'Saved to your downloads.');
    } catch (e) {
      if (e instanceof Error && /cancel|dismiss/i.test(e.message)) setMsg('');
      else setMsg('Couldn’t create the PDF. Try again, or switch some sections off.');
    } finally { setBusy(false); }
  };

  return (
    <>
      <Head title="Share" sub="A PDF summary to send to your partner or a financial adviser. It’s built on this device — Wakeful never uploads it." />
      <Card title="Who is it for?">
        <div className="row">
          {(Object.entries(PRESETS) as [keyof typeof PRESETS, (typeof PRESETS)[keyof typeof PRESETS]][]).map(([k, p]) => (
            <button key={k} className="chip" onClick={() => setO(p.opts)}>{p.label}</button>
          ))}
        </div>
        <p className="note" style={{ marginTop: 10 }}>Presets just tick the boxes below — change anything you like.</p>
      </Card>

      <Card title="What to include">
        <div className="stack">
          {SECTIONS.map((s) => (
            <label key={s.k} className="row" style={{ gap: 10 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={!!o[s.k]} onChange={(e) => set({ [s.k]: e.target.checked } as Partial<ReportOptions>)} />
              <span><b>{s.l}</b> <span className="mute">— {s.d}</span></span>
            </label>
          ))}
          <label className="row" style={{ gap: 10, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={o.names} onChange={(e) => set({ names: e.target.checked })} />
            <span><b>Include names</b> <span className="mute">— people, employers, providers and account names. Off shows “Adult 1”, “Savings (joint)”, and so on.</span></span>
          </label>
        </div>
      </Card>

      <Card>
        <div className="row between">
          <p className="note" style={{ maxWidth: 520 }}>The PDF is <b>not encrypted</b>. It contains your real figures, so send it only to people you trust, over a channel you trust. It never contains passphrases, bank account numbers or individual transactions.</p>
          <button className="btn primary" disabled={busy || empty} onClick={make}>{busy ? 'Creating…' : 'Create PDF'}</button>
        </div>
        {empty && <p className="note" style={{ marginTop: 10 }}>Import some data first — there’s nothing to summarise yet.</p>}
        {msg && <p className="note" style={{ marginTop: 10 }}>{msg}</p>}
      </Card>
    </>
  );
}
