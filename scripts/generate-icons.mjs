/**
 * Generate Market Overlay brand icons with pure Node (pngjs) — no native canvas.
 * Motif: dark teal panel + green candlestick / pulse.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'build', 'icons');
fs.mkdirSync(outDir, { recursive: true });

function drawIcon(size) {
  const png = new PNG({ width: size, height: size });
  const bg = [10, 22, 28, 255];
  const teal = [13, 148, 136, 255];
  const green = [61, 214, 140, 255];
  const red = [240, 113, 120, 255];
  const muted = [30, 48, 58, 255];

  const set = (x, y, rgba) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (size * y + x) << 2;
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  };

  const fillRect = (x0, y0, w, h, rgba) => {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) set(x, y, rgba);
  };

  // rounded-ish dark background
  fillRect(0, 0, size, size, bg);
  const margin = Math.floor(size * 0.08);
  fillRect(margin, margin, size - margin * 2, size - margin * 2, muted);

  // candlesticks
  const candles = [
    { x: 0.22, open: 0.62, close: 0.45, high: 0.38, low: 0.70, up: true },
    { x: 0.38, open: 0.45, close: 0.55, high: 0.40, low: 0.62, up: false },
    { x: 0.54, open: 0.55, close: 0.35, high: 0.28, low: 0.60, up: true },
    { x: 0.70, open: 0.35, close: 0.28, high: 0.22, low: 0.42, up: true },
  ];
  const bodyW = Math.max(2, Math.floor(size * 0.08));
  for (const c of candles) {
    const cx = Math.floor(size * c.x);
    const yOpen = Math.floor(size * c.open);
    const yClose = Math.floor(size * c.close);
    const yHigh = Math.floor(size * c.high);
    const yLow = Math.floor(size * c.low);
    const color = c.up ? green : red;
    // wick
    fillRect(cx, yHigh, Math.max(1, Math.floor(size * 0.015)), yLow - yHigh, color);
    // body
    const top = Math.min(yOpen, yClose);
    const h = Math.max(2, Math.abs(yClose - yOpen));
    fillRect(cx - Math.floor(bodyW / 2), top, bodyW, h, color);
  }

  // pulse line accent
  const pulseY = Math.floor(size * 0.78);
  for (let x = margin; x < size - margin; x++) {
    const t = (x - margin) / (size - margin * 2);
    const bump = Math.sin(t * Math.PI * 3) * size * 0.04;
    set(x, Math.floor(pulseY - bump), teal);
    set(x, Math.floor(pulseY - bump) + 1, teal);
  }

  return png;
}

function writePng(file, size) {
  const png = drawIcon(size);
  const buf = PNG.sync.write(png);
  fs.writeFileSync(file, buf);
  console.log('wrote', file, size);
}

const sizes = [16, 32, 48, 64, 128, 256, 512, 1024];
for (const s of sizes) {
  writePng(path.join(outDir, `${s}x${s}.png`), s);
}
writePng(path.join(outDir, 'icon.png'), 512);
writePng(path.join(outDir, 'tray.png'), 32);
writePng(path.join(root, 'build', 'icon.png'), 512);

// Minimal ICO (PNG-in-ICO for modern Windows) using 16+32+48+256
function writeIco(file, pngSizes) {
  const images = pngSizes.map((s) => {
    const png = drawIcon(s);
    const data = PNG.sync.write(png);
    return { s, data };
  });
  const headerSize = 6 + 16 * images.length;
  let offset = headerSize;
  const entries = [];
  for (const img of images) {
    entries.push({
      width: img.s >= 256 ? 0 : img.s,
      height: img.s >= 256 ? 0 : img.s,
      size: img.data.length,
      offset,
    });
    offset += img.data.length;
  }
  const buf = Buffer.alloc(offset);
  buf.writeUInt16LE(0, 0);
  buf.writeUInt16LE(1, 2);
  buf.writeUInt16LE(images.length, 4);
  let entryOff = 6;
  for (const e of entries) {
    buf.writeUInt8(e.width, entryOff);
    buf.writeUInt8(e.height, entryOff + 1);
    buf.writeUInt8(0, entryOff + 2);
    buf.writeUInt8(0, entryOff + 3);
    buf.writeUInt16LE(1, entryOff + 4);
    buf.writeUInt16LE(32, entryOff + 6);
    buf.writeUInt32LE(e.size, entryOff + 8);
    buf.writeUInt32LE(e.offset, entryOff + 12);
    entryOff += 16;
  }
  let dataOff = headerSize;
  for (const img of images) {
    img.data.copy(buf, dataOff);
    dataOff += img.data.length;
  }
  fs.writeFileSync(file, buf);
  console.log('wrote', file);
}

writeIco(path.join(root, 'build', 'icon.ico'), [16, 32, 48, 256]);
console.log('icons done');
