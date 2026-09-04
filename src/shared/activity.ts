import type { ActivityDetail, ActivityKind, LabelColor } from "./types";

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

export function describeActivity(kind: ActivityKind, detail: ActivityDetail | null): ActivityPhrase {
  const d = detail ?? {};

  switch (kind) {
    case "card_created":
      return { verb: "membuat kartu ini" };
    case "title_changed":
      return { verb: "mengubah judul jadi", subject: d.to ?? undefined };
    case "description_changed":
      return { verb: d.to ? "memperbarui deskripsi" : "menghapus deskripsi" };
    case "card_moved":
      return { verb: `memindahkan dari ${d.from ?? "kolom lain"} ke`, subject: d.to ?? undefined };
    case "label_added":
      return { verb: "menambahkan label", subject: d.text, color: d.color };
    case "label_removed":
      return { verb: "melepas label", subject: d.text, color: d.color };
    case "checklist_added":
      return { verb: "menambah butir", subject: d.text };
    case "checklist_checked":
      return { verb: "menyelesaikan", subject: d.text };
    case "checklist_unchecked":
      return { verb: "membuka lagi", subject: d.text };
    case "checklist_renamed":
      return { verb: "mengubah butir jadi", subject: d.to ?? undefined };
    case "checklist_removed":
      return { verb: "menghapus butir", subject: d.text };
    case "comment_deleted":
      return { verb: "menghapus sebuah followup" };
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
