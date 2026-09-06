import { backgroundSrc } from "./background";

/**
 * Warna teks yang menempel langsung di atas foto latar.
 *
 * Kepala papan, kepala kolom yang tidak diberi warna, kapsul navigasi, dan
 * barisan kredit di kaki halaman tidak duduk di atas pelat kaca yang pekat —
 * mereka duduk di atas fotonya, langsung atau lewat kaca yang nyaris tembus.
 * Kabut yang digambar di atas foto membantu, tapi tidak pernah menghapus
 * fotonya — kabut tema terang di sini cuma abu-abu 23%, jadi foto gelap
 * dengan kabut menyala tetap butuh tinta terang, bukan tinta tema begitu saja.
 *
 * Jadi fotonya diukur. Bukan seluruhnya — melainkan tepat di petak tempat
 * teksnya berdiri, karena satu foto bisa terang di atas dan gelap di bawah,
 * terang di kiri dan gelap di kanan, dan satu jawaban untuk seluruh layar
 * akan salah di salah satu ujungnya.
 */

/** Tinta terang dan tinta gelap yang dipakai di atas foto. Sama dengan CSS. */
const INK = {
  light: { hex: "#F7F9FC", luminance: 0.93 },
  dark: { hex: "#0B1220", luminance: 0.012 },
} as const;

export type BackdropInk = "light" | "dark";

/**
 * Lima jawaban, bukan satu — satu untuk tiap tempat teks berdiri di atas foto.
 *
 * Kepala papan punya dua ujung yang bisa berdiri di atas bagian foto yang
 * sangat berbeda — breadcrumb di kiri, chip di kanan. Kaki halaman punya dua
 * pula: kredit foto berlabuh di kiri, kapsul navigasi dan kredit pembuat
 * mengambang di tengah. Dan kepala kolom bisa berdiri di titik mana pun
 * secara mendatar — papan boleh digulir, dan fotonya sendiri tidak ikut
 * bergeser (lihat `.board-bg { position: fixed }`) — jadi yang dipakai di
 * sana rata-rata seluruh lebar yang TERLIHAT, bukan satu sisi.
 */
export interface BackdropInks {
  /** Breadcrumb, di kiri atas. */
  top: BackdropInk;
  /** Chip latar dan penanda kanal, di kanan atas. */
  topEnd: BackdropInk;
  /** Kredit foto, di kiri bawah. */
  bottomStart: BackdropInk;
  /** Kapsul navigasi dan kredit pembuat, di tengah bawah. */
  bottomCenter: BackdropInk;
  /** Judul, chip hitung, dan tombol di kepala kolom yang tidak diberi warna. */
  columns: BackdropInk;
}

/* Kabut yang digambar di atas foto — nilainya harus sama dengan
   `.board-bg[data-kind="image"]::after` di index.css. Kalau salah satunya
   berubah, ubah keduanya: yang dihitung di sini adalah apa yang benar-benar
   terlihat, bukan fotonya saja.

   Kabut tema terang jauh lebih tipis daripada yang tema gelap pakai (abu-abu
   23%, bukan nyaris putih) — itu sengaja, foto siang hari butuh kabut yang
   ringan supaya tidak jadi kabur. Konsekuensinya: foto gelap yang kabutnya
   menyala di tema terang TETAP gelap, hanya sedikit terangkat — dan tintanya
   harus tetap ikut berubah jadi terang di sana, bukan diam di gelap karena
   mengira kabut sudah cukup mencuci warnanya. */
const SCRIM = {
  light: { luminance: 0.2831, alpha: 0.23 },
  dark: { luminance: 0.0021, alpha: 0.68 },
} as const;

/** Lebar contoh yang ditarik dari CDN. Cukup untuk rata-rata, tidak lebih. */
const SAMPLE_WIDTH = 48;

/** Seberapa tinggi petak atas/bawah yang diperiksa, sebagai pecahan tinggi yang TERLIHAT. */
const BAND = 0.16;

/** Petak kepala kolom: mulai persis di bawah petak kepala papan. */
const COLUMN_BAND: readonly [number, number] = [BAND, BAND + 0.24];

/* Jalur mendatar, sebagai pecahan LEBAR YANG TERLIHAT — bukan lebar foto
   mentah. Breadcrumb dan kredit foto berlabuh di kiri, chip di kanan, kapsul
   navigasi dan kredit pembuat di tengah, dan jalur sisi sengaja lebih sempit
   dari separuh: masing-masing mewakili tempat teksnya benar-benar berdiri,
   bukan rata-rata yang menumpulkan semuanya jadi satu jawaban yang aman. */
const SIDE_FRACTION = 0.42;
const CENTER_FRACTION = 0.34;

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
 * Profil satu foto: luminansi tiap piksel dari cuplikan kecilnya, apa adanya.
 *
 * Sengaja disimpan mentah — bukan sebagai rata-rata per jalur yang sudah
 * dihitung di muka — karena jalur mana yang relevan bergantung pada bentuk
 * JENDELA (`background-size: cover` bisa memotong tepi atas-bawah ATAU
 * kiri-kanan, tergantung mana yang lebih "kurus" dari fotonya), dan bentuk
 * jendela bisa berubah kapan saja tanpa fotonya ikut berganti. Dengan data
 * mentah, perubahan bentuk jendela cuma menjumlah ulang beberapa ratus
 * angka yang sudah ada, bukan perjalanan ke jaringan.
 */
