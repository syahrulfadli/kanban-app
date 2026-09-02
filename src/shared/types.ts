import type {
  ActivityDetail,
  ActivityKind,
  Board,
  Card,
  CardActivity,
  CardComment,
  ChecklistItem,
  Column,
  Invitation,
  Label,
  LabelColor,
  Role,
  Workspace,
} from "../db/schema";
import { LABEL_COLORS } from "../db/schema";

export type {
  ActivityDetail,
  ActivityKind,
  Board,
  Card,
  CardActivity,
  CardComment,
  ChecklistItem,
  Column,
  Invitation,
  Label,
  LabelColor,
  Role,
  Workspace,
};
export { LABEL_COLORS };

/** Workspace beserta peran user yang sedang login di dalamnya. */
export interface WorkspaceSummary extends Workspace {
  role: Role;
}

/** Identitas sependek mungkin — cukup untuk avatar, nama, dan tooltip. */
export interface UserBrief {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

/** Berapa butir checklist yang sudah dicentang — sumber angka progress bar. */
export interface ChecklistProgress {
  total: number;
  done: number;
}

/**
 * Kartu sebagaimana digambar di papan: sudah membawa label, progress, jumlah
 * followup, dan peserta — semuanya terlihat tanpa perlu membuka dialognya.
 */
export interface CardSummary extends Card {
  labels: Label[];
  checklist: ChecklistProgress;
  commentCount: number;
  /** Terurut dari yang paling awal menyentuh kartu — pembuat selalu di depan. */
  participants: UserBrief[];
}

export interface CardCommentDetail extends CardComment {
  author: UserBrief;
}

/** Satu catatan perubahan, lengkap dengan pelakunya. */
export interface CardActivityDetail extends CardActivity {
  actor: UserBrief | null;
}

/** Isi lengkap satu kartu — hanya ditarik saat dialognya dibuka. */
export interface CardDetail extends CardSummary {
  boardId: string;
  checklistItems: ChecklistItem[];
  comments: CardCommentDetail[];
  /** Jejak perubahan, terurut dari yang paling lama. */
  activities: CardActivityDetail[];
  createdByUser: UserBrief | null;
  updatedByUser: UserBrief | null;
}

/** Satu board lengkap dengan kolom dan kartunya — payload untuk render board. */
export interface BoardDetail extends Board {
  role: Role;
  /** Label milik board — palet yang bisa dipasang ke kartu mana pun di sini. */
  labels: Label[];
  columns: (Column & { cards: CardSummary[] })[];
}

export interface MemberSummary {
  userId: string;
  role: Role;
  joinedAt: Date;
  name: string;
  email: string;
  image: string | null;
}

/** Undangan yang baru dibuat — `url` dibagikan manual (belum ada layanan email). */
export interface InvitationCreated extends Invitation {
  url: string;
}

export interface InvitePreview {
  workspaceName: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

/**
 * Kabar apa yang mau diterima seseorang lewat notifikasi perangkat.
 * Bentuk yang sama dipakai server (tabel `notification_prefs`) dan klien.
 */
export interface NotificationSettings {
  /** Followup baru di kartu yang pernah saya sentuh. */
  comments: boolean;
  /** Perubahan pada kartu itu: judul, deskripsi, label, checklist, pindah kolom. */
  changes: boolean;
  /** Kartu baru di papan mana pun di workspace saya. */
  newCards: boolean;
}

/* Default harus sama persis dengan default kolom di skema — di sinilah nilai
   itu dipakai saat seseorang belum pernah mengubah apa pun. */
export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  comments: true,
  changes: true,
  newCards: false,
};

/** Yang dibutuhkan klien sebelum bisa menawarkan notifikasi. */
export interface PushSettings {
  /** Kunci publik VAPID; null berarti server belum memasangnya dan fiturnya mati. */
  publicKey: string | null;
  prefs: NotificationSettings;
}

export interface ApiError {
  error: string;
}
