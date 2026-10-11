import { useState } from 'react';
import { useStore } from '../store';
import { Card, Field, Head } from '../components/ui';
import { exportBackup, readBackup, updatePassphrase } from '../lib/vaultStore';
import { mergeSummary, mergeVaults, type MergeReport } from '../lib/merge';
import type { Vault } from '../types';
import { passphraseProblem } from '../lib/crypto';
import { uid } from '../lib/money';
import { saveFile } from '../lib/saveFile';
import { getPref, setPref, type ThemePref } from '../theme';

export function Settings() {
  const { vault: v, update, demo, wipeAll, lock } = useStore();
  const [oldP, setOldP] = useState('');
  const [newP, setNewP] = useState('');
  const [msg, setMsg] = useState('');
  const [confirm, setConfirm] = useState('');
  const [theme, setTheme] = useState<ThemePref>(getPref());

  const backup = async () => {
    try { await saveFile(`wakeful-backup-${new Date().toISOString().slice(0, 10)}.wakeful`, await exportBackup(), 'application/json', 'Wakeful encrypted backup'); }
    catch (e) { if (!(e instanceof Error && /cancel|dismiss/i.test(e.message))) alert('Couldn’t save the backup.'); }
  };

  return (
    <>
      <Head title="Settings" sub="Your household, your security." />
      <Card title="Household">
        <div className="stack">
          <Field label="Household name"><input value={v.household.name} onChange={(e) => update((x) => ({ ...x, household: { ...x.household, name: e.target.value } }))} /></Field>
          <div className="fgrid">
            <div className="stack"><div className="eyebrow">People</div>
              {v.household.members.map((m) => (
                <div className="row" key={m.id} style={{ flexWrap: 'nowrap' }}>
                  <input value={m.name} onChange={(e) => update((x) => ({ ...x, household: { ...x.household, members: x.household.members.map((y) => (y.id === m.id ? { ...y, name: e.target.value } : y)) } }))} />
                  <select value={m.kind ?? 'adult'} aria-label="Adult or child" style={{ width: 'auto' }} onChange={(e) => update((x) => ({ ...x, household: { ...x.household, members: x.household.members.map((y) => (y.id === m.id ? { ...y, kind: e.target.value as 'adult' | 'child' } : y)) } }))}><option value="adult">Adult</option><option value="child">Child</option></select>
                </div>))}
              <div className="row">
                <button className="btn sm" onClick={() => update((x) => ({ ...x, household: { ...x.household, members: [...x.household.members, { id: uid(), name: 'New person', kind: 'adult' }] } }))}>Add adult</button>
                <button className="btn sm" onClick={() => update((x) => ({ ...x, household: { ...x.household, members: [...x.household.members, { id: uid(), name: 'Child', kind: 'child' }] } }))}>Add child</button>
              </div></div>
            <div className="stack"><div className="eyebrow">Properties</div>
              {v.household.properties.map((m) => <input key={m.id} value={m.name} onChange={(e) => update((x) => ({ ...x, household: { ...x.household, properties: x.household.properties.map((y) => (y.id === m.id ? { ...y, name: e.target.value } : y)) } }))} />)}
              <button className="btn sm" onClick={() => update((x) => ({ ...x, household: { ...x.household, properties: [...x.household.properties, { id: uid(), name: 'Another property' }] } }))}>Add property</button></div>
          </div>
        </div>
      </Card>

      <Card title="Appearance">
        <Field label="Theme"><select value={theme} onChange={(e) => { const t = e.target.value as ThemePref; setTheme(t); setPref(t); }} style={{ maxWidth: 220 }}>
          <option value="auto">Match my device</option><option value="dark">Dark</option><option value="light">Light (paper)</option></select></Field>
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

      {!demo && <MergeCard />}

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
      <p className="note mono">Version 0.1.0 · build {typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'}</p>
    </>
  );
}

function MergeCard() {
  const { vault, update } = useStore();
  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [secret, setSecret] = useState('');
  const [via, setVia] = useState<'pass' | 'recovery'>('pass');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [preview, setPreview] = useState<{ merged: Vault; report: MergeReport } | null>(null);
  const [done, setDone] = useState<{ report: MergeReport; before: Vault } | null>(null);

  const reset = () => { setText(''); setFileName(''); setSecret(''); setPreview(null); setErr(''); };
  const check = async () => {
    setBusy(true); setErr(''); setPreview(null);
    try {
      const other = await readBackup(text, secret, via);
      const { vault: merged, report } = mergeVaults(vault, other);
      setPreview({ merged, report });
    } catch { setErr(via === 'pass' ? 'Could not open that backup — wrong passphrase, or not a Wakeful backup.' : 'Could not open that backup with that recovery key.'); }
    finally { setBusy(false); }
  };
  const apply = () => {
    if (!preview) return;
    const before = vault;
    update(() => preview.merged);
    setDone({ report: preview.report, before });
    reset();
  };

  return (
    <Card title="Merge a backup" sub="combine another device’s data into this one">
      <p className="note" style={{ marginBottom: 12 }}>Download an encrypted backup on your other device (Settings → Download encrypted backup), bring the file here, and enter <b>that device’s</b> passphrase. New items are added; duplicates are skipped; where both devices disagree, this device’s version is kept. Nothing is uploaded anywhere.</p>
      {done && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <span>Merged: {mergeSummary(done.report)}.{done.report.dupes ? ` ${done.report.dupes} duplicates skipped.` : ''}</span>
          <button className="btn sm" onClick={() => { update(() => done.before); setDone(null); }}>Undo</button>
        </div>
      )}
      <div className="stack">
        <label className="drop" style={{ cursor: 'pointer', padding: 20 }}>{fileName ? <b>{fileName}</b> : <><b>Choose a backup file</b> (.wakeful)</>}
          <input type="file" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; setText(await f.text()); setFileName(f.name); setPreview(null); setErr(''); e.target.value = ''; }} /></label>
        {text && (
          <>
            <Field label={via === 'pass' ? 'Passphrase of that backup' : 'Recovery key of that backup'}><input type={via === 'pass' ? 'password' : 'text'} value={secret} onChange={(e) => { setSecret(e.target.value); setPreview(null); }} autoComplete="off" /></Field>
            <div className="row">
              <button className="btn primary" disabled={!secret || busy} onClick={check}>{busy ? 'Checking…' : 'Check what will merge'}</button>
              <button className="btn ghost" onClick={() => { setVia(via === 'pass' ? 'recovery' : 'pass'); setSecret(''); setPreview(null); }}>{via === 'pass' ? 'Use recovery key' : 'Use passphrase'}</button>
              <button className="btn ghost" onClick={reset}>Cancel</button>
            </div>
          </>
        )}
        {err && <div className="err">{err}</div>}
        {preview && (
          <div className="card" style={{ background: 'var(--inset)' }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>This would add</div>
            <p><b>{mergeSummary(preview.report)}</b></p>
            <p className="note" style={{ marginTop: 6 }}>{preview.report.dupes} duplicate transactions skipped{preview.report.kept ? ` · ${preview.report.kept} differences where this device’s version is kept` : ''}{preview.report.billsEnded ? ` · ${preview.report.billsEnded} bills marked ended` : ''}.</p>
            {mergeSummary(preview.report) === 'nothing new' && !preview.report.billsEnded
              ? <p className="note" style={{ marginTop: 10 }}>This device already has everything in that backup.</p>
              : <div className="row" style={{ marginTop: 12 }}><button className="btn primary" onClick={apply}>Merge now</button></div>}
          </div>
        )}
      </div>
    </Card>
  );
}
