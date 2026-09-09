import type { ActivityDetail, ActivityKind, LabelColor } from "./types";
import { APP_TIME_ZONE, formatStamp } from "./datetime";

/**
 * Satu baris lini masa dipecah jadi dua bagian: `verb` yang mengalir sebagai
 * kalimat, dan `subject` yang ditonjolkan. Pemisahan ini yang membuat baris
 * catatan bisa dibaca sekilas — mata menangkap judul atau nama labelnya dulu,
 * bukan kata kerjanya.
 */
export interface ActivityPhrase {
  verb: string;
  subject?: string;
  /** Ada hanya pada catatan label: subjeknya digambar sebagai chip berwarna. */
  color?: LabelColor;
}

/**
 * Bentuk kamus yang dibutuhkan `describeActivity` — didefinisikan di sini,
 * bukan diimpor dari `client/i18n`, supaya kode bersama ini tidak bergantung
 * pada klien. Kamus bahasa di klien cukup cocok bentuknya (diperiksa lewat
 * `satisfies` di sana) tanpa perlu tahu-menahu soal antarmuka ini.
 */
export interface ActivityStrings {
  cardCreated: string;
  titleChanged: string;
  descriptionUpdated: string;
  descriptionRemoved: string;
  movedFrom: (from: string) => string;
  otherColumn: string;
  transferredTo: (to: string) => string;
  otherColumnShort: string;
  labelAdded: string;
  labelRemoved: string;
  checklistAdded: string;
  checklistChecked: string;
  checklistUnchecked: string;
  checklistRenamed: string;
  checklistRemoved: string;
  commentDeleted: string;
  memberAdded: string;
  memberRemoved: string;
  dueMoved: string;
  dueSet: string;
  dueCleared: string;
  dueDone: string;
  dueUndone: string;
  attachmentAdded: string;
  attachmentRemoved: string;
  cardArchived: string;
  cardRestored: string;
}

export function describeActivity(
  kind: ActivityKind,
  detail: ActivityDetail | null,
  s: ActivityStrings,
): ActivityPhrase {
  const d = detail ?? {};

  switch (kind) {
    case "card_created":
      return { verb: s.cardCreated };
    case "title_changed":
      return { verb: s.titleChanged, subject: d.to ?? undefined };
    case "description_changed":
      return { verb: d.to ? s.descriptionUpdated : s.descriptionRemoved };
    case "card_moved":
      return { verb: s.movedFrom(d.from ?? s.otherColumn), subject: d.to ?? undefined };
    /* Papan tujuan yang ditonjolkan, bukan kolomnya: kartu ini sudah tidak ada
       di papan tempat baris ini pertama kali ditulis, dan yang pertama ingin
       diketahui orang yang membacanya adalah ke mana ia pergi. */
    case "card_transferred":
      return {
        verb: s.transferredTo(d.to ?? s.otherColumnShort),
        subject: d.text,
      };
    case "label_added":
      return { verb: s.labelAdded, subject: d.text, color: d.color };
    case "label_removed":
      return { verb: s.labelRemoved, subject: d.text, color: d.color };
    case "checklist_added":
      return { verb: s.checklistAdded, subject: d.text };
    case "checklist_checked":
      return { verb: s.checklistChecked, subject: d.text };
    case "checklist_unchecked":
      return { verb: s.checklistUnchecked, subject: d.text };
    case "checklist_renamed":
      return { verb: s.checklistRenamed, subject: d.to ?? undefined };
    case "checklist_removed":
      return { verb: s.checklistRemoved, subject: d.text };
    case "comment_deleted":
      return { verb: s.commentDeleted };
    case "member_added":
      return { verb: s.memberAdded, subject: d.text };
    case "member_removed":
      return { verb: s.memberRemoved, subject: d.text };
    /* Tanggalnya diformat tanpa menyebut zona, jadi ia jatuh ke zona pembaca —
       dan itu memang yang benar di sini: baris ini digambar di peramban orang
       yang sedang membukanya, bukan di worker. Sisi server memakai pintu lain
       (describeNotification), yang menyebut zonanya sendiri. */
    case "due_changed":
      return {
        verb: d.from ? s.dueMoved : s.dueSet,
        subject: d.to ? formatStamp(d.to) : undefined,
      };
    case "due_cleared":
      return { verb: s.dueCleared };
    /* Tanggalnya tidak ikut disebut: ia masih terpasang di kartu yang sama,
       terbaca beberapa sentimeter dari baris ini. */
    case "due_done":
      return { verb: s.dueDone };
    case "due_undone":
      return { verb: s.dueUndone };
    case "attachment_added":
      return { verb: s.attachmentAdded, subject: d.text };
    case "attachment_removed":
      return { verb: s.attachmentRemoved, subject: d.text };
    case "card_archived":
      return { verb: s.cardArchived };
    case "card_restored":
      return { verb: s.cardRestored };
  }
}

