import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { Card, Empty, Field, Head, Modal } from '../components/ui';
import { Icon } from '../components/Icon';
import { BENCH } from '../lib/benchmarks';
import { recurring } from '../lib/analytics';
import { daysUntil, fmtDate, todayISO } from '../lib/dates';
import { fmt, fmt0, parseMoney, uid } from '../lib/money';
import { parseBillLines } from '../lib/billParse';
import { activeBills, adults, type Bill, type BillKind } from '../types';

const KINDS: BillKind[] = ['energy', 'water', 'council-tax', 'broadband', 'mobile', 'insurance', 'security', 'tv-licence', 'subscription', 'other'];
const pounds = (p: number) => (p ? (p / 100).toFixed(2) : '');

export function Bills() {
  const { vault: v, update } = useStore();
  const [edit, setEdit] = useState<Bill | null>(null);
  const [prop, setProp] = useState('all');
  const bills = activeBills(v).filter((b) => prop === 'all' || b.propertyId === prop);
  const past = v.bills.filter((b) => b.endedOn).sort((a, b) => b.endedOn!.localeCompare(a.endedOn!));
  const nowFor = (old: Bill) => activeBills(v).find((b) => b.kind === old.kind && b.id !== old.id);
  const total = bills.reduce((s, b) => s + b.monthly, 0);
  const share = adults(v).map((m) => ({ m, p: Math.round(bills.reduce((s, b) => s + (b.monthly * (b.split[m.id] ?? 0)) / 100, 0)) }));

  const blank = (): Bill => ({
    id: uid(), kind: 'energy', provider: '', propertyId: v.household.properties[0].id, monthly: 0, history: [],
    split: Object.fromEntries(adults(v).map((m) => [m.id, Math.round(100 / adults(v).length)])),
  });

  const suggestions = useMemo(() => {
    const have = new Set(v.bills.map((b) => (b.match ?? '').toUpperCase()).filter(Boolean));
    return recurring(v.txns).filter((r) => ['Bills', 'Subscriptions', 'Housing'].includes(r.category) && ![...have].some((h) => r.key.includes(h))).slice(0, 6);
  }, [v.txns, v.bills]);

  return (
    <>
      <Head title="Bills" sub="Every service the household pays for — and whether it still deserves it.">
        {v.household.properties.length > 1 && <select value={prop} onChange={(e) => setProp(e.target.value)} style={{ width: 'auto' }}><option value="all">All properties</option>{v.household.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <button className="btn primary" onClick={() => setEdit(blank())}><Icon n="plus" />Add bill</button>
      </Head>

      <div className="grid g3">
        <Card><div className="stat"><div className="label">Monthly bills</div><div className="val">{fmt0(total)}</div><div className="note">{fmt0(total * 12)} a year</div></div></Card>
        {share.map(({ m, p }) => <Card key={m.id}><div className="stat"><div className="label">{m.name}’s share</div><div className="val">{fmt0(p)}</div></div></Card>).slice(0, 2)}
      </div>

      <Card title="Household services">
        {bills.length ? bills.sort((a, b) => b.monthly - a.monthly).map((b) => {
          const d = b.contractEnd ? daysUntil(b.contractEnd) : null;
          return (
            <div className="li" key={b.id} onClick={() => setEdit(b)} style={{ cursor: 'pointer' }}>
              <div>
                <div className="t">{b.provider || 'Unnamed'} <span className="badge" style={{ marginLeft: 6 }}>{b.kind.replace('-', ' ')}{b.fuel ? ` · ${b.fuel}` : ''}</span></div>
                <div className="s">
                  {d !== null && d < 0 && b.kind !== 'council-tax' ? <span className="neg">contract ended {fmtDate(b.contractEnd!)}</span>
                    : d !== null ? <span className={d <= 60 ? 'warn' : ''}>renews {fmtDate(b.contractEnd!)} ({d}d)</span> : 'no end date'}
                  {b.unitRate ? ` · ${b.unitRate}p/kWh` : ''}
                  {b.reviewedOn ? ` · reviewed ${fmtDate(b.reviewedOn)}` : ' · never reviewed'}
                </div>
              </div>
              <div className="r">{fmt(b.monthly)}<div className="s">per month</div></div>
            </div>
          );
        }) : <Empty title="No bills yet">Add energy, water, broadband, mobile, insurance, council tax — or pick from what we found below.</Empty>}
      </Card>

      {suggestions.length > 0 && (
        <Card title="Found in your bank data" sub="recurring payments not yet tracked">
          {suggestions.map((r) => (
            <div className="li" key={r.key}><div><div className="t">{r.label}</div><div className="s">{r.category} · {r.months} months running</div></div>
              <div className="row"><b>{fmt(r.monthly)}</b><button className="btn sm" onClick={() => setEdit({ ...blank(), kind: r.category === 'Subscriptions' ? 'subscription' : 'other', provider: r.label, monthly: r.monthly, match: r.key })}>Track</button></div></div>
          ))}
        </Card>
      )}

      {past.length > 0 && (
        <Card title="Past services" sub="cancelled or switched — kept for your records">
          {past.map((b) => {
            const now = nowFor(b);
            const diff = now ? (b.monthly - now.monthly) * 12 : 0;
            return (
              <div className="li" key={b.id} onClick={() => setEdit(b)} style={{ cursor: 'pointer' }}>
                <div><div className="t">{b.provider} <span className="badge">{b.kind.replace('-', ' ')}</span></div>
                  <div className="s">ended {fmtDate(b.endedOn!)}{now ? ` · now ${now.provider} at ${fmt(now.monthly)}/mo` : ''}</div>
                  {now && now.monthly > 0 && b.monthly > 0 && <div className={`s ${diff >= 0 ? 'pos' : 'warn'}`}>{diff >= 0 ? `Saving ${fmt0(diff)} a year since switching` : `Costing ${fmt0(-diff)} a year more since switching`}</div>}
                </div>
                <div className="r">{fmt(b.monthly)}<div className="s">was / month</div></div>
              </div>
            );
          })}
        </Card>
      )}

      <Readings />
      <p className="note">Energy comparisons use {BENCH.source} (as of {BENCH.asOf}). Bundled with the app — nothing is looked up online.</p>
      {edit && <BillEditor bill={edit} isNew={!v.bills.some((b) => b.id === edit.id)} onClose={() => setEdit(null)}
        onSwitch={(old) => { update((x) => ({ ...x, bills: x.bills.map((y) => (y.id === old.id ? { ...old, endedOn: todayISO() } : y)) })); setEdit({ ...blank(), kind: old.kind, propertyId: old.propertyId, split: old.split, fuel: old.fuel, provider: '' }); }}
        onSave={(b) => { update((x) => ({ ...x, bills: x.bills.some((y) => y.id === b.id) ? x.bills.map((y) => (y.id === b.id ? b : y)) : [...x.bills, b] })); setEdit(null); }}
        onDelete={() => { update((x) => ({ ...x, bills: x.bills.filter((y) => y.id !== edit.id) })); setEdit(null); }} />}
    </>
  );
}

export function BillEditor({ bill, isNew, onSave, onDelete, onClose, onSwitch }: { bill: Bill; isNew: boolean; onSave: (b: Bill) => void; onDelete: () => void; onClose: () => void; onSwitch: (b: Bill) => void }) {
  const { vault: v } = useStore();
  const [b, setB] = useState(bill);
  const [monthly, setMonthly] = useState(pounds(bill.monthly));
  const set = (p: Partial<Bill>) => setB((x) => ({ ...x, ...p }));
  const splitSum = Object.values(b.split).reduce((a, c) => a + (+c || 0), 0);
  const save = (reviewed = false) => {
    const m = parseMoney(monthly) ?? 0;
    const history = m !== bill.monthly && bill.monthly ? [...b.history, { date: todayISO(), monthly: m }] : b.history;
    onSave({ ...b, monthly: m, history, reviewedOn: reviewed ? todayISO() : b.reviewedOn });
  };
  const [note, setNote] = useState('');
  const readBill = async (file: File) => {
    setNote('Reading…');
    try {
      let lines: string[];
      if (/\.pdf$/i.test(file.name)) { const { pdfToLines } = await import('../lib/pdf'); lines = await pdfToLines(await file.arrayBuffer()); }
      else lines = (await file.text()).split(/\r?\n/);
      if (!lines.length) { setNote('No text found — type the details in.'); return; }
      const g = parseBillLines(lines);
      const { found, monthly: m, ...rest } = g;
      setB((x) => ({ ...x, ...rest }));
      if (m) setMonthly((m / 100).toFixed(2));
      setNote(found.length ? `Found: ${found.join(', ')}. Please check against your bill.` : 'Couldn’t recognise this bill — type the details in.');
    } catch { setNote('Couldn’t read that file — type the details in.'); }
  };
  return (
    <Modal title={isNew ? 'Add bill' : 'Edit bill'} onClose={onClose}>
      <label className="drop" style={{ cursor: 'pointer', padding: 18 }}>Drop or <b>choose a bill (PDF)</b> to fill this in — read on this device
        <input type="file" accept=".pdf,.txt" hidden onChange={(e) => e.target.files?.[0] && readBill(e.target.files[0])} /></label>
      {note && <div className="note">{note}</div>}
      <div className="fgrid">
        <Field label="Type"><select value={b.kind} onChange={(e) => set({ kind: e.target.value as BillKind })}>{KINDS.map((k) => <option key={k} value={k}>{k.replace('-', ' ')}</option>)}</select></Field>
        <Field label="Provider"><input value={b.provider} onChange={(e) => set({ provider: e.target.value })} /></Field>
        <Field label="Monthly cost (£)"><input inputMode="decimal" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
        <Field label="Contract / fix ends"><input type="date" value={b.contractEnd ?? ''} onChange={(e) => set({ contractEnd: e.target.value || undefined })} /></Field>
        {v.household.properties.length > 1 && <Field label="Property"><select value={b.propertyId} onChange={(e) => set({ propertyId: e.target.value })}>{v.household.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
        <Field label="Ended / switched away on"><input type="date" value={b.endedOn ?? ''} onChange={(e) => set({ endedOn: e.target.value || undefined })} /></Field>
        <Field label="Bank text to match (optional)"><input value={b.match ?? ''} onChange={(e) => set({ match: e.target.value || undefined })} placeholder="e.g. OCTOPUS" /></Field>
      </div>
      {b.kind === 'energy' && (
        <div className="fgrid">
          <Field label="Fuel"><select value={b.fuel ?? 'electricity'} onChange={(e) => set({ fuel: e.target.value as 'electricity' | 'gas' })}><option value="electricity">Electricity</option><option value="gas">Gas</option></select></Field>
          <span />
          <Field label="Unit rate (p/kWh)"><input inputMode="decimal" value={b.unitRate ?? ''} onChange={(e) => set({ unitRate: e.target.value ? +e.target.value : undefined })} /></Field>
          <Field label="Standing charge (p/day)"><input inputMode="decimal" value={b.standingCharge ?? ''} onChange={(e) => set({ standingCharge: e.target.value ? +e.target.value : undefined })} /></Field>
        </div>
      )}
      <div>
        <div className="note" style={{ marginBottom: 6 }}>Who pays (percent)</div>
        <div className="fgrid">{adults(v).map((m) => (
          <Field key={m.id} label={m.name}><input inputMode="numeric" value={b.split[m.id] ?? 0} onChange={(e) => set({ split: { ...b.split, [m.id]: +e.target.value || 0 } })} /></Field>))}</div>
        {splitSum !== 100 && <div className="err">Shares add up to {splitSum}%, not 100%.</div>}
      </div>
      <Field label="Notes"><textarea rows={2} value={b.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>
      <div className="row between">
        {!isNew ? <button className="btn danger" onClick={onDelete}>Delete</button> : <span />}
        <div className="row">{!isNew && !bill.endedOn && <button className="btn" title="Ends this service today and starts a new one" onClick={() => onSwitch({ ...b, monthly: parseMoney(monthly) ?? b.monthly })}>I’ve switched provider</button>}<button className="btn" onClick={() => save(true)}>Save & mark reviewed</button><button className="btn primary" onClick={() => save()}>Save</button></div>
      </div>
    </Modal>
  );
}

function Readings() {
  const { vault: v, update } = useStore();
  const [val, setVal] = useState('');
  const [fuel, setFuel] = useState<'electricity' | 'gas' | 'water'>('electricity');
  const list = v.readings.filter((r) => r.fuel === fuel).sort((a, b) => a.date.localeCompare(b.date));
  const a = list.at(-2), b = list.at(-1);
  const days = a && b ? Math.max(1, (Date.parse(b.date) - Date.parse(a.date)) / 86400000) : 0;
  const perDay = a && b ? (b.value - a.value) / days : 0;
  return (
    <Card title="Meter readings" sub="spot waste early">
      <div className="row" style={{ marginBottom: 10 }}>
        <select value={fuel} onChange={(e) => setFuel(e.target.value as 'electricity' | 'gas' | 'water')} style={{ width: 'auto' }}><option value="electricity">Electricity (kWh)</option><option value="gas">Gas (kWh / m³)</option><option value="water">Water (m³)</option></select>
        <input inputMode="decimal" placeholder="Reading" value={val} onChange={(e) => setVal(e.target.value)} style={{ maxWidth: 140 }} />
        <button className="btn" disabled={!val} onClick={() => { update((x) => ({ ...x, readings: [...x.readings, { id: uid(), propertyId: x.household.properties[0].id, fuel, date: todayISO(), value: +val }] })); setVal(''); }}>Record today</button>
      </div>
      {a && b ? <p>Usage: <b>{perDay.toFixed(1)}</b> per day over {Math.round(days)} days{fuel === 'electricity' ? ` — typical home uses about ${(BENCH.typicalKwh.electricity / 365).toFixed(1)} kWh/day` : fuel === 'gas' ? ` — typical home uses about ${(BENCH.typicalKwh.gas / 365).toFixed(0)} kWh/day` : ''}.</p>
        : <p className="note">Record two readings to see your daily usage.</p>}
    </Card>
  );
}
