// Renders the Wakeful mark (a seated Buddha silhouette in a halo) to PNG with no dependencies.
// Shapes are defined on a 64x64 canvas; used for web/PWA icons and Android launcher icons.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0, 0, 0], FIG = [247, 247, 247], HALO = [248, 79, 204];

const inCircle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
const inEllipse = (x, y, cx, cy, rx, ry) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const ring = (x, y, cx, cy, r, w) => Math.abs(Math.hypot(x - cx, y - cy) - r) <= w / 2;
// torso: neck -> rounded shoulders -> arms sloping out to rest in the lap
function inTorso(x, y) {
  if (y < 25.5 || y > 47) return false;
  let half;
  if (y < 29.5) half = 3.2 + 8.3 * Math.sin(((y - 25.5) / 4) * (Math.PI / 2));
  else half = 11.5 + ((y - 29.5) / 17.5) * 4.5;
  return Math.abs(x - 32) <= half;
}

function figure(x, y) {
  if (inEllipse(x, y, 32, 19.6, 4.9, 5.7)) return 'fig';   // head
  if (inCircle(x, y, 32, 13.4, 1.8)) return 'fig';          // ushnisha
  if (inTorso(x, y)) return 'fig';
  if (inEllipse(x, y, 32, 47.6, 19.8, 5.2)) return 'fig';     // crossed legs, knees wide
  return null;
}

function shade(x, y) {
  if (ring(x, y, 32, 32, 28, 1.6)) return HALO;
  return figure(x, y) ? FIG : null;
}

function render(size, { pad = 0, round = false } = {}) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const S = 3, scale = (64 * (1 - pad * 2)) / size, off = 64 * pad;
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
        const X = off + (px + (sx + 0.5) / S) * scale, Y = off + (py + (sy + 0.5) / S) * scale;
        const nx = (px + (sx + 0.5) / S) / size - 0.5, ny = (py + (sy + 0.5) / S) / size - 0.5;
        if (round && Math.hypot(nx, ny) > 0.5) continue;
        const c = shade(X, Y) ?? BG;
        r += c[0]; g += c[1]; b += c[2]; a += 255;
      }
      const n = S * S, o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = r / n; raw[o + 1] = g / n; raw[o + 2] = b / n; raw[o + 3] = a / n;
    }
  }
  return png(size, raw);
}

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function png(size, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const s of [180, 192, 512]) writeFileSync(`public/icon-${s}.png`, render(s));
writeFileSync('public/icon-maskable-512.png', render(512, { pad: 0.1 }));

// Android launcher (legacy PNGs; adaptive-icon XML removed so these are used everywhere)
const dens = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [d, s] of Object.entries(dens)) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  try { mkdirSync(dir, { recursive: true }); } catch {}
  writeFileSync(`${dir}/ic_launcher.png`, render(s));
  writeFileSync(`${dir}/ic_launcher_round.png`, render(s, { round: true }));
}
console.log('icons written');
