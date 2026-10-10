import { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Head } from '../components/ui';
import { importCsv, type ParsedRow } from '../lib/bankCsv';
import { parseStatementLines } from '../lib/statement';
import { categorise, dedupe, markTransfers } from '../lib/categorise';
import { fmt, uid } from '../lib/money';
import type { Account, Bank, Txn } from '../types';
import type { ViewProps } from '../nav';

interface Parsed { name: string; bank: Bank; rows: (ParsedRow & { review?: boolean })[]; via: 'csv' | 'pdf'; skipped: number; }

export function Import({ go }: ViewProps) {
  const { vault: v, update } = useStore();
  const [files, setFiles] = useState<Parsed[]>([]);
  const [target, setTarget] = useState('new');
  const [newName, setNewName] = useState('');
  const [owner, setOwner] = useState('joint');
  const [msg, setMsg] = useState('');
  const [hot, setHot] = useState(false);
  const [done, setDone] = useState('');

  const read = async (list: FileList | File[]) => {
    setMsg(''); setDone('');
    const out: Parsed[] = [];
    for (const f of Array.from(list)) {
      try {
        if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
          const { pdfToLines } = await import('../lib/pdf');
          const lines = await pdfToLines(await f.arrayBuffer());
          if (!lines.length) { setMsg(`${f.name}: no text found (a scan?). Export a CSV from your banking app instead.`); continue; }
          const rows = parseStatementLines(lines);
          if (!rows.length) { setMsg(`${f.name}: couldn’t find transactions. Try the CSV export.`); continue; }
          out.push({ name: f.name, bank: 'other', rows, via: 'pdf', skipped: 0 });
        } else {
          const r = importCsv(await f.text());
          if (!r) { setMsg(`${f.name}: not a recognised statement CSV.`); continue; }
          out.push({ name: f.name, bank: r.bank, rows: r.rows, via: 'csv', skipped: r.skipped });
        }
      } catch { setMsg(`${f.name}: couldn’t be read.`); }
    }
    setFiles((x) => [...x, ...out]);
    const first = out[0];
    if (first) {
      const match = v.accounts.find((a) => a.bank === first.bank && ['current', 'savings', 'credit-card'].includes(a.kind));
      setTarget(match?.id ?? 'new');
      setNewName(first.bank === 'other' ? '' : first.bank[0].toUpperCase() + first.bank.slice(1));
    }
  };

  const rows = files.flatMap((f) => f.rows.map((r) => ({ ...r, via: f.via })));
  const accId = target === 'new' ? 'NEW' : target;
  const existing = v.txns.filter((t) => t.accountId === target);
  const { fresh, dupes } = dedupe(existing, rows.map((r) => ({ ...r, accountId: accId })));
  const reviewCount = fresh.filter((r) => r.review).length;

  const commit = () => {
    update((x) => {
      let accounts = x.accounts;
      let id = target;
      if (target === 'new') {
        const a: Account = { id: uid(), name: newName || 'New account', bank: files[0]?.bank ?? 'other', kind: 'current', ownerId: owner, balances: [] };
        accounts = [...accounts, a]; id = a.id;
      }
      const incoming: Txn[] = fresh.map((r) => ({
        id: uid(), accountId: id, date: r.date, desc: r.desc, pence: r.pence,
        category: r.transfer ? 'Savings & transfers' : categorise(r.desc, r.pence, x.rules, r.hint),
        transfer: r.transfer || undefined, review: r.review || undefined, src: r.via,
      }));
      const withBal = rows.filter((r) => r.balance !== undefined).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
      accounts = accounts.map((a) => (a.id === id && withBal ? { ...a, balances: [...a.balances.filter((b) => b.date !== withBal.date), { date: withBal.date, pence: withBal.balance! }] } : a));
      return { ...x, accounts, txns: markTransfers([...x.txns, ...incoming]) };
    });
    setDone(`Imported ${fresh.length} transactions${dupes ? `, skipped ${dupes} already imported` : ''}.`);
    setFiles([]);
  };

  return (
    <>
      <Head title="Import" sub="Statements are read on this device. The files themselves are never stored or sent." />
      <label className={`drop ${hot ? 'hot' : ''}`} style={{ cursor: 'pointer', display: 'block' }}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }} onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); read(e.dataTransfer.files); }}>
        <b>Drop statements here</b><br />or click to choose · CSV (Monzo, Starling, Nationwide) or PDF
        <input type="file" multiple accept=".csv,.pdf,text/csv,application/pdf" hidden onChange={(e) => e.target.files && read(e.target.files)} />
      </label>
      {msg && <div className="err">{msg}</div>}
      {done && <div className="banner"><span>{done}</span><button className="btn sm" onClick={() => go('spend')}>View spending</button></div>}
      {files.length > 0 && (
        <Card title="Review before importing">
          <div className="fgrid" style={{ marginBottom: 14 }}>
            <Field label="Import into"><select value={target} onChange={(e) => setTarget(e.target.value)}><option value="new">New account…</option>{v.accounts.filter((a) => !['pension', 'property', 'investment'].includes(a.kind)).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            {target === 'new' && <Field label="Account name"><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Joint current" /></Field>}
            {target === 'new' && <Field label="Owner"><select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="joint">Joint</option>{v.household.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>}
          </div>
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="badge good">{fresh.length} new</span><span className="badge">{dupes} already imported</span>
            {reviewCount > 0 && <span className="badge medium">{reviewCount} need a check (PDF)</span>}
            {files.map((f) => <span key={f.name} className="badge">{f.name} · {f.bank}</span>)}
          </div>
          <table className="table"><thead><tr><th>Date</th><th>Description</th><th className="num">Amount</th></tr></thead>
            <tbody>{fresh.slice(0, 8).map((r, i) => <tr key={i}><td className="mute">{r.date}</td><td>{r.desc}{r.review && <span className="badge medium" style={{ marginLeft: 6 }}>check sign</span>}</td><td className={`num ${r.pence > 0 ? 'pos' : ''}`}>{fmt(r.pence)}</td></tr>)}</tbody></table>
          {fresh.length > 8 && <p className="note" style={{ marginTop: 8 }}>…and {fresh.length - 8} more</p>}
          <div className="row between" style={{ marginTop: 14 }}><button className="btn ghost" onClick={() => setFiles([])}>Clear</button>
            <button className="btn primary" disabled={!fresh.length || (target === 'new' && !newName)} onClick={commit}>Import {fresh.length}</button></div>
        </Card>
      )}
      <Card title="Tips">
        <ul className="note" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
          <li><b>Monzo:</b> app → account → Statements → Export CSV. <b>Starling:</b> Statements → CSV. <b>Nationwide:</b> Statements → Download → CSV.</li>
          <li>CSV is far more accurate than PDF. Use PDF only if CSV isn’t offered; check the flagged rows.</li>
          <li>Importing the same period twice is safe — duplicates are skipped.</li>
          <li>Transfers between your own accounts and pots are detected so they don’t count as spending or income.</li>
        </ul>
      </Card>
    </>
  );
}