/**
 * Nama yang disisipkan ke dalam kalimat, dikutip dan dipendekkan.
 *
 * Judul kartu boleh sampai 500 karakter, sedangkan satu notifikasi cuma punya
 * dua baris: tanpa pemendekan, satu judul panjang menelan seluruh kabarnya.
 */
const NAME_MAX = 60;

function quoted(value: string | null | undefined, fallback: string): string {
  const text = (value ?? "").trim();
  if (!text) return fallback;
  return `“${text.length > NAME_MAX ? `${text.slice(0, NAME_MAX - 1)}…` : text}”`;
}

/**
 * Kalimat kejadian untuk notifikasi — versi yang menyebut kartunya.
 *
 * Bedanya dengan `describeActivity` bukan gaya melainkan tempat: baris lini
 * masa sudah berdiri di dalam kartunya, jadi menyebut nama kartu di sana cuma
 * pengulangan. Notifikasi dibaca di layar kunci dan di kotak masuk, jauh dari
 * kartunya — kalimatnya harus utuh sendiri, lengkap dengan objeknya.
 *
 * Yang dikembalikan belum berpelaku: pemanggilnya yang menaruh nama orangnya
 * di depan.
 */
export function describeNotification(
  kind: ActivityKind,
  detail: ActivityDetail | null,
  cardTitle: string,
): string {
  const d = detail ?? {};
  const card = quoted(cardTitle, "sebuah kartu");

  switch (kind) {
    case "card_created":
      return `membuat kartu ${card}`;
    case "title_changed":
      return d.from
        ? `mengubah judul ${quoted(d.from, "kartu")} menjadi ${quoted(d.to, card)}`
        : `mengubah judul kartu menjadi ${quoted(d.to, card)}`;
    case "description_changed":
      return d.to ? `memperbarui deskripsi ${card}` : `menghapus deskripsi ${card}`;
    case "card_moved":
      return `memindahkan ${card} dari ${quoted(d.from, "kolom lain")} ke ${quoted(d.to, "kolom lain")}`;
    case "card_transferred":
      return `memindahkan ${card} ke kolom ${quoted(d.to, "lain")} di papan ${quoted(d.text, "lain")}`;
    case "label_added":
      return `menambahkan label ${quoted(d.text, "baru")} pada ${card}`;
    case "label_removed":
      return `melepas label ${quoted(d.text, "lama")} dari ${card}`;
    case "checklist_added":
      return `menambah butir ${quoted(d.text, "baru")} di ${card}`;
    case "checklist_checked":
      return `menyelesaikan butir ${quoted(d.text, "checklist")} di ${card}`;
    case "checklist_unchecked":
      return `membuka lagi butir ${quoted(d.text, "checklist")} di ${card}`;
    case "checklist_renamed":
      return `mengubah butir ${quoted(d.from, "checklist")} di ${card} menjadi ${quoted(d.to, "nama baru")}`;
    case "checklist_removed":
      return `menghapus butir ${quoted(d.text, "checklist")} dari ${card}`;
    case "comment_deleted":
      return `menghapus sebuah followup di ${card}`;
    case "member_added":
      return `mengundang ${quoted(d.text, "seseorang")} ke ${card}`;
    case "member_removed":
      return `mengeluarkan ${quoted(d.text, "seseorang")} dari ${card}`;
    case "due_changed":
      return d.to
        ? `menetapkan tenggat ${card} pada ${formatStamp(d.to, APP_TIME_ZONE)}`
        : `mengubah tenggat ${card}`;
    case "due_cleared":
      return `menghapus tenggat ${card}`;
    case "due_done":
      return `menandai tenggat ${card} selesai`;
    case "due_undone":
      return `membuka lagi tenggat ${card}`;
    case "attachment_added":
      return `menambahkan lampiran ${quoted(d.text, "baru")} di ${card}`;
    case "attachment_removed":
      return `menghapus lampiran ${quoted(d.text, "lama")} dari ${card}`;
    case "card_archived":
      return `mengarsipkan ${card}`;
    case "card_restored":
      return `memulihkan ${card} dari arsip`;
  }
}

/** Kalimat followup baru — isinya sendiri yang jadi kabarnya. */
export const describeComment = (cardTitle: string, comment: string): string =>
  `menulis di ${quoted(cardTitle, "sebuah kartu")}: ${comment}`;

/** Kalimat kartu yang dihapus; kartunya sudah tidak ada, namanya yang tersisa. */
export const describeCardDeleted = (cardTitle: string): string =>
  `menghapus kartu ${quoted(cardTitle, "yang Anda ikuti")}`;

/** Kalimat kartu baru di sebuah papan. */
export const describeNewCard = (cardTitle: string): string =>
  `menambahkan kartu ${quoted(cardTitle, "baru")}`;
