import { useStore } from '../store';
import { Card, Empty, Field, Head } from '../components/ui';
import { MiniBar } from '../components/Charts';
import { householdIncome, latestMonth, spendByCategory, totalSpend } from '../lib/analytics';
import { energyCarbon } from '../lib/carbon';
import { fmt0, parseMoney } from '../lib/money';
import { ym } from '../lib/dates';

export function Values() {
  const { vault: v, update, month } = useStore();
  const m = month || latestMonth(v.txns) || '';
  const income = m ? householdIncome(v, m) : 0;
  const cats = m ? spendByCategory(v.txns, m) : {};
  const spend = m ? totalSpend(v.txns, m) : 0;
  const given = cats['Giving'] ?? 0;
  const target = Math.round((income * v.values.givingPct) / 100);
  const donations = v.txns.filter((t) => t.category === 'Giving' && t.pence < 0);
  const yearGiven = donations.reduce((s, t) => s - t.pence, 0);
  const giftAidable = donations.filter((t) => !t.giftAid).reduce((s, t) => s - t.pence, 0);
  const tagged = v.txns.filter((t) => t.tag && ym(t.date) === m);
  const carbon = energyCarbon(v);
  const setV = (p: Partial<typeof v.values>) => update((x) => ({ ...x, values: { ...x.values, ...p } }));

  return (
    <>
      <Head title="Values" sub="Money as a practice of awareness, generosity and enough." />
      <Card>
        <label className="row" style={{ gap: 10 }}><input type="checkbox" style={{ width: 'auto' }} checked={v.values.enabled} onChange={(e) => setV({ enabled: e.target.checked })} />
          Show values insights (giving, enough, mindful spending, planet)</label>
        <p className="note" style={{ marginTop: 8 }}>Inspired by Buddhist economics — right livelihood, non-harm, contentment, the Middle Way. You set every number; Wakeful never judges what you buy.</p>
      </Card>

      {v.values.enabled && (
        <>
          <div className="grid g2">
            <Card title="Dāna — giving">
              <div className="stat"><div className="val gold">{fmt0(given)}</div><div className="note">given this month · {fmt0(yearGiven)} across your imported history</div></div>
              <div className="row" style={{ margin: '14px 0 6px' }}>
                <Field label="Giving intention (% of take-home)"><input inputMode="decimal" style={{ maxWidth: 140 }} value={v.values.givingPct} onChange={(e) => setV({ givingPct: +e.target.value || 0 })} /></Field>
                {target > 0 && <span className="note" style={{ marginTop: 20 }}>= {fmt0(target)} a month</span>}
              </div>
              {target > 0 && <MiniBar pct={(given / target) * 100} />}
              <p className="note" style={{ marginTop: 12 }}>{giftAidable > 0 ? `${fmt0(giftAidable)} of donations aren’t marked Gift Aid. Tick the Gift Aid box on a donation in Spending → Transactions; charities can claim 25% on top, and higher-rate taxpayers can reclaim more on their tax return.` : 'Donations marked Gift Aid are tracked so you can reclaim what you’re owed.'}</p>
            </Card>
            <Card title="Santuṭṭhi — enough">
              <Field label="What monthly spending feels like enough? (£)"><input inputMode="decimal" style={{ maxWidth: 160 }} defaultValue={v.values.enough ? (v.values.enough / 100).toString() : ''} onBlur={(e) => setV({ enough: parseMoney(e.target.value) ?? 0 })} /></Field>
              {v.values.enough > 0 && <div style={{ marginTop: 14 }}><div className="row between"><span className="note">This month</span><b>{fmt0(spend)} / {fmt0(v.values.enough)}</b></div><MiniBar pct={(spend / v.values.enough) * 100} over={spend > v.values.enough * 1.1} /></div>}
              <p className="note" style={{ marginTop: 12 }}>Not a limit — a reference point. Notice when spending drifts above it, and ask what it brought.</p>
            </Card>
          </div>
          <div className="grid g2">
            <Card title="Mindful spending" sub="your own tags">
              {tagged.length ? tagged.map((t) => <div className="li" key={t.id}><div><div className="t">{t.desc}</div><div className="s">{t.date}</div></div><span className={`badge ${t.tag === 'regret' ? 'medium' : 'good'}`}>{t.tag}</span></div>)
                : <Empty title="Nothing tagged this month">Mark purchases as “mindful” or “regret” to see patterns.</Empty>}
              <TagPicker />
            </Card>
            <Card title="Non-harm — planet">
              {carbon ? <div className="stat"><div className="val">{(carbon.kg / 1000).toFixed(1)} t</div><div className="note">CO₂e a year from home energy · {carbon.basis}</div></div>
                : <Empty title="Add an energy bill with its unit rate">to estimate your household’s carbon from energy.</Empty>}
              <p className="note" style={{ marginTop: 12 }}>The biggest levers at home: a renewable tariff, heating one degree lower, and fixing draughts. Fewer, better, longer-lasting purchases help too.</p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function TagPicker() {
  const { vault: v, update, month } = useStore();
  const m = month || latestMonth(v.txns) || '';
  const recent = v.txns.filter((t) => ym(t.date) === m && t.pence < 0 && !t.transfer && !['Housing', 'Bills', 'Debt payments'].includes(t.category)).sort((a, b) => a.pence - b.pence).slice(0, 8);
  if (!recent.length) return null;
  return (
    <details style={{ marginTop: 10 }}><summary className="note" style={{ cursor: 'pointer' }}>Reflect on this month’s larger purchases</summary>
      {recent.map((t) => (
        <div className="li" key={t.id}><div><div className="t">{t.desc}</div><div className="s">{fmt0(-t.pence)} · {t.category}</div></div>
          <div className="row">{(['mindful', 'regret'] as const).map((tag) => <button key={tag} className={`chip ${t.tag === tag ? 'on' : ''}`} onClick={() => update((x) => ({ ...x, txns: x.txns.map((y) => (y.id === t.id ? { ...y, tag: y.tag === tag ? undefined : tag } : y)) }))}>{tag}</button>)}</div></div>))}
    </details>
  );
}
