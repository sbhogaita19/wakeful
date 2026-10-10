import { useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Field, Head, Modal } from '../components/ui';
import { Icon } from '../components/Icon';
import { Line } from '../components/Charts';
import { homeEquity, latestBalance, netWorth, netWorthHistory, valueNow } from '../lib/analytics';
import { fmt, fmt0, parseMoney, uid } from '../lib/money';
import { fmtDate, todayISO } from '../lib/dates';
import { KIND_LABEL, children, childAccountIds, isLiability, type Account, type AccountKind, type Bank } from '../types';

const KINDS = Object.keys(KIND_LABEL) as AccountKind[];

function payoff(balance: number, apr: number, pay: number): string {
  const r = apr / 1200;
  if (pay <= balance * r) return 'payment does not cover the interest';
  const n = r === 0 ? balance / pay : -Math.log(1 - (r * balance) / pay) / Math.log(1 + r);
  const total = pay * n - balance;
  return `${Math.ceil(n)} months · ${fmt0(Math.round(total))} interest`;
}

export function Wealth() {
  const { vault: v, update } = useStore();
  const [edit, setEdit] = useState<Account | null>(null);
  const kidIds = childAccountIds(v);
  const nw = netWorth(v.accounts, kidIds);
  const equity = homeEquity(v.accounts);
  const hist = netWorthHistory(v.accounts, kidIds);
  const owner = (id: string) => (id === 'joint' ? 'Joint' : v.household.members.find((m) => m.id === id)?.name ?? '');
  const assets = v.accounts.filter((a) => !isLiability(a.kind) && !kidIds.has(a.id));
  const debts = v.accounts.filter((a) => isLiability(a.kind));
  const blank = (): Account => ({ id: uid(), name: '', bank: 'other', kind: 'current', ownerId: 'joint', balances: [] });

  const row = (a: Account) => (
    <div className="li" key={a.id} onClick={() => setEdit(a)} style={{ cursor: 'pointer' }}>
      <div><div className="t">{a.name}</div>
        <div className="s">{KIND_LABEL[a.kind]} · {owner(a.ownerId)}{a.rate ? ` · ${a.rate}%` : ''}{a.fixedUntil ? ` · fixed to ${fmtDate(a.fixedUntil)}` : ''}</div>
        {isLiability(a.kind) && a.rate && a.monthly && latestBalance(a) > 0 && a.kind !== 'mortgage' && <div className="s warn">Clears in {payoff(latestBalance(a), a.rate, a.monthly)}</div>}
      </div>
      <div className="r">{fmt(valueNow(a))}{a.kind === 'property' && a.growthPct ? <div className="s">estimate</div> : null}</div>
    </div>
  );

  return (
    <>
      <Head title="Wealth" sub="What you own and what you owe, together.">
        <button className="btn primary" onClick={() => setEdit(blank())}><Icon n="plus" />Add account</button>
      </Head>
      <div className="grid g3">
        <Card><div className="stat"><div className="label">Net worth</div><div className={`val ${nw.net < 0 ? 'neg' : ''}`}>{fmt0(nw.net)}</div></div></Card>
        <Card><div className="stat"><div className="label">Assets</div><div className="val pos">{fmt0(nw.assets)}</div></div></Card>
        <Card><div className="stat"><div className="label">Owed</div><div className="val">{fmt0(nw.debts)}</div></div></Card>
      </div>
      {children(v).map((c) => {
        const mine = v.accounts.filter((a) => a.ownerId === c.id);
        const total = mine.reduce((s, a) => s + valueNow(a), 0);
        return (
          <Card key={c.id} title={`${c.name}’s savings`} sub="their money — not counted in household net worth" action={<span className="gold mono">{fmt0(total)}</span>}>
            {mine.length ? mine.map(row) : <Empty title="No accounts yet">Add a savings account or Junior ISA with {c.name} as the owner.</Empty>}
            <p className="note" style={{ marginTop: 10 }}>Tip: interest on money a parent has given a child can be taxed on that parent above £100 a year (per parent). Junior ISAs are tax-free.</p>
          </Card>
        );
      })}
      {equity && (
        <div className="grid g3">
          <Card><div className="stat"><div className="label">Home value</div><div className="val">{fmt0(equity.value)}</div></div></Card>
          <Card><div className="stat"><div className="label">Home equity</div><div className="val pos">{fmt0(equity.equity)}</div><div className="note">value minus mortgage</div></div></Card>
          <Card><div className="stat"><div className="label">Loan-to-value</div><div className="val">{equity.ltv.toFixed(0)}%</div><div className="note">lower is cheaper to borrow</div></div></Card>
        </div>
      )}
      <Card title="Trend"><Line points={hist} /></Card>
      <div className="grid g2">
        <Card title="Assets">{assets.length ? assets.map(row) : <Empty title="No accounts yet">Add current, savings, ISA, pension, property.</Empty>}</Card>
        <Card title="Debts & owed">{debts.length ? debts.map(row) : <Empty title="Debt-free">Add a mortgage, card, loan or money you owe.</Empty>}</Card>
      </div>
      {edit && <AccountEditor acc={edit} isNew={!v.accounts.some((a) => a.id === edit.id)} onClose={() => setEdit(null)}
        onSave={(a) => { update((x) => ({ ...x, accounts: x.accounts.some((y) => y.id === a.id) ? x.accounts.map((y) => (y.id === a.id ? a : y)) : [...x.accounts, a] })); setEdit(null); }}
        onDelete={() => { update((x) => ({ ...x, accounts: x.accounts.filter((y) => y.id !== edit.id), txns: x.txns.filter((t) => t.accountId !== edit.id) })); setEdit(null); }} />}
    </>
  );
}

