import { useState } from 'react';
import { useStore } from '../store';
import { Logo } from '../components/Icon';
import { passphraseProblem } from '../lib/crypto';

export function Onboarding() {
  const s = useStore();
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [rec, setRec] = useState('');
  const [useRec, setUseRec] = useState(false);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState('');

  const run = async (f: () => Promise<void>) => {
    setBusy(true); setErr('');
    try { await f(); } catch { setErr(useRec ? 'That recovery key did not work.' : 'Wrong passphrase.'); } finally { setBusy(false); }
  };

  if (recovery) {
    return (
      <div className="center"><div className="auth">
        <Logo />
        <h1>Save your recovery key</h1>
        <p className="mute">Everything is encrypted on this device. If you forget your passphrase, this key is the <b>only</b> way back in. We cannot reset it — nobody can.</p>
        <div className="recovery">{recovery}</div>
        <div className="row">
          <button className="btn" onClick={() => navigator.clipboard?.writeText(recovery)}>Copy</button>
          <button className="btn" onClick={() => window.print()}>Print</button>
        </div>
        <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have stored it somewhere safe, away from this device.</label>
        <button className="btn primary" disabled={!saved} onClick={() => { s.finishSetup(); setRecovery(null); }}>Continue</button>
      </div></div>
    );
  }

  if (s.phase === 'new') {
    const problem = pass ? passphraseProblem(pass) : null;
    return (
      <div className="center"><div className="auth">
        <Logo />
        <div><div className="eyebrow">Wakeful</div><h1>Know your household money.</h1></div>
        <p className="mute">Bills, budgets, debts and savings in one calm place. Everything is encrypted with your passphrase and stays on this device. No account, no server, no tracking.</p>
        <form className="stack" onSubmit={(e) => { e.preventDefault(); if (!problem && pass === pass2) run(async () => { setRecovery(await s.create(pass)); }); }}>
          <label className="f">Choose a passphrase<input type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="A few words you will remember" /></label>
          {problem && <div className="err">{problem}</div>}
          <label className="f">Repeat it<input type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></label>
          {pass2 && pass !== pass2 && <div className="err">Passphrases don’t match.</div>}
          <button className="btn primary" disabled={busy || !pass || !!problem || pass !== pass2}>{busy ? 'Securing…' : 'Create private vault'}</button>
        </form>
        <button className="btn" onClick={s.startDemo}>Explore a demo household</button>
        <RestoreLink s={s} msg={restoreMsg} setMsg={setRestoreMsg} />
      </div></div>
    );
  }

  return (
    <div className="center"><div className="auth">
      <Logo />
      <h1>Welcome back</h1>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); run(() => s.unlock(useRec ? rec : pass, useRec ? 'recovery' : 'pass')); }}>
        {useRec
          ? <label className="f">Recovery key<input autoFocus value={rec} onChange={(e) => setRec(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XX" /></label>
          : <label className="f">Passphrase<input autoFocus type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>}
        {err && <div className="err">{err}</div>}
        <button className="btn primary" disabled={busy || !(useRec ? rec : pass)}>{busy ? 'Unlocking…' : 'Unlock'}</button>
      </form>
      <button className="btn ghost" onClick={() => { setUseRec(!useRec); setErr(''); }}>{useRec ? 'Use passphrase' : 'Use recovery key'}</button>
      <button className="btn" onClick={s.startDemo}>Explore demo</button>
      <RestoreLink s={s} msg={restoreMsg} setMsg={setRestoreMsg} />
    </div></div>
  );
}

function RestoreLink({ s, msg, setMsg }: { s: ReturnType<typeof useStore>; msg: string; setMsg: (m: string) => void }) {
  return (
    <div className="note">
      Have a backup? <label style={{ color: 'var(--accent)', cursor: 'pointer' }}>Restore it
        <input type="file" hidden onChange={async (e) => {
          const f = e.target.files?.[0]; if (!f) return;
          try { await s.restore(await f.text()); setMsg(''); } catch { setMsg('That file is not a Wakeful backup.'); }
        }} /></label>
      {msg && <div className="err">{msg}</div>}
    </div>
  );
}
