# Security

Wakeful handles household financial data, so it is built around one rule: **your data never leaves your device.**

## Design
- **No backend.** The app is static files. There is no server, account, analytics, or telemetry. A strict Content-Security-Policy (`connect-src 'self'`) blocks outside connections.
- **Encryption at rest.** Data is stored in IndexedDB as AES-256-GCM ciphertext. A random 256-bit data key encrypts the vault; that key is wrapped twice — by a key derived from your passphrase (PBKDF2-SHA-256, 600,000 iterations) and by a key derived from a 128-bit recovery key. The data key is a non-extractable `CryptoKey` in memory.
- **Locking.** Auto-lock on inactivity and after the tab has been hidden; the key is dropped from memory on lock.
- **No files kept.** Statement/payslip/bill PDFs and CSVs are parsed in the browser and discarded; only extracted rows are stored (encrypted).
- **Repo hygiene.** `.gitignore` and a pre-commit hook (`.githooks/pre-commit`) block statements and backups. Only fictional sample data is committed.
- **Dependencies.** Exact-pinned; Dependabot and `npm audit` run in CI. No third-party scripts, fonts or CDNs are loaded at runtime.

## What this does not protect against
- Malware, keyloggers or a compromised OS/browser on your device; malicious browser extensions (use a clean profile or the Android app).
- A weak or reused passphrase. Use a long passphrase of several words.
- Losing both passphrase and recovery key — the data is unrecoverable by design.
- A compromised hosting account serving altered code. For the highest assurance, build and run it yourself (`npm ci && npm run build`) or use the Android build you compiled locally.
- Insecure storage of exported backups (they remain encrypted, but protect them anyway).

## Roadmap
Biometric unlock (Android Keystore), Argon2id key derivation (once a vetted WASM build is adopted), reproducible builds, signed releases.

## Reporting
Please open a private security advisory on GitHub rather than a public issue.

Wakeful gives general information from your own data. It is not financial advice.
