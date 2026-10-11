import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildReport, PRESETS } from '../src/lib/report';
import { demoVault } from '../src/lib/demo';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function textOf(bytes: Uint8Array): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: false, isEvalSupported: false }).promise;
  let out = '';
  for (let p = 1; p <= doc.numPages; p++) { const c = await (await doc.getPage(p)).getTextContent(); out += c.items.map((i) => ('str' in i ? i.str : '')).join(' ') + '\n'; }
  return out;
}

describe('summary PDF', () => {
  const v = demoVault();
  for (const k of ['partner', 'adviser', 'summary'] as const) {
    it(`builds the ${k} PDF`, async () => {
      const bytes = await buildReport(v, PRESETS[k].opts, '2026-10-11');
      expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
      expect(bytes.length).toBeGreaterThan(3000);
      if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}/${k}.pdf`, bytes);
    });
  }
  it('anonymised version contains no names (checked on the real extracted text)', async () => {
    const text = await textOf(await buildReport(v, PRESETS.adviser.opts, '2026-10-11'));
    expect(text.length).toBeGreaterThan(500);
    expect(text).toMatch(/Adult 1/);
    for (const n of ['Asha', 'Ben', 'Maya', 'Acme', 'Northern Health', 'Octopus', 'Virgin', 'Rivers', 'Halifax']) expect(text.includes(n), n).toBe(false);
  });
  it('named version contains the names', async () => {
    const text = await textOf(await buildReport(v, PRESETS.partner.opts, '2026-10-11'));
    for (const n of ['Asha', 'Ben', 'Maya', 'Rivers', 'Octopus']) expect(text.includes(n), n).toBe(true);
    expect(text).toMatch(/£/);
  });
});
