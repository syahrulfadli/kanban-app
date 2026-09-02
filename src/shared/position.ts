/** Jarak default antar item saat membuat item baru di ujung list. */
const STEP = 1024;

/**
 * Hitung posisi untuk item yang disisipkan di antara `before` dan `after`.
 * Keduanya null berarti list kosong.
 */
export function positionBetween(
  before: number | null,
  after: number | null,
): number {
  if (before === null && after === null) return STEP;
  if (before === null) return after! - STEP;
  if (after === null) return before + STEP;
  return (before + after) / 2;
}

/**
 * Presisi float64 habis setelah ~50 kali sisip di celah yang sama.
 * Kalau dua tetangga sudah terlalu rapat, kolomnya perlu di-renumber.
 */
export function needsRebalance(
  before: number | null,
  after: number | null,
): boolean {
  if (before === null || after === null) return false;
  return Math.abs(after - before) < 1e-6;
}

/** Posisi berjarak rata untuk renumber satu kolom penuh. */
export function evenPositions(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * STEP);
}
