import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Head, MonthNav, Seg } from '../components/ui';
import { MiniBar } from '../components/Charts';
import { avgSpendByCategory, latestMonth, months, spendByCategory } from '../lib/analytics';
import { learnRule, merchantKey } from '../lib/categorise';
import { fmt, fmt0, parseMoney } from '../lib/money';
import { CATEGORIES, CATEGORY_COLOR, NON_SPEND } from '../types';
import { ym } from '../lib/dates';

export function Spending() {
  const { vault: v, update, month, setMonth } = useStore();
  const [mode, setMode] = useState<'cats' | 'txns' | 'budget'>('cats');
  const m = month || latestMonth(v.txns) || '';
  const cats = useMemo(() => spendByCategory(v.txns, m), [v.txns, m]);
  const total = Object.values(cats).reduce((a, b) => a + b, 0);
  return (
    <>
      <Head title="Spending" sub={`${fmt0(total)} spent`}>
        <MonthNav month={m} months={months(v.txns)} onChange={setMonth} />
      </Head>
      <Seg value={mode} onChange={setMode} options={[{ v: 'cats', l: 'Categories' }, { v: 'txns', l: 'Transactions' }, { v: 'budget', l: 'Budget' }]} />
      {mode === 'cats' && (
        <Card>
          {Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([c, val]) => {
            const b = v.budget[c];
            return (
              <div key={c} style={{ marginBottom: 14 }}>
                <div className="row between"><span><i className="dot" style={{ background: CATEGORY_COLOR[c] }} /> {c}</span>
                  <span><b>{fmt0(val)}</b>{b ? <span className="mute"> / {fmt0(b)}</span> : null}</span></div>
                <MiniBar pct={b ? (val / b) * 100 : (val / Math.max(1, total)) * 100} over={!!b && val > b * 1.05} />
              </div>
            );
          })}
          {!total && <Empty title="No spending recorded" />}
        </Card>
      )}
      {mode === 'txns' && <Txns m={m} />}
      {mode === 'budget' && (
        <Card title="Monthly budget" action={
          <button className="btn sm" onClick={() => update((x) => {
            const avg = avgSpendByCategory(x.txns, latestMonth(x.txns) ?? m);
            return { ...x, budget: Object.fromEntries(Object.entries(avg).map(([c, a]) => [c, Math.round((a * 0.97) / 500) * 500])) };
          })}>Suggest from my history</button>}>
          <table className="table"><thead><tr><th>Category</th><th className="num">Budget</th><th className="num hide-s">This month</th></tr></thead>
            <tbody>{CATEGORIES.filter((c) => !NON_SPEND.has(c)).map((c) => (
              <tr key={c}><td><i className="dot" style={{ background: CATEGORY_COLOR[c] }} /> {c}</td>
                <td className="num" style={{ width: 130 }}><input inputMode="decimal" placeholder="£0" defaultValue={v.budget[c] ? (v.budget[c] / 100).toString() : ''}
                  onBlur={(e) => { const p = parseMoney(e.target.value); update((x) => ({ ...x, budget: { ...x.budget, [c]: p && p > 0 ? p : 0 } })); }} style={{ textAlign: 'right' }} /></td>
                <td className="num hide-s mute">{fmt0(cats[c] ?? 0)}</td></tr>))}</tbody></table>
          <p className="note" style={{ marginTop: 12 }}>The “suggest” button sets each budget just under your recent average — a gentle nudge, not a squeeze.</p>
        </Card>
      )}
    </>
  );
}

function Txns({ m }: { m: string }) {
  const { vault: v, update } = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [review, setReview] = useState(false);
  const rows = v.txns.filter((t) => ym(t.date) === m && (!cat || t.category === cat) && (!review || t.review || t.category === 'Other') && (!q || t.desc.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 300);
  const acct = (id: string) => v.accounts.find((a) => a.id === id)?.name ?? '';
  const setCategory = (id: string, desc: string, c: string) => update((x) => ({
    ...x, rules: learnRule(x.rules, desc, c),
    txns: x.txns.map((t) => (t.id === id || (!t.transfer && merchantKey(t.desc) === merchantKey(desc)) ? { ...t, category: c, review: t.id === id ? false : t.review } : t)),
  }));
  return (
    <Card>
      <div className="row" style={{ marginBottom: 12 }}>
        <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 200 }}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
        <button className={`chip ${review ? 'on' : ''}`} onClick={() => setReview(!review)}>Needs review</button>
      </div>
      <table className="table"><thead><tr><th>Date</th><th>Description</th><th className="hide-s">Account</th><th>Category</th><th className="num">Amount</th></tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id}>
            <td className="mute" style={{ whiteSpace: 'nowrap' }}>{t.date.slice(5)}</td>
            <td>{t.desc}{t.review && <span className="badge medium" style={{ marginLeft: 6 }}>check</span>}
              {t.category === 'Giving' && t.pence < 0 && <label className="note" style={{ display: 'block' }}><input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={!!t.giftAid} onChange={(e) => update((x) => ({ ...x, txns: x.txns.map((y) => (y.id === t.id ? { ...y, giftAid: e.target.checked } : y)) }))} />Gift Aid</label>}
            </td>
            <td className="hide-s mute">{acct(t.accountId)}</td>
            <td><select value={t.category} onChange={(e) => setCategory(t.id, t.desc, e.target.value)}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></td>
            <td className={`num ${t.pence > 0 ? 'pos' : ''}`}>{fmt(t.pence)}</td>
          </tr>))}</tbody></table>
      {!rows.length && <Empty title="No transactions" />}
      <p className="note" style={{ marginTop: 10 }}>Change a category once and Wakeful applies it to the same merchant from then on.</p>
    </Card>
  );
}
