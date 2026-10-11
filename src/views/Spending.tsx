import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Field, Head, Modal, MonthNav, Seg } from '../components/ui';
import { MiniBar } from '../components/Charts';
import { avgSpendByCategory, latestMonth, months, spendByCategory } from '../lib/analytics';
import { learnRule, merchantKey } from '../lib/categorise';
import { fmt, fmt0, parseMoney } from '../lib/money';
import { NON_SPEND, allCategories, colorOf, type Txn } from '../types';
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
                <div className="row between"><span><i className="dot" style={{ background: colorOf(c) }} /> {c}</span>
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
          <div className="budget-list">
            {allCategories(v).filter((c) => !NON_SPEND.has(c)).map((c) => (
              <div className="budget-row" key={c}>
                <div className="budget-top">
                  <span className="budget-name"><i className="dot" style={{ background: colorOf(c) }} /> {c}</span>
                  <span className="budget-month mute">{fmt0(cats[c] ?? 0)} this month</span>
                  <input className="budget-amt" inputMode="decimal" placeholder="£0" aria-label={`${c} monthly budget`}
                    defaultValue={v.budget[c] ? (v.budget[c] / 100).toString() : ''}
                    onBlur={(e) => { const p = parseMoney(e.target.value); update((x) => ({ ...x, budget: { ...x.budget, [c]: p && p > 0 ? p : 0 } })); }} />
                </div>
                <input className="cat-note" placeholder="What it covers (optional)" aria-label={`${c} description`} defaultValue={v.categoryNotes?.[c] ?? ''}
                  onBlur={(e) => update((x) => ({ ...x, categoryNotes: { ...x.categoryNotes, [c]: e.target.value.trim() } }))} />
              </div>
            ))}
          </div>
          <AddCategory />
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
  const [editing, setEditing] = useState<Txn | null>(null);
  const name = (t: Txn) => v.aliases?.[merchantKey(t.desc)] ?? t.desc;
  const rows = v.txns.filter((t) => ym(t.date) === m && (!cat || t.category === cat) && (!review || t.review || t.category === 'Other') && (!q || `${name(t)} ${t.desc} ${t.note ?? ''}`.toLowerCase().includes(q.toLowerCase())))
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
        <select value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 200 }}><option value="">All categories</option>{allCategories(v).map((c) => <option key={c}>{c}</option>)}</select>
        <button className={`chip ${review ? 'on' : ''}`} onClick={() => setReview(!review)}>Needs review</button>
      </div>
      <table className="table"><thead><tr><th>Date</th><th>Description</th><th className="hide-s">Account</th><th className="cat-col">Category</th><th className="num">Amount</th></tr></thead>
        <tbody>{rows.map((t) => (
          <tr key={t.id}>
            <td className="mute" style={{ whiteSpace: 'nowrap' }}>{t.date.slice(5)}</td>
            <td><button className="btn sm ghost" style={{ padding: 0, color: 'var(--text)', textAlign: 'left' }} title="Edit name, category and note" onClick={() => setEditing(t)}>{name(t)}</button>
              {name(t) !== t.desc && <div className="note">{t.desc}</div>}
              {t.note && <div className="note">“{t.note}”</div>}
              {t.review && <span className="badge medium" style={{ marginLeft: 6 }}>check</span>}
              <select className="only-s" aria-label="Category" value={t.category} onChange={(e) => setCategory(t.id, t.desc, e.target.value)}>{allCategories(v).map((c) => <option key={c}>{c}</option>)}</select>
              {t.category === 'Giving' && t.pence < 0 && <label className="note" style={{ display: 'block' }}><input type="checkbox" style={{ width: 'auto', marginRight: 6 }} checked={!!t.giftAid} onChange={(e) => update((x) => ({ ...x, txns: x.txns.map((y) => (y.id === t.id ? { ...y, giftAid: e.target.checked } : y)) }))} />Gift Aid</label>}
            </td>
            <td className="hide-s mute">{acct(t.accountId)}</td>
            <td className="cat-col"><select value={t.category} onChange={(e) => setCategory(t.id, t.desc, e.target.value)}>{allCategories(v).map((c) => <option key={c}>{c}</option>)}</select></td>
            <td className={`num ${t.pence > 0 ? 'pos' : ''}`}>{fmt(t.pence)}</td>
          </tr>))}</tbody></table>
      {!rows.length && <Empty title="No transactions" />}
      {editing && <TxnEditor t={editing} onClose={() => setEditing(null)} />}
      <p className="note" style={{ marginTop: 10 }}>Click a description to rename it, change its category or add a note. Change a category once and Wakeful applies it to the same merchant from then on.</p>
    </Card>
  );
}

