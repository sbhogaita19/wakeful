import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Head } from '../components/ui';
import { buildInsights, totalSavingPotential, type Area } from '../lib/insights';
import { fmt0 } from '../lib/money';

const AREAS: { a: Area | 'all'; l: string }[] = [
  { a: 'all', l: 'All' }, { a: 'bills', l: 'Bills' }, { a: 'spending', l: 'Spending' }, { a: 'debt', l: 'Debt' },
  { a: 'saving', l: 'Saving' }, { a: 'income', l: 'Income' }, { a: 'giving', l: 'Giving' }, { a: 'planet', l: 'Planet' },
];

export function Insights() {
  const { vault } = useStore();
  const [area, setArea] = useState<Area | 'all'>('all');
  const all = useMemo(() => buildInsights(vault), [vault]);
  const list = all.filter((i) => area === 'all' || i.area === area);
  return (
    <>
      <Head title="Insights" sub="Where to look, ranked by what matters. Computed on this device." />
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
      <p className="note">Insights are general information from your own data, not financial advice. Benchmarks are bundled reference figures with an as-of date; check live prices before switching.</p>
    </>
  );
}
