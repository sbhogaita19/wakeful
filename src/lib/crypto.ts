const enc = new TextEncoder();
const dec = new TextDecoder();
const AAD = enc.encode('wakeful-v1');

export const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export interface Wrap { salt: string; iv: string; ct: string; iter: number; }
export interface Stored {
  v: 1;
  wraps: { pass: Wrap; recovery: Wrap };
  data: { iv: string; ct: string };
  updated: string;
}

async function kek(secret: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: buf(salt), iterations: iter, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

async function wrap(secret: string, dek: Uint8Array, iter: number): Promise<Wrap> {
  const salt = rand(16), iv = rand(12);
  const k = await kek(secret, salt, iter);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(AAD) }, k, buf(dek)));
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), iter };
}

async function unwrap(secret: string, w: Wrap): Promise<Uint8Array> {
  const k = await kek(secret, unb64(w.salt), w.iter);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(unb64(w.iv)), additionalData: buf(AAD) }, k, buf(unb64(w.ct))));
}

const importDek = (raw: Uint8Array) => crypto.subtle.importKey('raw', buf(raw), 'AES-GCM', false, ['encrypt', 'decrypt']);

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function newRecoveryKey(): string {
  const bytes = rand(16);
  let bits = '';
  for (const b of bytes) bits += b.toString(2).padStart(8, '0');
  let s = '';
  for (let i = 0; i < 130; i += 5) s += B32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
  return s.match(/.{1,4}/g)!.join('-');
}
export const normaliseRecovery = (k: string) => k.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');

export const PASS_ITER = 600_000;
const REC_ITER = 100_000;

export async function seal(vault: unknown, pass: string, iter = PASS_ITER) {
  const dek = rand(32);
  const recoveryKey = newRecoveryKey();
  const stored: Stored = {
    v: 1,
    wraps: { pass: await wrap(pass, dek, iter), recovery: await wrap(normaliseRecovery(recoveryKey), dek, Math.min(iter, REC_ITER)) },
    data: await encryptJson(await importDek(dek), vault),
    updated: new Date().toISOString(),
  };
  return { stored, recoveryKey, key: await importDek(dek) };
}

export async function encryptJson(key: CryptoKey, data: unknown) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(AAD) }, key, buf(enc.encode(JSON.stringify(data)))));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decryptJson<T>(key: CryptoKey, d: { iv: string; ct: string }): Promise<T> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf(unb64(d.iv)), additionalData: buf(AAD) }, key, buf(unb64(d.ct)));
  return JSON.parse(dec.decode(pt));
}

export async function open<T>(stored: Stored, secret: string, via: 'pass' | 'recovery'): Promise<{ vault: T; key: CryptoKey }> {
  const raw = await unwrap(via === 'pass' ? secret : normaliseRecovery(secret), stored.wraps[via]);
  const key = await importDek(raw);
  return { vault: await decryptJson<T>(key, stored.data), key };
}

/** Re-wrap the data key under a new passphrase (needs the current one). */
export async function changePass(stored: Stored, oldPass: string, newPass: string, iter = PASS_ITER): Promise<Stored> {
  const raw = await unwrap(oldPass, stored.wraps.pass);
  return { ...stored, wraps: { ...stored.wraps, pass: await wrap(newPass, raw, iter) }, updated: new Date().toISOString() };
}

export function passphraseProblem(p: string): string | null {
  if (p.length < 10) return 'Use at least 10 characters.';
  if (new Set(p).size < 5) return 'Too repetitive.';
  if (/^(password|12345|qwerty)/i.test(p)) return 'Too common.';
  return null;
}
