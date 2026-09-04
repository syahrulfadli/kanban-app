/**
 * Aturan pencocokan kata kunci — dipakai kedua sisi, dan memang harus sama.
 *
 * Server yang memutuskan kartu mana yang cocok dan memotong cuplikan
 * deskripsinya; klien yang menandai potongan yang cocok di dalam teks itu.
 * Kalau keduanya berbeda pendapat tentang apa yang disebut "cocok", hasil
 * pencarian akan berisi baris tanpa satu pun tanda — kartu yang muncul tanpa
 * alasan yang terbaca.
 */

/** Di bawah ini yang cocok terlalu banyak untuk dibaca sebagai hasil. */
export const MIN_QUERY_LENGTH = 2;

/**
 * Perbandingan tanpa memandang besar-kecil huruf.
 *
 * Sengaja `toLowerCase` biasa, bukan pelipatan Unicode penuh: SQLite pun
 * hanya melakukan ini untuk ASCII, dan hasil pencarian tidak boleh berbeda
 * antara yang disaring server dan yang ditandai klien.
 */
const fold = (text: string) => text.toLowerCase();

/** Posisi kemunculan pertama kata kunci, atau -1. */
export function indexOfQuery(text: string | null | undefined, query: string): number {
  if (!text || !query) return -1;
  return fold(text).indexOf(fold(query));
}

export const matchesQuery = (text: string | null | undefined, query: string): boolean =>
  indexOfQuery(text, query) >= 0;

/** Berapa huruf yang ikut terbawa di kiri dan kanan kata yang cocok. */
const SNIPPET_RADIUS = 70;

/**
 * Potongan deskripsi di sekitar kata yang dicari, atau null kalau tidak ada
 * yang cocok di sana.
 *
 * Barisnya dirapikan jadi satu baris lebih dulu: deskripsi kartu boleh
 * sepanjang lima ribu huruf dengan paragraf dan daftar di dalamnya, sedangkan
 * yang tersedia di hasil pencarian cuma dua baris.
 */
export function snippetAround(
  text: string | null | undefined,
  query: string,
  radius = SNIPPET_RADIUS,
): string | null {
  if (!text) return null;

  const flat = text.replace(/\s+/g, " ").trim();
  const at = indexOfQuery(flat, query);
  if (at < 0) return null;

  const start = Math.max(0, at - radius);
  const end = Math.min(flat.length, at + query.length + radius);

  return `${start > 0 ? "…" : ""}${flat.slice(start, end)}${end < flat.length ? "…" : ""}`;
}

/** Sepotong teks, dan apakah ia bagian yang cocok dengan kata kunci. */
export interface TextPart {
  text: string;
  hit: boolean;
}

/**
 * Pecah teks jadi potongan yang cocok dan yang tidak, supaya klien bisa
 * menandainya tanpa menyusun HTML dari string.
 */
export function splitByQuery(text: string, query: string): TextPart[] {
  const whole = [{ text, hit: false }];
  if (!query) return whole;

  const hay = fold(text);
  const needle = fold(query);

  /* Beberapa huruf berubah panjang saat dikecilkan (misalnya "İ"), dan
     dengan itu setiap potongan sesudahnya akan meleset. Lebih baik tidak
     menandai apa pun daripada menandai bagian yang salah. */
  if (hay.length !== text.length) return whole;

  const parts: TextPart[] = [];
  let from = 0;

  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;

    if (at > from) parts.push({ text: text.slice(from, at), hit: false });
    parts.push({ text: text.slice(at, at + query.length), hit: true });
    from = at + query.length;
  }

  if (parts.length === 0) return whole;
  if (from < text.length) parts.push({ text: text.slice(from), hit: false });

  return parts;
}
