import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Head, Seg } from '../components/ui';
import { buildCuts } from '../lib/cuts';
import { buildInsights, totalSavingPotential, type Area } from '../lib/insights';
import { fmt0 } from '../lib/money';

const AREAS: { a: Area | 'all'; l: string }[] = [
  { a: 'all', l: 'All' }, { a: 'bills', l: 'Bills' }, { a: 'spending', l: 'Spending' }, { a: 'debt', l: 'Debt' },
  { a: 'saving', l: 'Saving' }, { a: 'income', l: 'Income' }, { a: 'giving', l: 'Giving' }, { a: 'planet', l: 'Planet' },
];

function Cuts() {
  const { vault, update } = useStore();
  const cuts = useMemo(() => buildCuts(vault), [vault]);
  const d = vault.decisions ?? {};
  const set = (id: string, v: 'keep' | 'cancel') => update((x) => ({ ...x, decisions: { ...x.decisions, [id]: x.decisions?.[id] === v ? undefined : v } as typeof x.decisions }));
  const planned = cuts.filter((c) => d[c.id] === 'cancel').reduce((s, c) => s + c.yearly, 0);
  const open = cuts.filter((c) => !d[c.id]).reduce((s, c) => s + c.yearly, 0);
  return (
    <>
      <div className="grid g3">
        <Card><div className="stat"><div className="label">You’ve decided to free up</div><div className="val pos">{fmt0(planned)}<small className="mute" style={{ fontSize: 14, fontWeight: 450 }}> /year</small></div><div className="note">{fmt0(Math.round(planned / 12))} a month</div></div></Card>
        <Card><div className="stat"><div className="label">Still to decide</div><div className="val">{cuts.filter((c) => !d[c.id]).length}</div><div className="note">worth up to {fmt0(open)} a year</div></div></Card>
        <Card><div className="stat"><div className="label">Kept on purpose</div><div className="val">{cuts.filter((c) => d[c.id] === 'keep').length}</div><div className="note">Enough is also a choice.</div></div></Card>
      </div>
      <Card title="Could you let go of…" sub="your call — Wakeful only suggests">
        {cuts.length ? cuts.map((c) => (
          <div className="insight" key={c.id} style={{ opacity: d[c.id] === 'keep' ? .55 : 1 }}>
            <span className={`badge ${c.action === 'cancel' ? 'medium' : ''}`}>{c.action}</span>
            <div><h3 style={{ textDecoration: d[c.id] === 'cancel' ? 'line-through' : undefined }}>{c.title}</h3><p>{c.why}</p>
              <div className="row" style={{ marginTop: 10 }}>
                <button className={`chip ${d[c.id] === 'cancel' ? 'on' : ''}`} onClick={() => set(c.id, 'cancel')}>{d[c.id] === 'cancel' ? 'Decided: cancel' : 'Cancel / cut'}</button>
                <button className={`chip ${d[c.id] === 'keep' ? 'on' : ''}`} onClick={() => set(c.id, 'keep')}>{d[c.id] === 'keep' ? 'Decided: keep' : 'Keep'}</button>
              </div></div>
            <div className="save">{fmt0(c.yearly)}<small>per year</small></div>
          </div>
        )) : <Empty title="Nothing to let go of">Import statements to find recurring costs.</Empty>}
      </Card>
    </>
  );
}

export function Insights() {
  const { vault } = useStore();
  const [area, setArea] = useState<Area | 'all'>('all');
  const [mode, setMode] = useState<'flags' | 'cuts'>('flags');
  const all = useMemo(() => buildInsights(vault), [vault]);
  const list = all.filter((i) => area === 'all' || i.area === area);
  return (
    <>
      <Head title="Insights" sub="Where to look, ranked by what matters. Computed on this device." />
      <Seg value={mode} onChange={setMode} options={[{ v: 'flags', l: 'Where to look' }, { v: 'cuts', l: 'Could go' }]} />
      {mode === 'cuts' ? <Cuts /> : <>
      <div className="grid g3">
        <Card><div className="stat"><div className="label">Potential saving</div><div className="val pos">{fmt0(totalSavingPotential(all))}<small className="mute" style={{ fontSize: 14, fontWeight: 450 }}> /year</small></div><div className="note">Estimates — verify before acting.</div></div></Card>
        <Card><div className="stat"><div className="label">To act on</div><div className="val">{all.filter((i) => i.severity === 'high').length}</div></div></Card>
        <Card><div className="stat"><div className="label">To review</div><div className="val">{all.filter((i) => i.severity === 'medium').length}</div></div></Card>
      </div>
      <div className="row">{AREAS.map((a) => <button key={a.a} className={`chip ${area === a.a ? 'on' : ''}`} onClick={() => setArea(a.a)}>{a.l}</button>)}</div>
      <Card>
        {list.length ? list.map((i) => (
          <div className="insight" key={i.id}>
            <span className={`badge ${i.severity}`}>{i.severity === 'high' ? 'Act' : i.severity === 'medium' ? 'Review' : 'Notice'}</span>
            <div><h3>{i.title}</h3><p>{i.detail}</p></div>
            <div className="save">{i.yearly && i.yearly > 0 ? <>{fmt0(i.yearly)}<small>per year</small></> : null}</div>
          </div>
        )) : <Empty title="Nothing here">Add statements, bills and payslips to get insights.</Empty>}
      </Card>
      </>}
      <p className="note">Insights are general information from your own data, not financial advice. Benchmarks are bundled reference figures with an as-of date; check live prices before switching.</p>
    </>
  );
}
