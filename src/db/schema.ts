import { sqliteTable, text, real, integer, index, primaryKey } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

export * from "./auth-schema";

/** Peran anggota workspace, dari yang paling berwenang. */
export const ROLES = ["owner", "admin", "member"] as const;
export type Role = (typeof ROLES)[number];

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Keanggotaan workspace — inilah sumber kebenaran hak akses.
 * Semua pemeriksaan izin board/kolom/kartu berujung ke tabel ini.
 */
export const workspaceMembers = sqliteTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ROLES }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.userId] }),
    index("members_user_idx").on(t.userId),
  ],
);

export const invitations = sqliteTable(
  "invitations",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role", { enum: ROLES }).notNull(),
    token: text("token").notNull().unique(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("invitations_workspace_idx").on(t.workspaceId)],
);

/**
 * Posisi memakai fractional indexing (real, bukan integer berurutan):
 * memindahkan satu kartu cukup meng-update satu baris, bukan seluruh kolom.
 */

export const boards = sqliteTable(
  "boards",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("boards_workspace_idx").on(t.workspaceId)],
);

export const columns = sqliteTable(
  "columns",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    position: real("position").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("columns_board_idx").on(t.boardId, t.position)],
);

export const cards = sqliteTable(
  "cards",
  {
    id: text("id").primaryKey(),
    columnId: text("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    position: real("position").notNull(),
    /* Penulis dan penyunting terakhir. `set null`, bukan `cascade`: kartu
       tidak boleh ikut hilang hanya karena pembuatnya keluar dari tim. */
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    updatedBy: text("updated_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("cards_column_idx").on(t.columnId, t.position)],
);

/** Warna label — kunci simbolik, bukan hex: peta warnanya milik tema. */
export const LABEL_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "sky",
  "violet",
  "pink",
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

/**
 * Jenis perubahan yang tercatat di lini masa kartu. Followup yang ditulis
 * orang tidak ada di sini — itu tetap `card_comments`; tabel ini hanya
 * merekam apa yang *terjadi* pada kartu.
 */
export const ACTIVITY_KINDS = [
  "card_created",
  "title_changed",
  "description_changed",
  "card_moved",
  "label_added",
  "label_removed",
  "checklist_added",
  "checklist_checked",
  "checklist_unchecked",
  "checklist_renamed",
  "checklist_removed",
  "comment_deleted",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/**
 * Potongan konteks satu catatan — sengaja didenormalisasi: label yang sudah
 * dihapus dan butir checklist yang sudah hilang tetap harus terbaca di lini
 * masa, jadi namanya disalin saat kejadian, bukan dirujuk.
 */
export interface ActivityDetail {
  from?: string | null;
  to?: string | null;
  text?: string;
  color?: LabelColor;
}

/** Label dimiliki board, bukan kartu — supaya bisa dipakai ulang lintas kartu. */
export const labels = sqliteTable(
  "labels",
  {
    id: text("id").primaryKey(),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color", { enum: LABEL_COLORS }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("labels_board_idx").on(t.boardId)],
);

export const cardLabels = sqliteTable(
  "card_labels",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.labelId] }),
    index("card_labels_label_idx").on(t.labelId),
  ],
);

/** Thread followup pada kartu. Datar, bukan berjenjang — satu utas per kartu. */
export const cardComments = sqliteTable(
  "card_comments",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("card_comments_card_idx").on(t.cardId, t.createdAt)],
);

export const checklistItems = sqliteTable(
  "checklist_items",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    done: integer("done", { mode: "boolean" }).notNull().default(false),
    position: real("position").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("checklist_card_idx").on(t.cardId, t.position)],
);

/**
 * Siapa saja yang pernah menyentuh kartu ini — pembuat, penyunting, pengomentar.
 * Diturunkan dari aksi, bukan ditugaskan manual: inilah sumber deretan avatar.
 */
export const cardParticipants = sqliteTable(
  "card_participants",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firstActiveAt: integer("first_active_at", { mode: "timestamp_ms" }).notNull(),
    lastActiveAt: integer("last_active_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    index("card_participants_user_idx").on(t.userId),
  ],
);

/**
 * Jejak setiap perubahan pada kartu — satu baris per kejadian, tidak pernah
 * disunting. Digabung dengan `card_comments` di klien jadi satu lini masa.
 *
 * `set null` pada pelakunya: riwayat kartu tidak boleh berlubang hanya karena
 * orangnya keluar dari tim.
 */
export const cardActivities = sqliteTable(
  "card_activities",
  {
    id: text("id").primaryKey(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ACTIVITY_KINDS }).notNull(),
    detail: text("detail", { mode: "json" }).$type<ActivityDetail>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("card_activities_card_idx").on(t.cardId, t.createdAt)],
);

/**
 * Kabar apa yang sedang diceritakan sebuah notifikasi. Nilainya sama dengan
 * nama kanal di pengaturan, karena keduanya memang bicara soal yang sama.
 */
