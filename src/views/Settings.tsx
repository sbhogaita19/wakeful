import { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Head } from '../components/ui';
import { exportBackup, updatePassphrase } from '../lib/vaultStore';
import { passphraseProblem } from '../lib/crypto';
import { uid } from '../lib/money';

export function Settings() {
  const { vault: v, update, demo, wipeAll, lock } = useStore();
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState('');

  const backup = async () => {
    const blob = new Blob([await exportBackup()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `wakeful-backup-${new Date().toISOString().slice(0, 10)}.wakeful`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <Head title="Settings" sub="Your household, your security." />
      <Card title="Household">
        <div className="stack">
          <Field label="Household name"><input value={v.household.name} onChange={(e) => update((x) => ({ ...x, household: { ...x.household, name: e.target.value } }))} /></Field>
          <div className="fgrid">
            <div className="stack"><div className="eyebrow">People</div>
              {v.household.members.map((m) => <input key={m.id} value={m.name} onChange={(e) => update((x) => ({ ...x, household: { ...x.household, members: x.household.members.map((y) => (y.id === m.id ? { ...y, name: e.target.value } : y)) } }))} />)}
              <button className="btn sm" onClick={() => update((x) => ({ ...x, household: { ...x.household, members: [...x.household.members, { id: uid(), name: 'New person' }] } }))}>Add person</button></div>
            <div className="stack"><div className="eyebrow">Properties</div>
              {v.household.properties.map((m) => <input key={m.id} value={m.name} onChange={(e) => update((x) => ({ ...x, household: { ...x.household, properties: x.household.properties.map((y) => (y.id === m.id ? { ...y, name: e.target.value } : y)) } }))} />)}
              <button className="btn sm" onClick={() => update((x) => ({ ...x, household: { ...x.household, properties: [...x.household.properties, { id: uid(), name: 'Another property' }] } }))}>Add property</button></div>
          </div>
        </div>
      </Card>

      <Card title="Security">
        <div className="stack">
          <Field label="Auto-lock after inactivity"><select value={v.settings.autoLockMins} onChange={(e) => update((x) => ({ ...x, settings: { ...x.settings, autoLockMins: +e.target.value } }))} style={{ maxWidth: 220 }}>
            {[1, 2, 5, 10, 30].map((m) => <option key={m} value={m}>{m} minute{m > 1 ? 's' : ''}</option>)}<option value={0}>Never (not recommended)</option></select></Field>
          {!demo && (
            <form className="fgrid" onSubmit={async (e) => {
              e.preventDefault();
              const p = passphraseProblem(newP);
              if (p) return setMsg(p);
              try { await updatePassphrase(oldP, newP); setMsg('Passphrase changed.'); setOldP(''); setNewP(''); } catch { setMsg('Current passphrase is wrong.'); }
            }}>
              <Field label="Current passphrase"><input type="password" value={oldP} onChange={(e) => setOldP(e.target.value)} /></Field>
              <Field label="New passphrase"><input type="password" value={newP} onChange={(e) => setNewP(e.target.value)} /></Field>
              <button className="btn" disabled={!oldP || !newP}>Change passphrase</button>
              {msg && <span className="note">{msg}</span>}
            </form>
          )}
          <ul className="note" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>AES-256-GCM encryption; the key is wrapped by your passphrase (PBKDF2-SHA-256, 600,000 rounds) and by your recovery key.</li>
            <li>Data lives only in this browser/app on this device. There is no server, account or analytics. A strict content-security policy blocks all outside connections.</li>
            <li>Original PDFs and CSVs are never stored — only the extracted lines.</li>
          </ul>
        </div>
      </Card>

      {!demo && (
        <Card title="Backup & erase">
          <div className="row"><button className="btn" onClick={backup}>Download encrypted backup</button>
            <button className="btn" onClick={lock}>Lock now</button></div>
          <p className="note" style={{ marginTop: 10 }}>The backup is still encrypted — it needs your passphrase or recovery key. Store a copy off this device.</p>
          <div className="row" style={{ marginTop: 16 }}>
            <input placeholder="Type ERASE to enable" value={confirm} onChange={(e) => setConfirm(e.target.value)} style={{ maxWidth: 220 }} />
            <button className="btn danger" disabled={confirm !== 'ERASE'} onClick={wipeAll}>Erase everything</button>
          </div>
        </Card>
      )}
      <p className="note">Wakeful gives general information, not financial advice. Open source (MIT).</p>
    </>
  );
}
