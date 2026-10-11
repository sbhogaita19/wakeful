# Wakeful

**Awareness of bills and household money.** A private, local-first budgeting app for the whole household — current accounts, savings, ISAs, pensions, property, mortgage, credit cards and money owed, in one calm dark dashboard.

**Live demo (fictional data):** https://sbhogaita19.github.io/wakeful/

Everything is computed and encrypted **on your device**. No server, no account, no analytics.

## What it does
- **Import statements** — Monzo, Starling, Nationwide CSV (best) or PDF (best-effort, flagged for checking). Duplicates skipped; transfers and pots detected so they don't count as spending.
- **Automatic categorising** that learns from your corrections.
- **Payslips → take-home** — drop in a PDF, a photo or scan (read on-device with OCR, then you confirm), or type figures; per-person, with a tax/NI sanity check.
- **Household bills** — energy, water, council tax, broadband, mobile, insurance, subscriptions; contract end dates, price-rise tracking, bill-PDF reading, benchmark checks against the Ofgem cap, meter readings, per-person splits.
- **Insights** — ranked "where to look" flags with an estimated yearly saving: renewals, ended contracts, high APR, fees, duplicates, trends, budget overruns, mortgage fix ending, LTV bands, low-rate savings, FSCS limits, payslip anomalies.
- **Wealth** — net worth, trend, home equity and LTV, debt pay-off estimates.
- **Balance dashboard** — five transparent pillars (saving, spending, debt, bills, resilience).
- **Values (optional)** — inspired by Buddhist economics: dāna (giving, Gift Aid), *enough*, mindful/regret tagging, the Middle Way, and a carbon estimate from energy use. You set every number; it never judges.
- **"Complete your picture"** — tells you what it doesn't know yet.

## Run it
```bash
npm ci
npm run dev        # http://localhost:5173
npm test
npm run build      # static site in dist/
```
Try the demo from the first screen, or import the fictional files in [`samples/`](samples).

## Android (native)
Wakeful wraps as a Capacitor app (screenshots blocked, no cloud backup).
```bash
npm run android:sync
npm run android:open   # Android Studio → Run
```
CLI build: `cd android && ./gradlew assembleDebug` (needs a JDK 21+ and the Android SDK; the wrapper uses Gradle 9.1).

## Security
See [SECURITY.md](SECURITY.md). In short: AES-256-GCM, passphrase + recovery key, strict CSP, auto-lock, nothing leaves the device. **Never commit real statements** — `.gitignore` and a pre-commit hook (`npm ci` installs it) block them; only fictional samples live in this repo.

## Stack
Vite · React · TypeScript · WebCrypto · pdf.js (in-browser) · Capacitor. Fonts bundled (Geist, JetBrains Mono); interface style follows the omp.sh docs (black, hairlines, mono labels). The mark is a seated Buddha in a halo. Tests with Vitest.

## Caveats
Wakeful gives general information from your own data, not financial advice. PDF parsing varies by bank layout; check flagged rows. Tax/NI checks are indicative (England, tax code 1257L). Benchmark figures are bundled with an as-of date and must be refreshed.

MIT licensed.
