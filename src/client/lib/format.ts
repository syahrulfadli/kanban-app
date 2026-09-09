/* Tanggal selalu tiba dari API sebagai string ISO (JSON tidak punya tipe
   tanggal), tapi state optimistik di klien masih memegang objek Date. Semua
   pemformat di sini menerima keduanya. */

import { formatDay as formatDaySrc, formatStamp } from "../../shared/datetime";
import type { Language } from "../hooks/useLanguage";
import type { Translations } from "../i18n/id";

type Stamp = string | number | Date;

const toDate = (value: Stamp) => (value instanceof Date ? value : new Date(value));

/* Bentuk panjang dan pendeknya tinggal di src/shared: kalimat notifikasi yang
   menyebut tenggat disusun di server, dan ia harus memformat tanggal yang sama
   persis seperti yang tertulis di kartunya — server selalu memakai localenya
   sendiri (id-ID), jadi hanya sisi klien di sini yang perlu menyebut locale
   dari bahasa yang sedang aktif. Keduanya dipanggil tanpa zona, jadi yang
   dipakai zona perambannya sendiri. */
const localeOf = (language: Language) => (language === "id" ? "id-ID" : "en-US");

export const formatDay = (value: Stamp, language: Language) =>
  formatDaySrc(value, undefined, localeOf(language));

/** "2 Sep 2026, 17.40" — dipakai di tooltip dan baris jejak waktu. */
export const formatDateTime = (value: Stamp, language: Language) =>
  formatStamp(value, undefined, localeOf(language));

/* Satu pasang pemformat relatif per bahasa, dirakit sekali dan disimpan —
   merakitnya termasuk pekerjaan yang mahal, dan lini masa memanggilnya
   sekali per baris.

   `auto` yang memberi "kemarin" — dan itu memang yang diinginkan untuk satu
   hari. Tapi ia juga punya kata sendiri untuk dua hari ("kemarin dulu") dan
   tiga hari, dan kata-kata itu justru lebih lambat dibaca daripada angkanya:
   orang harus menghitung dulu sebelum tahu itu berapa hari. Jadi mulai dua,
   yang dipakai bentuk berangka. */
const relativeCache = new Map<Language, { auto: Intl.RelativeTimeFormat; counted: Intl.RelativeTimeFormat }>();

function relativeFormatters(language: Language) {
  let found = relativeCache.get(language);
  if (!found) {
    const locale = language === "id" ? "id" : "en";
    found = {
      auto: new Intl.RelativeTimeFormat(locale, { numeric: "auto" }),
      counted: new Intl.RelativeTimeFormat(locale, { numeric: "always" }),
    };
    relativeCache.set(language, found);
  }
  return found;
}

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
export function formatRelative(value: Stamp, language: Language, t: Translations): string {
  const date = toDate(value);
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);

  if (abs < 60_000) return t.format.justNow;
  if (abs > 7 * 24 * 3600_000) return formatDay(date, language);

  /* Dipotong, bukan dibulatkan: yang dihitung satuan yang sudah LEWAT.
     Dibulatkan, sesuatu dari kemarin sore melompat jadi dua hari begitu
     umurnya melewati satu setengah hari — padahal tanggalnya masih kemarin. */
  const { auto, counted } = relativeFormatters(language);
  for (const [unit, ms] of UNITS) {
    if (abs < ms) continue;

    const count = Math.trunc(diff / ms);
    return (Math.abs(count) === 1 ? auto : counted).format(count, unit);
  }

  return t.format.justNow;
}

/* ── Tenggat ──────────────────────────────────────────────────────
   Tanggal yang dibaca berbeda dari jejak waktu: yang ditanyakan orang bukan
   "kapan ini terjadi" melainkan "masih ada waktu atau tidak". */

/**
 * Seberapa mendesak sebuah tenggat — inilah yang menentukan ronanya.
 *
 * `"done"` berdiri di luar ketiga lainnya: ia tidak diukur dari jam, tapi
 * dinyatakan orang, dan begitu dinyatakan tanggalnya berhenti menuntut apa
 * pun. Karena itu ia menang atas "sudah lewat".
 */
export type DueState = "done" | "overdue" | "soon" | "later";

/* Sehari. Bukan angka yang dihitung dari apa pun — ia sekadar batas antara
   "besok-besok" dan "hari ini juga", dan di situlah orang mulai memindahkan
   kartunya ke atas tumpukan. */
const SOON_MS = 24 * 3600_000;

export function dueState(value: Stamp, doneAt?: Stamp | null): DueState {
  if (doneAt) return "done";

  const diff = toDate(value).getTime() - Date.now();
  if (diff < 0) return "overdue";
  return diff < SOON_MS ? "soon" : "later";
}

/**
 * Tenggat sependek mungkin untuk muka kartu: jamnya saja kalau jatuh hari ini,
 * tanggalnya kalau tidak.
 *
 * Yang dibuang selalu bagian yang sudah diketahui pembacanya — orang yang
 * melihat "17.00" di papan tahu itu hari ini, dan "8 Sep" pukul berapa pun
 * masih terbaca sebagai hari yang sama.
 */
const shortTimeCache = new Map<Language, Intl.DateTimeFormat>();

function shortTime(language: Language) {
  let found = shortTimeCache.get(language);
  if (!found) {
    found = new Intl.DateTimeFormat(localeOf(language), { hour: "2-digit", minute: "2-digit" });
    shortTimeCache.set(language, found);
  }
  return found;
}

export function formatDueShort(value: Stamp, language: Language): string {
  const date = toDate(value);
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  return sameDay ? shortTime(language).format(date) : formatDay(date, language);
}
