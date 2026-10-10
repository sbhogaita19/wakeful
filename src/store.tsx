import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Vault } from './types';
import { emptyVault } from './types';
import * as vs from './lib/vaultStore';
import { demoVault } from './lib/demo';
import { latestMonth } from './lib/analytics';
import type { Stored } from './lib/crypto';

export type Phase = 'loading' | 'new' | 'locked' | 'open';

interface Ctx {
  phase: Phase;
  demo: boolean;
  vault: Vault;
  month: string;
  setMonth: (m: string) => void;
  update: (fn: (v: Vault) => Vault) => void;
  create: (pass: string) => Promise<string>;
  finishSetup: () => void;
  unlock: (secret: string, via: 'pass' | 'recovery') => Promise<void>;
  startDemo: () => void;
  lock: () => void;
  exit: () => void;
  restore: (text: string) => Promise<void>;
  wipeAll: () => Promise<void>;
}

const C = createContext<Ctx>(null as never);
export const useStore = () => useContext(C);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [demo, setDemo] = useState(false);
  const [vault, setVault] = useState<Vault>(emptyVault());
  const [month, setMonth] = useState('');
  const key = useRef<CryptoKey | null>(null);
  const stored = useRef<Stored | null>(null);
  const timer = useRef<number>();
  const pending = useRef<Vault | null>(null);
  const setupDone = useRef(true);

  useEffect(() => { vs.hasVault().then((h) => setPhase(h ? 'locked' : 'new')).catch(() => setPhase('new')); }, []);

  const flush = useCallback(async () => {
    window.clearTimeout(timer.current);
    const v = pending.current;
    if (v && key.current && stored.current && !demo) {
      pending.current = null;
      stored.current = await vs.save(key.current, stored.current, v);
    }
  }, [demo]);

  const update = useCallback((fn: (v: Vault) => Vault) => {
    setVault((cur) => {
      const next = fn(cur);
      pending.current = next;
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => { flush().catch(console.error); }, 400);
      return next;
    });
  }, [flush]);

  const open = (v: Vault) => {
    setVault(v);
    setMonth(latestMonth(v.txns) ?? new Date().toISOString().slice(0, 7));
    setPhase('open');
  };

  const lock = useCallback(() => {
    flush().finally(() => {
      key.current = null; stored.current = null; pending.current = null;
      setVault(emptyVault()); setDemo(false);
      vs.hasVault().then((h) => setPhase(h ? 'locked' : 'new'));
    });
  }, [flush]);

  // Auto-lock on inactivity and when the tab has been hidden for a while.
  useEffect(() => {
    if (phase !== 'open' || demo || !setupDone.current) return;
    const mins = vault.settings.autoLockMins;
    if (!mins) return;
    let t = window.setTimeout(lock, mins * 60000);
    const reset = () => { window.clearTimeout(t); t = window.setTimeout(lock, mins * 60000); };
    let hiddenAt = 0;
    const vis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > mins * 60000) lock();
    };
    const evs = ['pointerdown', 'keydown', 'scroll'] as const;
    evs.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    document.addEventListener('visibilitychange', vis);
    return () => { window.clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); document.removeEventListener('visibilitychange', vis); };
  }, [phase, demo, vault.settings.autoLockMins, lock]);

  const value = useMemo<Ctx>(() => ({
    phase, demo, vault, month, setMonth, update,
    create: async (pass) => {
      const r = await vs.createVault(pass);
      key.current = r.key; stored.current = r.stored;
      setDemo(false);
      return r.recoveryKey; // vault opens only after the user confirms they saved it (finishSetup)
    },
    finishSetup: () => { setupDone.current = true; open(emptyVault()); },
    unlock: async (secret, via) => {
      const r = await vs.unlock(secret, via);
      key.current = r.key; stored.current = r.stored; setupDone.current = true; setDemo(false);
      open(r.vault);
    },
    startDemo: () => { setDemo(true); setupDone.current = true; open(demoVault()); },
    lock,
    exit: () => { setDemo(false); setVault(emptyVault()); vs.hasVault().then((h) => setPhase(h ? 'locked' : 'new')); },
    restore: async (text) => { await vs.importBackup(text); setPhase('locked'); },
    wipeAll: async () => { await vs.wipe(); key.current = null; stored.current = null; setVault(emptyVault()); setPhase('new'); },
  }), [phase, demo, vault, month, update, lock]);

  return <C.Provider value={value}>{children}</C.Provider>;
}
