import { cardFaces } from "./people";
import type { BoardDetail } from "../../shared/types";

type CardSummary = BoardDetail["columns"][number]["cards"][number];

/** Tiga kategori jatuh tempo yang bisa disaring — persis yang disepakati di plans.md. */
export type DueFilter = "overdue" | "week" | "none";

export interface BoardFilterState {
  labelIds: Set<string>;
  memberIds: Set<string>;
  createdByIds: Set<string>;
  due: Set<DueFilter>;
}

export const emptyBoardFilter = (): BoardFilterState => ({
  labelIds: new Set(),
  memberIds: new Set(),
  createdByIds: new Set(),
  due: new Set(),
});

export const isBoardFilterActive = (filter: BoardFilterState) =>
  filter.labelIds.size > 0 ||
  filter.memberIds.size > 0 ||
  filter.createdByIds.size > 0 ||
  filter.due.size > 0;

const WEEK_MS = 7 * 24 * 3600_000;

/** Kategori jatuh tempo kartu ini — `null` kalau lewat sepekan dari sekarang (tidak masuk kategori mana pun). */
function dueCategory(card: CardSummary): DueFilter | null {
  if (!card.dueAt) return "none";

  /* Tenggat yang sudah dinyatakan selesai keluar dari ketiga kategori — bukan
     pindah ke "Tanpa tanggal", yang berarti sesuatu yang lain (kartu yang
     belum dijadwalkan sama sekali). Ketiga saringan ini menanyakan pekerjaan
     mana yang masih menagih waktu, dan yang ini sudah tidak. */
  if (card.dueDoneAt) return null;

  const diff = new Date(card.dueAt).getTime() - Date.now();
  if (diff < 0) return "overdue";
  return diff <= WEEK_MS ? "week" : null;
}

/**
 * AND antar kategori (label, orang, dibuat oleh, jatuh tempo), OR di dalam
 * kategori yang sama — persis aturan yang disepakati di plans.md.
 */
export function matchesBoardFilter(card: CardSummary, filter: BoardFilterState): boolean {
  if (filter.labelIds.size > 0 && !card.labels.some((l) => filter.labelIds.has(l.id))) {
    return false;
  }

  /* `cardFaces`, bukan `card.members` saja — sama dengan wajah yang tampil
     di muka kartu, dan sama dengan sumber checklist di `BoardFilter`.
     Memakai `card.members` saja akan membuat orang yang cuma tampil sebagai
     peserta (pernah menyunting, belum tentu diundang) muncul di checklist
     tapi tidak pernah cocok dengan kartu mana pun. */
  if (
    filter.memberIds.size > 0 &&
    !cardFaces(card.members, card.participants).some((m) => filter.memberIds.has(m.id))
  ) {
    return false;
  }

  if (
    filter.createdByIds.size > 0 &&
    (!card.createdBy || !filter.createdByIds.has(card.createdBy))
  ) {
    return false;
  }

  if (filter.due.size > 0) {
    const category = dueCategory(card);
    if (!category || !filter.due.has(category)) return false;
  }

  return true;
}
