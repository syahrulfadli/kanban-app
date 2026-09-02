import type { CSSProperties } from "react";
import type { LabelColor } from "../../shared/types";

/* Inisial dari nama: dua kata pertama, atau dua huruf pertama kalau namanya
   satu kata. Jatuh ke email bila nama kosong, dan ke "?" bila keduanya kosong. */
export function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.split("@")[0] || "";
  const words = source.split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Rona label dipasang sebagai custom property, bukan kelas Tailwind: kelasnya
 * harus dirakit dari nama warna saat runtime, dan Tailwind hanya melihat
 * kelas yang tertulis utuh di sumber. Nilainya menunjuk ke token tema, jadi
 * chip yang sama otomatis menyesuaikan diri di terang maupun gelap.
 */
export const labelTint = (color: LabelColor) =>
  ({ "--label": `var(--label-${color})` }) as CSSProperties;
