/**
 * Pemformat tanggal yang dipakai kedua sisi.
 *
 * Ada di sini, bukan di klien saja, karena kalimat notifikasi yang menyebut
 * tenggat disusun di server — dan kalimat itu harus terbaca sama persis
 * dengan tanggal yang tertulis di kartunya.
 */

type Stamp = string | number | Date;

const toDate = (value: Stamp) => (value instanceof Date ? value : new Date(value));

/**
 * Zona waktu yang dipakai server saat menulis tanggal ke dalam kalimat.
 *
 * Worker berjalan di UTC — tanpa ini sebuah tenggat pukul tujuh malam akan
 * dikabarkan sebagai pukul dua siang, dan orang yang membacanya di layar kunci
 * tidak punya cara untuk tahu bahwa yang keliru cuma zonanya. Klien tidak
 * memakainya: peramban tahu zona pembacanya sendiri, dan itu selalu jawaban
 * yang lebih benar.
 */
export const APP_TIME_ZONE = "Asia/Jakarta";

/* Satu Intl.DateTimeFormat per zona, dibuat sekali. Merakitnya termasuk
   pekerjaan yang mahal, dan lini masa memanggil pemformat ini sekali per
   baris. */
const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string | undefined, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone ?? "local"}|${options.hour ? "long" : "short"}`;
  let found = cache.get(key);
  if (!found) cache.set(key, (found = new Intl.DateTimeFormat("id-ID", { ...options, timeZone })));
  return found;
}

/** "2 Sep 2026, 17.40" — bentuk panjang, dipakai tooltip dan kalimat kejadian. */
export const formatStamp = (value: Stamp, timeZone?: string) =>
  formatter(timeZone, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(toDate(value));

/** "2 Sep" — bentuk pendek untuk tempat sesempit muka kartu. */
export const formatDay = (value: Stamp, timeZone?: string) =>
  formatter(timeZone, { day: "numeric", month: "short" }).format(toDate(value));
