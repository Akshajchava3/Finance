/**
 * Run once: node make-icons.js
 * Creates icon16.png, icon48.png, icon128.png using only Node built-ins.
 */
const zlib = require('zlib');
const fs   = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xFF];
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([l, t, data, c]);
}

function makePNG(size, drawFn) {
  const pixels = Buffer.alloc(size * size * 4, 0);
  drawFn(pixels, size);

  const rows = [];
  for (let y = 0; y < size; y++) {
    const filter = Buffer.alloc(1); // filter byte = 0 (None)
    const row    = pixels.slice(y * size * 4, (y + 1) * size * 4);
    rows.push(Buffer.concat([filter, row]));
  }
  const raw        = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 9 });

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]), // PNG sig
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function setPixel(buf, size, x, y, r, g, b, a = 255) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const i = (y * size + x) * 4;
  buf[i] = r; buf[i+1] = g; buf[i+2] = b; buf[i+3] = a;
}

function drawIcon(pixels, size) {
  const cx = size / 2, cy = size / 2;
  const outerR = size * 0.44;
  const innerR = size * 0.22;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Outer circle — indigo/purple gradient
      if (dist <= outerR) {
        // Simple radial blend: indigo (#818cf8) center → purple (#7c3aed) edge
        const t = dist / outerR;
        const r = Math.round(0x81 + t * (0x7c - 0x81));
        const g = Math.round(0x8c + t * (0x3a - 0x8c));
        const b = Math.round(0xf8 + t * (0xed - 0xf8));
        setPixel(pixels, size, x, y, r, g, b, 255);
      }

      // Inner bean shape — white "🫘" approximation as an oval
      const beanX = dx / (outerR * 0.35);
      const beanY = (dy - size * 0.02) / (outerR * 0.5);
      if (beanX * beanX + beanY * beanY <= 1) {
        const alpha = Math.round(255 * (1 - (beanX * beanX + beanY * beanY) * 0.4));
        setPixel(pixels, size, x, y, 255, 255, 255, alpha);
      }
    }
  }
}

for (const size of [16, 48, 128]) {
  const png = makePNG(size, drawIcon);
  const out = path.join(__dirname, `icon${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`✓ icon${size}.png  (${png.length} bytes)`);
}
console.log('Done — icons ready.');