function AccountEditor({ acc, isNew, onSave, onDelete, onClose }: { acc: Account; isNew: boolean; onSave: (a: Account) => void; onDelete: () => void; onClose: () => void }) {
  const { vault: v } = useStore();
  const [a, setA] = useState(acc);
  const [bal, setBal] = useState(acc.balances.length ? (latestBalance(acc) / 100).toFixed(2) : '');
  const [lim, setLim] = useState(acc.limit ? (acc.limit / 100).toFixed(2) : '');
  const [mon, setMon] = useState(acc.monthly ? (acc.monthly / 100).toFixed(2) : '');
  const set = (p: Partial<Account>) => setA((x) => ({ ...x, ...p }));
  const liab = isLiability(a.kind);
  const save = () => {
    const b = parseMoney(bal);
    const balances = b !== null && (b !== latestBalance(acc) || !acc.balances.length) ? [...a.balances.filter((x) => x.date !== todayISO()), { date: todayISO(), pence: Math.abs(b) }] : a.balances;
    onSave({ ...a, balances, limit: parseMoney(lim) ?? undefined, monthly: parseMoney(mon) ?? undefined });
  };
  return (
    <Modal title={isNew ? 'Add account' : 'Edit account'} onClose={onClose}>
      <div className="fgrid">
        <Field label="Name"><input value={a.name} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label="Type"><select value={a.kind} onChange={(e) => set({ kind: e.target.value as AccountKind })}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></Field>
        <Field label="Provider"><select value={a.bank} onChange={(e) => set({ bank: e.target.value as Bank })}><option value="monzo">Monzo</option><option value="starling">Starling</option><option value="nationwide">Nationwide</option><option value="other">Other</option></select></Field>
        <Field label="Owner"><select value={a.ownerId} onChange={(e) => set({ ownerId: e.target.value })}><option value="joint">Joint</option>{v.household.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label={liab ? 'Amount owed today (£)' : a.kind === 'property' ? 'Home value today (£)' : 'Balance today (£)'}><input inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} /></Field>
        {(liab || ['savings', 'isa'].includes(a.kind)) && <Field label={liab ? 'APR / interest rate (%)' : 'Interest rate (%)'}><input inputMode="decimal" value={a.rate ?? ''} onChange={(e) => set({ rate: e.target.value ? +e.target.value : undefined })} /></Field>}
        {a.kind === 'credit-card' && <Field label="Credit limit (£)"><input inputMode="decimal" value={lim} onChange={(e) => setLim(e.target.value)} /></Field>}
        {liab && <Field label="Monthly payment (£)"><input inputMode="decimal" value={mon} onChange={(e) => setMon(e.target.value)} /></Field>}
        {a.kind === 'property' && <Field label="Assumed yearly growth % (optional)"><input inputMode="decimal" placeholder="e.g. 2" value={a.growthPct ?? ''} onChange={(e) => set({ growthPct: e.target.value ? +e.target.value : undefined })} /></Field>}
        {a.kind === 'mortgage' && <Field label="Fixed rate ends"><input type="date" value={a.fixedUntil ?? ''} onChange={(e) => set({ fixedUntil: e.target.value || undefined })} /></Field>}
      </div>
      <div className="row between">{!isNew ? <button className="btn danger" onClick={onDelete}>Delete</button> : <span />}<button className="btn primary" disabled={!a.name} onClick={save}>Save</button></div>
    </Modal>
  );
}