export const NOTIFICATION_KINDS = ["comments", "changes", "newCards"] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

/**
 * Kotak masuk notifikasi — satu baris per orang per kejadian.
 *
 * Isinya sengaja didenormalisasi (judul dan kalimatnya disalin, bukan dirujuk):
 * riwayat harus tetap terbaca setelah kartunya diganti nama atau dihapus, dan
 * baris ini justru sering dibaca ketika yang diceritakannya sudah tidak ada.
 *
 * Berbeda dengan push ke perangkat, tidak ada penyaringan preferensi di sini:
 * kotak masuk adalah riwayat lengkap, dan yang mengatur keramaiannya adalah
 * penyaring workspace/board di tampilannya.
 */
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /* Konteks untuk penyaring. Ikut terhapus bersama workspace atau boardnya —
       kabar tentang papan yang sudah tidak ada tidak berguna bagi siapa pun. */
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    boardId: text("board_id")
      .notNull()
      .references(() => boards.id, { onDelete: "cascade" }),
    /* Tanpa foreign key, justru disengaja: kabar "kartu ini dihapus" harus
       selamat dari kartunya sendiri. Tautannya boleh berujung ke papan saja. */
    cardId: text("card_id"),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    /** Judul kartu (atau nama papan untuk kartu baru), disalin saat kejadian. */
    title: text("title").notNull(),
    /** Kalimatnya: "Rina menambahkan label “Mendesak”". */
    body: text("body").notNull(),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    /* Penghitung lencana menanyakan "berapa yang belum dibaca" di setiap
       tarikan; tanpa indeks ini ia memindai seluruh riwayat orang itu. */
    index("notifications_unread_idx").on(t.userId, t.readAt),
  ],
);

/**
 * Satu baris per perangkat yang mengizinkan notifikasi — bukan per user:
 * orang yang sama boleh memasang aplikasinya di ponsel dan laptop, dan
 * masing-masing punya kunci enkripsinya sendiri.
 *
 * `endpoint` itulah identitas perangkatnya di mata push service, jadi ia yang
 * dijadikan kunci unik: mendaftar ulang dari perangkat yang sama memperbarui
 * baris lama, tidak menumpuk baris baru.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    /** Kunci publik perangkat (ECDH P-256) dan rahasia autentikasinya. */
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    /** Diperbarui setiap klien mendaftar ulang — penanda perangkat masih hidup. */
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

/**
 * Kabar apa yang ingin diterima seseorang. Satu baris per user, bukan per
 * perangkat: yang diatur di sini selera orangnya, dan tidak ada gunanya ponsel
 * dan laptop milik orang yang sama berbeda pendapat.
 *
 * Tidak punya baris berarti semua nilai default; barisnya baru ditulis saat
 * pilihannya benar-benar diubah.
 */
export const notificationPrefs = sqliteTable("notification_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Followup baru di kartu yang pernah saya sentuh. */
  comments: integer("comments", { mode: "boolean" }).notNull().default(true),
  /** Perubahan kartu itu sendiri: judul, deskripsi, label, checklist, pindah kolom. */
  changes: integer("changes", { mode: "boolean" }).notNull().default(true),
  /* Kartu baru menyapa seluruh anggota workspace, bukan cuma peserta kartu —
     di board yang ramai itu bisa jadi berisik, jadi defaultnya mati. */
  newCards: integer("new_cards", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

/**
 * Foto profil. Disimpan sebagai baris database, bukan berkas di object
 * storage: batasan aplikasi ini nol biaya, dan D1 sudah ada di sini.
 *
 * Yang masuk ke `user.image` hanya URL ke `/api/avatars/:userId` — bukan data
 * URL. Kalau isi berkasnya ikut ke sana, ia akan terbawa di setiap sesi dan di
 * setiap peserta kartu yang dikirim board, dan payload papan membengkak
 * berkali-kali lipat hanya untuk gambar yang sama.
 *
 * `version` berganti tiap unggahan dan ikut sebagai query di URL, jadi foto
 * baru langsung tampak walau responsnya di-cache selamanya.
 */
export const userAvatars = sqliteTable("user_avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Tipe berkasnya — dipakai apa adanya sebagai Content-Type. */
  mime: text("mime").notNull(),
  /** Isi berkas dalam base64; klien sudah memangkasnya jadi persegi kecil. */
  data: text("data").notNull(),
  version: text("version").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type Invitation = typeof invitations.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type Column = typeof columns.$inferSelect;
export type Card = typeof cards.$inferSelect;
export type Label = typeof labels.$inferSelect;
export type CardComment = typeof cardComments.$inferSelect;
export type ChecklistItem = typeof checklistItems.$inferSelect;
export type CardParticipant = typeof cardParticipants.$inferSelect;
export type CardActivity = typeof cardActivities.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type UserAvatar = typeof userAvatars.$inferSelect;
