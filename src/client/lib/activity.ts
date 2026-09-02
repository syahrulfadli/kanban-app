import type {
  ActivityDetail,
  ActivityKind,
  CardActivityDetail,
  UserBrief,
} from "../../shared/types";

/* Kalimatnya tinggal di src/shared: server memakai kalimat yang sama untuk
   menyusun bunyi notifikasi, jadi lini masa dan notifikasi tidak pernah
   menceritakan kejadian yang sama dengan dua cara berbeda. */
export { describeActivity, type ActivityPhrase } from "../../shared/activity";

/** Catatan yang akan ditulis server — dibentuk juga di klien untuk tampilan optimistik. */
export interface ActivityNote {
  kind: ActivityKind;
  detail?: ActivityDetail;
}

/** Penanda baris yang belum pernah singgah di server — id-nya tidak dipakai apa pun. */
let temp = 0;

/**
 * Salinan lokal dari catatan yang sedang dalam perjalanan ke server. Tanpa ini
 * lini masa baru bergerak setelah kartunya ditarik ulang, padahal perubahannya
 * sudah tampak di sebelah kiri saat itu juga.
 */
export const optimisticActivity = (
  cardId: string,
  actor: UserBrief,
  note: ActivityNote,
): CardActivityDetail => ({
  id: `pending-${++temp}`,
  cardId,
  userId: actor.id,
  kind: note.kind,
  detail: note.detail ?? null,
  createdAt: new Date(),
  actor,
});
