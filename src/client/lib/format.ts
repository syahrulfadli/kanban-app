/* Tanggal selalu tiba dari API sebagai string ISO (JSON tidak punya tipe
   tanggal), tapi state optimistik di klien masih memegang objek Date. Semua
   pemformat di sini menerima keduanya. */

type Stamp = string | number | Date;

const toDate = (value: Stamp) => (value instanceof Date ? value : new Date(value));

const absolute = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const shortDate = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" });

/** "2 Sep 2026, 17.40" — dipakai di tooltip dan baris jejak waktu. */
export const formatDateTime = (value: Stamp) => absolute.format(toDate(value));

/* Dua pemformat, dan pemilihannya ada di formatRelative.

   `auto` yang memberi "kemarin" — dan itu memang yang diinginkan untuk satu
   hari. Tapi ia juga punya kata sendiri untuk dua hari ("kemarin dulu") dan
   tiga hari, dan kata-kata itu justru lebih lambat dibaca daripada angkanya:
   orang harus menghitung dulu sebelum tahu itu berapa hari. Jadi mulai dua,
   yang dipakai bentuk berangka. */
const relative = new Intl.RelativeTimeFormat("id", { numeric: "auto" });
const counted = new Intl.RelativeTimeFormat("id", { numeric: "always" });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

/**
 * "3 menit lalu", "kemarin". Di bawah satu menit dibulatkan jadi "baru saja" —
 * "0 detik lalu" tidak memberi tahu apa pun.
 *
 * Lewat sepekan diganti tanggal: pada titik itu jarak relatif berhenti
 * bermakna dan orang lebih ingin tahu tanggal persisnya.
 */
export function formatRelative(value: Stamp): string {
  const date = toDate(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);

  if (abs < 60_000) return "baru saja";
  if (abs > 7 * 24 * 3600_000) return shortDate.format(date);

  /* Dipotong, bukan dibulatkan: yang dihitung satuan yang sudah LEWAT.
     Dibulatkan, sesuatu dari kemarin sore melompat jadi dua hari begitu
     umurnya melewati satu setengah hari — padahal tanggalnya masih kemarin. */
  for (const [unit, ms] of UNITS) {
    if (abs < ms) continue;

    const count = Math.trunc(diff / ms);
    return (Math.abs(count) === 1 ? relative : counted).format(count, unit);
  }

  return "baru saja";
}
