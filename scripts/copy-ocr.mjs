// Copies the OCR engine and English language data from node_modules into public/ocr so the app can
// read scanned documents fully offline (no CDN, no download at runtime). Runs before dev and build.
import { cpSync, mkdirSync, existsSync } from 'node:fs';

const core = 'node_modules/tesseract.js-core';
const out = 'public/ocr';
mkdirSync(`${out}/core`, { recursive: true });
mkdirSync(`${out}/lang`, { recursive: true });
cpSync('node_modules/tesseract.js/dist/worker.min.js', `${out}/worker.min.js`);
for (const f of ['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'])
  cpSync(`${core}/${f}`, `${out}/core/${f}`);
const lang = 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';
if (!existsSync(lang)) throw new Error('missing language data: ' + lang);
cpSync(lang, `${out}/lang/eng.traineddata.gz`);
console.log('OCR assets ready in public/ocr');