export interface BackdropProfile {
  /** Luminansi tiap piksel, baris demi baris (indeks = y * width + x). */
  lum: Float64Array;
  width: number;
  height: number;
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

  const lum = new Float64Array(width * height);
  for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
    lum[i] = luminance(data[p], data[p + 1], data[p + 2]);
  }

  return { lum, width, height, aspect: width / height };
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

/**
 * Rata-rata luminansi di dalam persegi panjang, dalam koordinat foto 0..1.
 * Batasnya dijepit ke dalam foto — pemanggil boleh menghitung tepi yang
 * meleset sedikit karena pembulatan tanpa perlu memeriksanya sendiri.
 */
function regionAverage(
  profile: BackdropProfile,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number {
  const { lum, width, height } = profile;
  const px0 = Math.min(width - 1, Math.max(0, Math.floor(x0 * width)));
  const px1 = Math.min(width, Math.max(px0 + 1, Math.ceil(x1 * width)));
  const py0 = Math.min(height - 1, Math.max(0, Math.floor(y0 * height)));
  const py1 = Math.min(height, Math.max(py0 + 1, Math.ceil(y1 * height)));

  let total = 0;
  let count = 0;
  for (let y = py0; y < py1; y++) {
    const row = y * width;
    for (let x = px0; x < px1; x++) {
      total += lum[row + x];
      count++;
    }
  }
  return total / count;
}

interface InkOptions {
  /** Lebar dibagi tinggi jendela — yang menentukan potongan `cover`. */
  viewport: number;
  overlay: boolean;
  theme: "light" | "dark";
}

/**
 * Tinta untuk kepala, kaki, dan kepala kolom, dihitung dari profil.
 *
 * Murni dan sinkron: jendela yang berubah ukuran atau kabut yang dimatikan
 * cukup memanggilnya lagi. `overlay` cuma melunakkan jawabannya — mencampur
 * sedikit ke arah kabut — bukan mematikan pengukuran fotonya: kabut tema
 * terang begitu tipis (23%) sehingga hampir tidak menggeser jawabannya sama
 * sekali, dan bahkan kabut tema gelap yang tebal (68%) masih menyisakan
 * cukup rentang untuk foto yang benar-benar terang membalik jawabannya.
 */
export function inkFor(
  profile: BackdropProfile,
  { viewport, overlay, theme }: InkOptions,
): BackdropInks {
  /* `background-size: cover` memotong SATU sumbu — mana yang kena tergantung
     mana yang "lebih kurus" antara jendela dan fotonya. Jendela yang lebih
     landai dari fotonya (viewport lebih lebar per tingginya) memotong ATAS
     dan BAWAH dan menampilkan seluruh lebar; jendela yang lebih jangkung
     (potret di ponsel, misalnya) memotong KIRI dan KANAN dan menampilkan
     seluruh tinggi. Keduanya tidak pernah terpotong sekaligus.

     Tanpa cabang keduanya, jalur kiri/kanan yang dihitung dari lebar FOTO
     mentah salah total di jendela sempit: yang sedang dibaca "kiri" dan
     "kanan" bisa jadi dua potongan yang sama-sama sudah lenyap dari layar,
     sementara yang benar-benar tampak — sepotong sempit di tengah — tidak
     pernah disentuh sama sekali. */
  let vFrom: number, vTo: number, hFrom: number, hTo: number;

  if (viewport > profile.aspect) {
    const visible = profile.aspect / viewport;
    vFrom = (1 - visible) / 2;
    vTo = vFrom + visible;
    hFrom = 0;
    hTo = 1;
  } else {
    const visible = viewport / profile.aspect;
    vFrom = 0;
    vTo = 1;
    hFrom = (1 - visible) / 2;
    hTo = hFrom + visible;
  }

  const vSpan = vTo - vFrom;
  const hSpan = hTo - hFrom;

  const scrim = SCRIM[theme];
  const blend = (value: number) =>
    overlay ? value * (1 - scrim.alpha) + scrim.luminance * scrim.alpha : value;

  const pick = (value: number): BackdropInk => {
    const backdrop = blend(value);
    return contrast(backdrop, INK.dark.luminance) >= contrast(backdrop, INK.light.luminance)
      ? "dark"
      : "light";
  };

  const topFrom = vFrom;
  const topTo = vFrom + vSpan * BAND;
  const bottomFrom = vTo - vSpan * BAND;
  const columnsFrom = vFrom + vSpan * COLUMN_BAND[0];
  const columnsTo = vFrom + vSpan * COLUMN_BAND[1];

  const sideWidth = hSpan * SIDE_FRACTION;
  const centerWidth = hSpan * CENTER_FRACTION;
  const centerFrom = hFrom + (hSpan - centerWidth) / 2;

  return {
    top: pick(regionAverage(profile, hFrom, hFrom + sideWidth, topFrom, topTo)),
    topEnd: pick(regionAverage(profile, hTo - sideWidth, hTo, topFrom, topTo)),
    bottomStart: pick(regionAverage(profile, hFrom, hFrom + sideWidth, bottomFrom, vTo)),
    bottomCenter: pick(
      regionAverage(profile, centerFrom, centerFrom + centerWidth, bottomFrom, vTo),
    ),
    columns: pick(regionAverage(profile, hFrom, hTo, columnsFrom, columnsTo)),
  };
}
