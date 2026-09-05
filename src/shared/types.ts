import type {
  ActivityDetail,
  ActivityKind,
  Board,
  Card,
  CardActivity,
  CardComment,
  ChecklistItem,
  Column,
  ColumnColor,
  Invitation,
  Label,
  LabelColor,
  NotificationKind,
  Role,
  Workspace,
} from "../db/schema";
import { COLUMN_COLORS, LABEL_COLORS } from "../db/schema";

export type {
  ActivityDetail,
  ActivityKind,
  Board,
  Card,
  CardActivity,
  CardComment,
  ChecklistItem,
  Column,
  ColumnColor,
  Invitation,
  Label,
  LabelColor,
  NotificationKind,
  Role,
  Workspace,
};
export { COLUMN_COLORS, LABEL_COLORS };

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
  /**
   * Orang yang diundang ke kartu ini, urut waktu diundang.
   *
   * Terpisah dari `participants` karena asalnya memang berbeda — yang satu
   * dinyatakan, yang satu disimpulkan (lihat `card_members` di skema). Muka
   * kartu menggabung keduanya jadi satu deret wajah; yang membutuhkan
   * pemisahannya adalah dialog kartu, tempat undangan bisa dicabut.
   */
  members: UserBrief[];
  /**
   * Apakah orang yang sedang melihat mengawasi kartu ini — hanya kartunya
   * sendiri. Mengawasi kolomnya juga mengirim kabar tentang kartu ini, tapi
   * tidak dinyatakan di sini: mata yang muncul di setiap kartu sebuah kolom
   * yang diawasi hanya mengulang apa yang sudah tertulis di kepala kolomnya.
   */
  watching: boolean;
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
  /* Ikut dikirim demi pemilih orang: yang boleh diundang ke kartu adalah
     anggota workspace pemilik papannya, dan daftar itu ditarik dari alamat
     workspace — bukan dari kartunya. */
  workspaceId: string;
  checklistItems: ChecklistItem[];
  comments: CardCommentDetail[];
  /** Jejak perubahan, terurut dari yang paling lama. */
  activities: CardActivityDetail[];
  createdByUser: UserBrief | null;
  updatedByUser: UserBrief | null;
}

/** Satu board lengkap dengan kolom dan kartunya — payload untuk render board. */
/** Kolom sebagaimana digambar di papan. */
export interface ColumnSummary extends Column {
  cards: CardSummary[];
  /** Apakah orang yang sedang melihat mengawasi kolom ini. */
  watching: boolean;
}

export interface BoardDetail extends Board {
  role: Role;
  /** Label milik board — palet yang bisa dipasang ke kartu mana pun di sini. */
  labels: Label[];
  columns: ColumnSummary[];
}

/* ── Pencarian kartu ───────────────────────────────────────────────
   Satu kartu yang cocok, beserta konteks tempatnya berada: hasil pencarian
   dibaca jauh dari papannya, jadi baris yang cuma berisi judul memaksa orang
   membukanya dulu untuk tahu ia sedang melihat kartu yang mana. */

export interface CardSearchHit {
  id: string;
  title: string;
  /** Potongan deskripsi di sekitar kata yang cocok; null kalau deskripsinya tidak ikut cocok. */
  snippet: string | null;
  boardId: string;
  boardTitle: string;
  workspaceName: string;
  columnTitle: string;
  labels: Label[];
  participants: UserBrief[];
  /**
   * Label dan orang yang namanya sendiri ikut cocok. Merekalah alasan kartu
   * ini muncul ketika judul dan deskripsinya tidak menyebut apa-apa — tanpa
   * ditandai, barisnya terbaca sebagai hasil yang nyasar.
   */
  matchedLabelIds: string[];
  matchedUserIds: string[];
}

/* ── Pindah papan ──────────────────────────────────────────────────
   Tujuan yang boleh dipilih saat sebuah kolom atau kartu dipindahkan keluar
   dari papannya. Sengaja sesempit ini: pemilihnya cuma perlu nama. */

export interface MoveTargetBoard {
  id: string;
  title: string;
  /** Terurut seperti di papannya. Kosong berarti papan itu belum punya kolom. */
  columns: { id: string; title: string }[];
}

export interface MoveTargetWorkspace {
  id: string;
  name: string;
  boards: MoveTargetBoard[];
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
  /** Followup baru di kartu yang saya awasi. */
  comments: boolean;
  /** Perubahan di kartu dan kolom yang saya awasi: judul, deskripsi, label, checklist, pindah kolom. */
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

/* ── Foto profil ──────────────────────────────────────────────────
   Aturan yang harus sama di kedua sisi: klien memangkas dan mengencode,
   server yang memeriksa hasilnya. */

/** Format yang boleh disimpan. Klien selalu mengirim salah satu dari ini. */
export const AVATAR_MIMES = ["image/webp", "image/jpeg", "image/png"] as const;
export type AvatarMime = (typeof AVATAR_MIMES)[number];

/** Sisi persegi foto setelah dipangkas, dalam piksel. */
export const AVATAR_SIZE = 256;

/* Batas panjang base64-nya. 256 piksel persegi jatuh di kisaran 20 KB, jadi
   150 KB sudah sangat longgar — angka ini penjaga terhadap kiriman yang
   tidak wajar, bukan target. */
export const MAX_AVATAR_BASE64 = 200_000;

/* ── Kotak masuk notifikasi ───────────────────────────────────────── */

/**
 * Satu kabar di kotak masuk. Judul dan kalimatnya sudah jadi teks — disalin
 * saat kejadian, bukan dirujuk — jadi baris ini tetap terbaca setelah kartunya
 * berganti nama atau hilang.
 */
export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  /** Nama papan — baris pertama notifikasi perangkat, bukan judul kartunya. */
  title: string;
  body: string;
  workspaceId: string;
  workspaceName: string;
  boardId: string;
  boardTitle: string;
  /** Null kalau kartunya sudah dihapus — tautannya berujung ke papan saja. */
  cardId: string | null;
  actor: UserBrief | null;
  readAt: string | null;
  createdAt: string;
}

/**
 * Pilihan penyaring, diturunkan dari isi kotak masuk itu sendiri — bukan dari
 * daftar keanggotaan. Papan yang tidak pernah mengabari apa pun tidak perlu
 * muncul sebagai pilihan yang selalu kosong.
 */
export interface NotificationScope {
  workspaceId: string;
  workspaceName: string;
  unread: number;
  boards: { id: string; title: string; unread: number }[];
}

export interface NotificationFeed {
  items: NotificationItem[];
  /** Yang belum dibaca di seluruh kotak masuk — bukan hanya di penyaring ini. */
  unread: number;
  scopes: NotificationScope[];
  /** Penanda halaman berikutnya; null berarti sudah sampai dasar. */
  nextCursor: string | null;
}

export interface ApiError {
  error: string;
}
