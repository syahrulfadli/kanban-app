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