function AddCategory() {
  const { vault: v, update } = useStore();
  const [name, setName] = useState('');
  const taken = allCategories(v).some((c) => c.toLowerCase() === name.trim().toLowerCase());
  return (
    <div style={{ marginTop: 18 }}>
      <div className="eyebrow" style={{ marginBottom: 8 }}>Your own categories</div>
      <div className="row" style={{ marginBottom: 8 }}>
        {(v.customCategories ?? []).map((c) => (
          <span key={c} className="badge"><i className="dot" style={{ background: colorOf(c) }} />{c}
            <button className="btn sm ghost" aria-label={`Remove ${c}`} style={{ padding: '0 4px' }}
              onClick={() => update((x) => ({ ...x, customCategories: x.customCategories.filter((y) => y !== c),
                txns: x.txns.map((t) => (t.category === c ? { ...t, category: 'Other' } : t)), rules: x.rules.filter((r) => r.category !== c) }))}>×</button></span>
        ))}
      </div>
      <form className="row" onSubmit={(e) => { e.preventDefault(); const n = name.trim(); if (n && !taken) { update((x) => ({ ...x, customCategories: [...(x.customCategories ?? []), n] })); setName(''); } }}>
        <input placeholder="e.g. Home security, Utilities, Pets" value={name} onChange={(e) => setName(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn" disabled={!name.trim() || taken}>Add category</button>
      </form>
      <p className="note" style={{ marginTop: 8 }}>Then pick it on any transaction in Transactions — Wakeful applies it to that merchant from then on.</p>
    </div>
  );
}

function TxnEditor({ t, onClose }: { t: Txn; onClose: () => void }) {
  const { vault: v, update } = useStore();
  const key = merchantKey(t.desc);
  const [label, setLabel] = useState(v.aliases?.[key] ?? t.desc);
  const [cat, setCat] = useState(t.category);
  const [note, setNote] = useState(t.note ?? '');
  const [all, setAll] = useState(true);
  const [who, setWho] = useState(t.memberId ?? '');
  const count = v.txns.filter((x) => merchantKey(x.desc) === key).length;
  const save = () => {
    const n = label.trim();
    update((x) => {
      const aliases = { ...x.aliases };
      if (all) { if (!n || n === t.desc) delete aliases[key]; else aliases[key] = n; }
      const rules = all && cat !== t.category ? learnRule(x.rules, t.desc, cat) : x.rules;
      const txns = x.txns.map((y) => {
        if (y.id === t.id) return { ...y, category: cat, note: note.trim() || undefined, review: false, memberId: who || undefined };
        if (all && !y.transfer && merchantKey(y.desc) === key) return { ...y, category: cat };
        return y;
      });
      return { ...x, aliases, rules, txns };
    });
    onClose();
  };
  return (
    <Modal title="Edit transaction" onClose={onClose}>
      <div className="note">As on your statement: {t.desc}</div>
      <Field label="Name to show"><input value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
      <Field label="Category"><select value={cat} onChange={(e) => setCat(e.target.value)}>{allCategories(v).map((c) => <option key={c}>{c}</option>)}</select></Field>
      {v.categoryNotes?.[cat] && <div className="note">{cat}: {v.categoryNotes[cat]}</div>}
      {cat === 'Dividends' && <Field label="Whose dividend?"><select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Account owner</option>{v.household.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
      <Field label="Note (this transaction only)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. annual alarm service" /></Field>
      <label className="row note" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={all} onChange={(e) => setAll(e.target.checked)} />Apply name and category to all {count} from this merchant, including future imports</label>
      <div className="row between"><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn primary" onClick={save}>Save</button></div>
    </Modal>
  );
}
