import { backgroundSrc } from "./background";

/**
 * Warna teks yang menempel langsung di atas foto latar.
 *
 * Kepala papan dan barisan kredit di kaki halaman tidak duduk di atas pelat
 * kaca — mereka duduk di atas fotonya. Selama kabut menyala itu tidak jadi
 * soal: yang di bawah teks sudah hampir seluruhnya warna tema. Begitu kabutnya
 * dimatikan, tinta tema bertemu foto sembarang, dan sebuah papan yang indah
 * bisa berakhir dengan breadcrumb yang tidak bisa dibaca.
 *
 * Jadi fotonya diukur. Bukan seluruhnya — melainkan tepat di petak tempat
 * teksnya berdiri, karena satu foto bisa terang di atas dan gelap di bawah,
 * dan satu jawaban untuk seluruh layar akan salah di salah satu ujungnya.
 */

/** Tinta terang dan tinta gelap yang dipakai di atas foto. Sama dengan CSS. */
const INK = {
  light: { hex: "#F7F9FC", luminance: 0.93 },
  dark: { hex: "#0B1220", luminance: 0.012 },
} as const;

export type BackdropInk = "light" | "dark";

/**
 * Tiga jawaban, bukan satu.
 *
 * Kepala papan punya dua ujung yang bisa berdiri di atas bagian foto yang
 * sangat berbeda — breadcrumb di kiri, chip di kanan — dan satu jawaban untuk
 * keduanya akan salah di salah satunya setiap kali fotonya tidak rata.
 */
export interface BackdropInks {
  /** Breadcrumb, di kiri atas. */
  top: BackdropInk;
  /** Chip latar dan penanda kanal, di kanan atas. */
  topEnd: BackdropInk;
  /** Kredit foto dan kredit pembuat, di kiri bawah dan tengah bawah. */
  bottom: BackdropInk;
}

/* Kabut yang digambar di atas foto — nilainya harus sama dengan
   `.board-bg[data-kind="image"]::after` di index.css. Kalau salah satunya
   berubah, ubah keduanya: yang dihitung di sini adalah apa yang benar-benar
   terlihat, bukan fotonya saja. */
const SCRIM = {
  light: { luminance: 0.885, alpha: 0.66 },
  dark: { luminance: 0.0025, alpha: 0.68 },
} as const;

/** Lebar contoh yang ditarik dari CDN. Cukup untuk rata-rata, tidak lebih. */
const SAMPLE_WIDTH = 48;

/** Seberapa tinggi petak yang diperiksa, sebagai pecahan tinggi yang terlihat. */
const BAND = 0.16;

/* Foto dibaca sebagai dua jalur tegak, bukan satu bidang: breadcrumb dan
   kredit berlabuh di kiri, chip di kanan, dan sebuah foto boleh gelap di satu
   sisi dan terang di sisi lain. Rata-rata selebar layar akan meleset di
   kedua-duanya sekaligus. Jalurnya sengaja lebih sempit dari separuh — bagian
   tengah tidak pernah ada teks di atasnya, dan memasukkannya cuma menumpulkan
   dua jawaban yang seharusnya tajam. */
const SIDE_FRACTION = 0.42;

