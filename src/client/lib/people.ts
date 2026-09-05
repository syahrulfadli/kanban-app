import type { CSSProperties } from "react";
import type { ColumnColor, LabelColor, UserBrief } from "../../shared/types";

/* Inisial dari nama: dua kata pertama, atau dua huruf pertama kalau namanya
   satu kata. Jatuh ke email bila nama kosong, dan ke "?" bila keduanya kosong. */
export function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ── Rona avatar ──────────────────────────────────────────────────
   Dua belas sudut rona, dipilih memutar penuh dan dijarakkan cukup jauh
   supaya dua orang yang duduk bersebelahan di satu kartu tidak pernah
   mendapat warna yang harus dibandingkan dulu sebelum bisa dibedakan.
   Yang ditentukan hanya sudutnya; terang dan kroma dikunci di index.css,
   jadi seluruh palet ini otomatis punya bobot yang sama — dan ikut
   berbalik sendiri di tema gelap. */
const AVATAR_HUES = [18, 48, 82, 118, 148, 172, 196, 224, 258, 292, 322, 348];

/**
 * Warna avatar untuk orang yang belum memasang foto, diturunkan dari
 * inisialnya.
 *
 * Sengaja dari inisial, bukan dari id atau email: yang dilihat orang di
 * dalam lingkaran itu memang hurufnya, jadi "SF" berwarna sama di mana pun
 * ia muncul — di kartu, di lini masa, di menu profil — dan warnanya bisa
 * dikenali sebagai milik orang itu. Konsekuensinya dua nama berbeda dengan
 * inisial sama akan berwarna sama; itu memang harga yang dibayar, dan lebih
 * murah daripada satu orang yang berganti warna dari layar ke layar.
 *
 * Urutan hurufnya ikut dihitung (pengali 31 pada setiap putaran), jadi "SF"
 * dan "FS" tidak berbagi warna.
 */
export function avatarTint(name?: string | null, email?: string | null) {
  const seed = initials(name, email);

  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)!) % 100003;

  return { "--avatar-hue": AVATAR_HUES[hash % AVATAR_HUES.length] } as CSSProperties;
}

/**
 * Rona label dipasang sebagai custom property, bukan kelas Tailwind: kelasnya
 * harus dirakit dari nama warna saat runtime, dan Tailwind hanya melihat
 * kelas yang tertulis utuh di sumber. Nilainya menunjuk ke token tema, jadi
 * chip yang sama otomatis menyesuaikan diri di terang maupun gelap.
 */
export const labelTint = (color: LabelColor) =>
  ({ "--label": `var(--label-${color})` }) as CSSProperties;

/**
 * Rona kolom. Palet dan mekanismenya sama dengan label — kolom berwarna dan
 * label berwarna harus terbaca sebagai satu keluarga, bukan dua sistem yang
 * kebetulan bertumpuk di papan yang sama.
 *
 * Custom property-nya sendiri (`--col`, bukan `--label`) karena kartu di dalam
 * kolom membawa chip labelnya masing-masing: satu nama untuk keduanya berarti
 * rona kolom menetes ke setiap chip di dalamnya lewat pewarisan.
 *
 * Null mengembalikan objek kosong, bukan rona netral — aturan CSS-nya
 * bergantung pada `--col` yang benar-benar tidak ada.
 */
export const columnTint = (color: ColumnColor | null) =>
  (color ? { "--col": `var(--label-${color})` } : {}) as CSSProperties;

/**
 * Wajah-wajah di muka kartu: yang diundang dulu, lalu yang meninggalkan jejak.
 *
 * Satu deret, bukan dua, karena dari seberang papan pertanyaannya cuma satu —
 * "kartu ini urusan siapa" — dan dua tumpuk avatar berdampingan memaksa orang
 * mengingat mana yang mana sebelum bisa menjawabnya. Yang diundang berdiri di
 * depan: mereka ditaruh di sana dengan sengaja, sedangkan jejak peserta bisa
 * saja tertinggal dari satu suntingan judul setahun lalu.
 *
 * Orang yang diundang lalu ikut menggarap kartunya muncul sekali, di
 * tempatnya sebagai undangan.
 */
export function cardFaces(members: UserBrief[], participants: UserBrief[]): UserBrief[] {
  if (members.length === 0) return participants;

  const invited = new Set(members.map((person) => person.id));
  return [...members, ...participants.filter((person) => !invited.has(person.id))];
}
