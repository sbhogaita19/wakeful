/**
 * Read text from a photo or scan, entirely on this device. The OCR engine and English language data are
 * bundled with the app (public/ocr) — nothing is downloaded or uploaded.
 */
const base = () => new URL('./ocr/', document.baseURI).href;

/** Fix common OCR slips in money amounts, e.g. "E3,298.00" → "£3,298.00". */
export function normaliseOcrLines(lines: string[]): string[] {
  return lines
    .map((l) => l.replace(/[|¦]/g, 'I').replace(/\b[EL£](?=\d{1,3}(?:,\d{3})*\.\d{2}\b)/g, '£').replace(/(\d)[ ]([.,])(?=\d{2}\b)/g, '$1$2').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Grey-scale, upscale and stretch contrast: makes phone photos of printed pages much easier to read. */
export async function prepareImage(src: Blob): Promise<HTMLCanvasElement> {
  let bmp: ImageBitmap;
  try { bmp = await createImageBitmap(src); } catch { throw new Error('This image format can’t be read here (iPhone HEIC photos need converting to JPEG).'); }
  const target = 2200;
  const scale = Math.min(2.5, Math.max(1, target / Math.max(bmp.width, bmp.height)));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(bmp, 0, 0, c.width, c.height);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let lo = 255, hi = 0;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = y;
    if (y < lo) lo = y; if (y > hi) hi = y;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) / span) * 255)); d[i] = d[i + 1] = d[i + 2] = v; }
  g.putImageData(img, 0, 0);
  return c;
}

export async function ocrLines(images: (Blob | HTMLCanvasElement)[], onProgress?: (p: number) => void): Promise<string[]> {
  const { createWorker } = await import('tesseract.js');
  const b = base();
  const worker = await createWorker('eng', 1, {
    workerPath: `${b}worker.min.js`, corePath: `${b}core`, langPath: `${b}lang`,
    gzip: true, workerBlobURL: false, cacheMethod: 'none',
    logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(m.progress); },
  });
  const out: string[] = [];
  try {
    for (const img of images) {
      const { data } = await worker.recognize(img as never);
      out.push(...data.text.split(/\r?\n/));
    }
  } finally { await worker.terminate(); }
  return normaliseOcrLines(out);
}