/** Luminansi relatif satu warna sRGB (WCAG 2.x). */
function channel(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

const luminance = (r: number, g: number, b: number) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

const contrast = (a: number, b: number) =>
  (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/**
 * Profil satu foto: luminansi rata-rata sisi kirinya, baris demi baris.
 *
 * Sengaja disimpan sebagai profil per baris, bukan sebagai jawaban jadi:
 * jawabannya bergantung pada bentuk jendela (yang menentukan bagian mana dari
 * foto yang terlihat), pada kabutnya, dan pada temanya — ketiganya bisa
 * berubah tanpa fotonya berganti. Dengan profil, perubahan itu cuma
 * penjumlahan ulang beberapa puluh angka, bukan perjalanan ke jaringan.
 */
export interface BackdropProfile {
  /** Luminansi rata-rata tiap baris di jalur kiri, dari atas ke bawah. */
  left: Float64Array;
  /** Hal yang sama untuk jalur kanan. */
  right: Float64Array;
  /** Rasio lebar terhadap tinggi — dipakai menghitung potongan `cover`. */
  aspect: number;
}

const cache = new Map<string, Promise<BackdropProfile | null>>();

async function measure(url: string): Promise<BackdropProfile | null> {
  const image = new Image();
  /* Tanpa ini kanvasnya ternoda dan `getImageData` melempar. CDN Unsplash
     mengirim `access-control-allow-origin: *`, jadi permintaannya lolos. */
  image.crossOrigin = "anonymous";
  image.src = backgroundSrc(url, SAMPLE_WIDTH);

  try {
    await image.decode();
  } catch {
    // Gambar gagal dimuat, atau CORS-nya ditolak. Tanpa ukuran, pemanggilnya
    // jatuh ke tinta tema — persis seperti sebelum fitur ini ada.
    return null;
  }

  const width = image.naturalWidth || SAMPLE_WIDTH;
  const height = image.naturalHeight || SAMPLE_WIDTH;
  if (!width || !height) return null;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(image, 0, 0, width, height);

  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, width, height).data;
  } catch {
    // Kanvas ternoda — CORS-nya ditolak setelah gambarnya terlanjur dimuat.
    return null;
  }

  const span = Math.max(1, Math.round(width * SIDE_FRACTION));
  const left = new Float64Array(height);
  const right = new Float64Array(height);

  for (let y = 0; y < height; y++) {
    let sumLeft = 0;
    let sumRight = 0;

    for (let i = 0; i < span; i++) {
      const a = (y * width + i) * 4;
      sumLeft += luminance(data[a], data[a + 1], data[a + 2]);

      const b = (y * width + (width - 1 - i)) * 4;
      sumRight += luminance(data[b], data[b + 1], data[b + 2]);
    }

    left[y] = sumLeft / span;
    right[y] = sumRight / span;
  }

  return { left, right, aspect: width / height };
}

/** Profil foto ini, ditarik sekali lalu disimpan selama halaman terbuka. */
export function backdropProfile(url: string): Promise<BackdropProfile | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = measure(url);
    cache.set(url, pending);
  }
  return pending;
}

/** Rata-rata luminansi baris antara dua pecahan tinggi foto. */
function band(rows: Float64Array, from: number, to: number): number {
  const first = Math.max(0, Math.floor(from * rows.length));
  const last = Math.min(rows.length, Math.max(first + 1, Math.ceil(to * rows.length)));

  let total = 0;
  for (let y = first; y < last; y++) total += rows[y];
  return total / (last - first);
}

interface InkOptions {
  /** Lebar dibagi tinggi jendela — yang menentukan potongan `cover`. */
  viewport: number;
  overlay: boolean;
  theme: "light" | "dark";
}

/**
 * Tinta untuk kepala dan kaki halaman, dihitung dari profil.
 *
 * Murni dan sinkron: jendela yang berubah ukuran atau kabut yang dimatikan
 * cukup memanggilnya lagi.
 */
export function inkFor(
  profile: BackdropProfile,
  { viewport, overlay, theme }: InkOptions,
): BackdropInks {
  /* `background-size: cover` memotong. Kalau jendelanya lebih lebar daripada
     fotonya, fotonya diskalakan mengikuti lebar dan yang terpotong adalah atas
     dan bawahnya — justru dua petak yang sedang ditanyakan di sini. Tanpa
     hitungan ini, "bagian atas foto" yang diukur bukan bagian atas yang
     dilihat orang. */
  const visible = viewport > profile.aspect ? profile.aspect / viewport : 1;
  const start = (1 - visible) / 2;
  const end = start + visible;

  const scrim = SCRIM[theme];
  const blend = (value: number) =>
    overlay ? value * (1 - scrim.alpha) + scrim.luminance * scrim.alpha : value;

  const pick = (value: number): BackdropInk => {
    const backdrop = blend(value);
    return contrast(backdrop, INK.dark.luminance) >= contrast(backdrop, INK.light.luminance)
      ? "dark"
      : "light";
  };

  const topFrom = start;
  const topTo = start + visible * BAND;
  const bottomFrom = end - visible * BAND;

  return {
    top: pick(band(profile.left, topFrom, topTo)),
    topEnd: pick(band(profile.right, topFrom, topTo)),
    bottom: pick(band(profile.left, bottomFrom, end)),
  };
}
