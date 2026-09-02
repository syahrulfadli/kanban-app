/**
 * Gambar ulang ikon aplikasi ke public/icons.
 *
 *   node scripts/make-icons.mjs
 *
 * Ikonnya dilukis di sini, bukan diekspor dari alat desain, karena bentuknya
 * memang cuma tiga batang di atas ubin biru — dan dengan begini warnanya
 * dijamin sama dengan token --color-accent di index.css.
 *
 * PNG-nya disusun tangan (IHDR/IDAT/IEND + zlib) supaya tidak ada satu pun
 * dependensi gambar yang perlu dipasang cuma untuk empat berkas statis.
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/icons/", import.meta.url);

/* Biru aksen aplikasi, dari terang di atas ke pekat di bawah. */
const TOP = [14, 165, 233];
const BOTTOM = [2, 132, 199];

/** Tiga kolom kanban: x, lebar, dan tinggi dalam kotak 100×100. */
const BARS = [
  { x: 18, width: 16, height: 52, alpha: 1 },
  { x: 42, width: 16, height: 38, alpha: 0.78 },
  { x: 66, width: 16, height: 44, alpha: 0.56 },
];
const BAR_TOP = 24;
const BAR_RADIUS = 5;

/** Jarak titik ke persegi panjang bersudut bulat; negatif berarti di dalam. */
function roundedRect(px, py, x, y, w, h, r) {
  const dx = Math.abs(px - (x + w / 2)) - (w / 2 - r);
  const dy = Math.abs(py - (y + h / 2)) - (h / 2 - r);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  return outside + Math.min(Math.max(dx, dy), 0) - r;
}

/** Tepi yang dihaluskan: sebaris piksel di perbatasan bentuk jadi separuh isi. */
const coverage = (distance, scale) => Math.min(Math.max(0.5 - distance * scale, 0), 1);

/**
 * @param size sisi gambar dalam piksel
 * @param bleed ikon maskable: latarnya memenuhi kanvas dan gambarnya mengecil,
 *   karena sistem operasi akan memotongnya jadi lingkaran atau kotak sendiri.
 * @param badge lencana notifikasi Android: hanya bentuknya yang dipakai —
 *   sistem mewarnai ulang piksel buramnya, jadi latarnya harus tembus pandang.
 */
function draw(size, { bleed = false, badge = false } = {}) {
  const pixels = Buffer.alloc(size * size * 4);
  // Berapa piksel per satuan kotak 100×100 — dipakai menghaluskan tepi.
  const unit = size / 100;
  // Isi menyusut ke zona aman untuk maskable, dan justru melebar untuk
  // lencana yang tidak punya ubin latar sebagai bingkai.
  const inset = bleed ? 18 : badge ? -12 : 0;
  const scale = (100 - inset * 2) / 100;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Titik tengah piksel, dalam satuan kotak 100×100.
      const u = ((x + 0.5) / size) * 100;
      const v = ((y + 0.5) / size) * 100;

      // Latar: ubin bersudut bulat, seluruh kanvas untuk maskable, atau tidak
      // ada sama sekali untuk lencana.
      const tile = bleed ? -1 : roundedRect(u, v, 0, 0, 100, 100, 22);
      const t = v / 100;

      let alpha = badge ? 0 : coverage(tile, unit);
      let r = badge ? 255 : TOP[0] + (BOTTOM[0] - TOP[0]) * t;
      let g = badge ? 255 : TOP[1] + (BOTTOM[1] - TOP[1]) * t;
      let b = badge ? 255 : TOP[2] + (BOTTOM[2] - TOP[2]) * t;

      // Batang putih di atasnya, dikomposit satu per satu.
      for (const bar of BARS) {
        const bu = (u - 50) / scale + 50;
        const bv = (v - 50) / scale + 50;
        const d = roundedRect(bu, bv, bar.x, BAR_TOP, bar.width, bar.height, BAR_RADIUS);
        const shape = coverage(d, unit * scale);

        // Di lencana yang terbaca cuma bentuknya, jadi ketiga batang sama
        // pekat; di ikon biasa perbedaan opasitasnyalah yang bikin bertumpuk.
        if (badge) {
          alpha = Math.max(alpha, shape);
          continue;
        }

        const a = shape * bar.alpha;
        r += (255 - r) * a;
        g += (255 - g) * a;
        b += (255 - b) * a;
      }

      const i = (y * size + x) * 4;
      pixels[i] = Math.round(r);
      pixels[i + 1] = Math.round(g);
      pixels[i + 2] = Math.round(b);
      pixels[i + 3] = Math.round(alpha * 255);
    }
  }

  return pixels;
}

/* ── Penyusun PNG ────────────────────────────────────────────────── */

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bit per kanal
  ihdr[9] = 6; // RGBA

  // Setiap baris didahului satu bita jenis filter; 0 berarti tanpa filter.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });

const files = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  // Android memotong ikon maskable sesuka bentuk peluncurnya.
  ["maskable-512.png", 512, { bleed: true }],
  // iOS tidak mengenal manifest icon; ia mencari apple-touch-icon, dan
  // membulatkan sudutnya sendiri — jadi versinya yang penuh yang dipakai.
  ["apple-touch-icon.png", 180, { bleed: true }],
  // Lencana di bilah status Android: siluet putih yang diwarnai ulang sistem.
  ["badge-96.png", 96, { badge: true }],
];

for (const [name, size, options] of files) {
  writeFileSync(new URL(name, OUT), encodePng(size, draw(size, options)));
  console.log(`${name} (${size}×${size})`);
}
