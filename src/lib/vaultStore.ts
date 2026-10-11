import type { Vault } from '../types';
import { emptyVault } from '../types';
import { changePass, encryptJson, open, seal, type Stored } from './crypto';
import { TAKEAWAY_RE, merchantKey } from './categorise';

const DB = 'wakeful';
const STORE = 'vault';
const KEY = 'main';

function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function get(): Promise<Stored | undefined> {
  const db = await idb();
  return new Promise((res, rej) => {
    const q = db.transaction(STORE).objectStore(STORE).get(KEY);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function put(s: Stored): Promise<void> {
  const db = await idb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(s, KEY);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

export const hasVault = async () => !!(await get());

/** Fill gaps so older/imported vaults always have the full shape. */
export function normaliseVault(v: Partial<Vault>): Vault {
  const e = emptyVault();
  const ruled = new Set((v.rules ?? []).map((r) => r.match));
  // move existing takeaway-type rows out of 'Eating out' unless the user has set a rule for that merchant
  const txns = (v.txns ?? []).map((t) => (t.category === 'Eating out' && !ruled.has(merchantKey(t.desc)) && TAKEAWAY_RE.test(t.desc) ? { ...t, category: 'Takeaways' } : t));
  return { ...e, ...v, txns, customCategories: v.customCategories ?? [], categoryNotes: v.categoryNotes ?? {}, decisions: v.decisions ?? {}, aliases: v.aliases ?? {}, v: 2, household: { ...e.household, ...v.household }, values: { ...e.values, ...v.values }, settings: { ...e.settings, ...v.settings } } as Vault;
}

export async function createVault(pass: string, vault: Vault = emptyVault()) {
  const { stored, recoveryKey, key } = await seal(vault, pass);
  await put(stored);
  return { recoveryKey, key, stored };
}

export async function unlock(pass: string, via: 'pass' | 'recovery' = 'pass') {
  const stored = await get();
  if (!stored) throw new Error('No vault');
  const { vault, key } = await open<Vault>(stored, pass, via);
  return { vault: normaliseVault(vault), key, stored };
}

export async function save(key: CryptoKey, stored: Stored, vault: Vault): Promise<Stored> {
  const next: Stored = { ...stored, data: await encryptJson(key, vault), updated: new Date().toISOString() };
  await put(next);
  return next;
}

export async function updatePassphrase(oldPass: string, newPass: string) {
  const stored = await get();
  if (!stored) throw new Error('No vault');
  const next = await changePass(stored, oldPass, newPass);
  await put(next);
  return next;
}

/** Decrypt a backup file in memory (nothing is stored) so it can be merged into the open vault. */
export async function readBackup(text: string, secret: string, via: 'pass' | 'recovery'): Promise<Vault> {
  const s = JSON.parse(text) as Stored;
  if (s.v !== 1 || !s.wraps || !s.data) throw new Error('Not a Wakeful backup');
  const { vault } = await open<Vault>(s, secret, via);
  return normaliseVault(vault);
}

export async function exportBackup(): Promise<string> {
  const s = await get();
  if (!s) throw new Error('No vault');
  return JSON.stringify(s);
}

export async function importBackup(text: string) {
  const s = JSON.parse(text) as Stored;
  if (s.v !== 1 || !s.wraps || !s.data) throw new Error('Not a Wakeful backup');
  await put(s);
}

export async function wipe() {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
