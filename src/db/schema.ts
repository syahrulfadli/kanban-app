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

/* Kolom memakai palet yang sama persis, dan itu disengaja: satu papan yang
   memakai dua keluarga rona akan terbaca sebagai dua sistem yang kebetulan
   bertumpuk. Aliasnya ada supaya sisi yang bicara soal kolom tidak perlu
   menyebut "label" untuk sesuatu yang bukan label. */
export const COLUMN_COLORS = LABEL_COLORS;
export type ColumnColor = LabelColor;

/* ── Latar papan ───────────────────────────────────────────────────
   Tiga cara sebuah papan bisa berlatar, dan ketiganya sengaja disimpan
   sebagai sepasang kolom (`kind` + `value`) alih-alih tiga kolom terpisah:
   sebuah papan hanya boleh berlatar satu hal pada satu waktu, dan tiga kolom
   yang saling meniadakan cepat atau lambat akan terisi dua sekaligus. */

export const BOARD_BACKGROUND_KINDS = ["default", "gradient", "image"] as const;
export type BoardBackgroundKind = (typeof BOARD_BACKGROUND_KINDS)[number];

/**
 * Gradiasi bawaan — kunci simbolik, bukan warna: nilainya tinggal di CSS
 * (lihat `.board-bg[data-gradient]` di index.css), jadi setiap gradiasi punya
 * satu bentuk untuk tema terang dan satu untuk tema gelap tanpa ada yang
 * perlu dihitung di JavaScript.
 *
 * Berbeda dari gambar Unsplash yang dikurasi lewat panel admin, daftar ini
 * tidak tinggal di database: gradiasi adalah bagian dari tema aplikasi, dan
 * tema yang bisa disunting dari panel akan menyimpang dari sisa palet.
 */
/**
 * Seberapa kabur foto latarnya, dalam piksel. Nilainya terbatas pada daftar
 * ini — bukan angka bebas — supaya "sedang" berarti hal yang sama di setiap
 * papan, dan supaya tidak ada yang bisa menyimpan 400 dan membuat papannya
 * jadi bidang warna.
 *
 * 0 berarti tidak dikaburkan, dan itu keadaan istirahatnya: foto yang
 * dikurasi dipilih karena rupanya, dan mengaburkannya sejak awal membuang
 * alasan ia dipilih.
 */
export const BOARD_BLUR_LEVELS = [0, 6, 14, 28] as const;
export type BoardBlur = (typeof BOARD_BLUR_LEVELS)[number];

export const BOARD_GRADIENTS = [
  "fajar",
  "laut",
  "kabut",
  "lumut",
  "senja",
  "pasir",
  "nila",
  "sakura",
] as const;
export type BoardGradient = (typeof BOARD_GRADIENTS)[number];

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
    /* Latar papan. "default" berarti ladang cahaya yang sama dengan sisa
       aplikasi — dan itu keadaan istirahatnya, bukan sekadar "belum dipilih".
       `backgroundValue` berisi kunci gradiasi atau id gambar, dan null untuk
       "default".

       Sengaja bukan foreign key ke `background_images`: kolomnya menampung
       dua jenis nilai, dan D1 tidak punya foreign key bersyarat. Yang menjaga
       konsistensinya adalah rute penghapusan gambar, yang mengembalikan papan
       pemakainya ke "default" — lihat routes/admin.ts. */
    backgroundKind: text("background_kind", { enum: BOARD_BACKGROUND_KINDS })
      .notNull()
      .default("default"),
    backgroundValue: text("background_value"),
    /**
     * Kabut di atas foto, dan seberapa kabur fotonya. Keduanya hanya berarti
     * untuk latar bergambar — gradiasi sudah setenang yang dibutuhkan, dan
     * latar bawaan tidak menggambar apa pun.
     *
     * Kabutnya menyala secara bawaan karena ia yang membuat tinta kartu
     * terbaca di atas foto sembarang. Mematikannya adalah pilihan sadar untuk
     * melihat fotonya utuh, dan sejak itu warna teks di kepala papan
     * ditentukan oleh terang-gelap fotonya sendiri — lihat client/lib/backdrop.ts.
     */
    backgroundOverlay: integer("background_overlay", { mode: "boolean" })
      .notNull()
      .default(true),
    backgroundBlur: integer("background_blur").notNull().default(0),
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
    /* Null berarti kolom tanpa warna — dan itu bukan sekadar "belum dipilih":
       papan yang setiap kolomnya berwarna kehilangan gunanya warna. Null
       adalah keadaan istirahat, dan warna dipakai untuk menandai kolom yang
       memang perlu dibedakan. */
    color: text("color", { enum: LABEL_COLORS }),
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
    /**
     * Tenggat kartu — pengingat sekaligus batas waktu, dan sengaja satu kolom
     * untuk keduanya: yang membedakan "ingatkan saya" dari "harus selesai"
     * cuma sikap orangnya terhadap tanggal yang sama, bukan datanya.
     *
     * Null berarti kartu tanpa tanggal, dan itulah keadaan istirahatnya:
     * papan yang setiap kartunya bertenggat kehilangan gunanya tenggat.
     */
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("cards_column_idx").on(t.columnId, t.position)],
);

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
  /* Pindah papan, bukan pindah kolom: catatannya sendiri karena kalimatnya
     harus menyebut papan tujuan — tanpa itu, "dipindahkan ke Backlog" di lini
     masa menunjuk kolom yang tidak ada di papan mana pun yang sedang dibuka. */
  "card_transferred",
  "label_added",
  "label_removed",
  "checklist_added",
  "checklist_checked",
  "checklist_unchecked",
  "checklist_renamed",
  "checklist_removed",
  "comment_deleted",
  "member_added",
  "member_removed",
  "due_changed",
  "due_cleared",
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
 * Orang yang diundang ke sebuah kartu.
 *
 * Bedanya dengan `card_participants` bukan isinya melainkan asalnya: baris
 * peserta *disimpulkan* dari apa yang sudah terjadi, baris ini *dinyatakan* —
 * seseorang menunjuk rekannya dan berkata "kartu ini urusanmu juga", sebelum
 * orang itu menyentuh apa pun. Karena itu keduanya tidak bisa digabung:
 * menggabungnya berarti mengundang seseorang meninggalkan jejak palsu bahwa
 * ia pernah mengerjakan kartunya.
 *
 * Yang boleh diundang hanya anggota workspace pemilik papannya. Undangan ini
 * tidak memberi akses apa pun — akses tetap lahir dari `workspace_members`;
 * yang diberikannya adalah perhatian: undangan membuat kartunya diawasi
 * (lihat `cardAudience` di worker/notify.ts) dan wajah orangnya muncul di
 * muka kartu.
 *
 * `invitedBy` memakai `set null`: undangan tetap berlaku setelah yang
 * mengundang keluar dari tim.
 */
export const cardMembers = sqliteTable(
  "card_members",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    index("card_members_user_idx").on(t.userId),
  ],
);

/**
 * Kartu yang diawasi seseorang — tapi hanya sebagai *pengecualian*.
 *
 * Aturan bawaannya tidak disimpan di sini: siapa pun yang punya jejak di
 * `card_participants` sudah dianggap mengawasi kartunya, dan itulah yang
 * membuat pembuat serta kontributor kartu dikabari tanpa perlu menekan apa
 * pun. Baris di tabel ini hanya muncul ketika seseorang menyatakan pilihan
 * yang berbeda dari aturan itu.
 *
 * Sengaja tidak digabung ke `card_participants`, walau isinya mirip: baris
 * peserta itulah yang menggambar deretan avatar di muka kartu, dan berhenti
 * mengawasi tidak boleh menghapus seseorang dari kartu yang jelas-jelas ia
 * kerjakan.
 *
 * `watching = false` karena itu sama pentingnya dengan `true` — ia yang
 * membuat "sudah saya matikan" bertahan melewati followup berikutnya, alih-alih
 * hidup lagi sendiri setiap kali orangnya menyentuh kartu itu.
 */
export const cardWatches = sqliteTable(
  "card_watches",
  {
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    watching: integer("watching", { mode: "boolean" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.cardId, t.userId] }),
    index("card_watches_user_idx").on(t.userId),
  ],
);

/**
 * Kolom yang diawasi seseorang. Di sini kehadiran barisnya sudah berarti
 * "diawasi", tanpa kolom `watching`: berbeda dengan kartu, kolom tidak punya
 * aturan bawaan yang perlu dibantah — tidak ada peserta kolom, dan pembuatnya
 * mendapat barisnya sendiri saat kolom itu dibuat.
 */
export const columnWatches = sqliteTable(
  "column_watches",
  {
    columnId: text("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.columnId, t.userId] }),
    index("column_watches_user_idx").on(t.userId),
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
    /**
     * Baris pertama notifikasi perangkat: nama papannya, disalin saat kejadian.
     * Bukan judul kartunya — kartu yang dibicarakan sudah disebut di dalam
     * `body`, dan mengulangnya di sini menghabiskan satu dari dua baris yang
     * tersedia di layar kunci.
     */
    title: text("title").notNull(),
    /** Kalimat utuh: "Rina menambahkan label “Mendesak” pada “Perbaiki login”". */
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
  /** Followup baru di kartu yang saya awasi. */
  comments: integer("comments", { mode: "boolean" }).notNull().default(true),
  /* Perubahan di kartu dan kolom yang saya awasi: judul, deskripsi, label,
     checklist, pindah kolom — termasuk kartu baru yang mendarat di kolom yang
     saya awasi, yang bagi pengawasnya memang kabar tentang hal yang ia ikuti
     dan bukan siaran. */
  changes: integer("changes", { mode: "boolean" }).notNull().default(true),
  /* Kartu baru menyapa seluruh anggota workspace, diawasi atau tidak — di
     board yang ramai itu bisa jadi berisik, jadi defaultnya mati. */
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

/**
 * Gambar latar yang dikurasi manual dari Unsplash.
 *
 * Yang disimpan hanya alamatnya, bukan berkasnya: batasan aplikasi ini nol
 * biaya, dan Unsplash sudah menyajikan gambarnya sendiri lewat CDN yang boleh
 * ditaut langsung. Alamatnya wajib menunjuk ke images.unsplash.com — bukan
 * kepicikan, melainkan supaya panel ini tidak berubah jadi pintu untuk
 * menempelkan alamat gambar dari mana saja ke halaman setiap pemakai.
 *
 * Nama fotografer ikut disimpan karena memang harus: menaut gambar Unsplash
 * tanpa menyebut pemotretnya melanggar ketentuan mereka, dan kredit itu yang
 * digambar di sudut papan.
 */
export const backgroundImages = sqliteTable(
  "background_images",
  {
    id: text("id").primaryKey(),
    /** Nama yang dibaca pemilih — "Kabut pegunungan", bukan nama berkas. */
    name: text("name").notNull(),
    /**
     * Alamat dasar di images.unsplash.com, tanpa parameter ukuran. Ukurannya
     * ditambahkan klien saat menggambar (lihat client/lib/background.ts), jadi
     * pemilih menarik keping kecil dan papan menarik yang besar dari baris
     * yang sama.
     */
    url: text("url").notNull(),
    photographer: text("photographer").notNull(),
    /** Profil fotografernya di Unsplash. Boleh kosong; kreditnya tetap tampil. */
    photographerUrl: text("photographer_url"),
    position: real("position").notNull(),
    /* Nonaktif berarti hilang dari pemilih, bukan hilang dari papan yang
       sudah memakainya: mencabut latar yang sudah dipilih orang lain adalah
       perubahan pada papan mereka, dan itu bukan yang diminta admin ketika ia
       menekan "nonaktifkan". Yang mencabut adalah penghapusan. */
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("background_images_position_idx").on(t.position)],
);

/**
 * Admin aplikasi — berbeda dari admin workspace, dan sengaja tabelnya sendiri.
 *
 * `workspace_members.role` menjawab "apa yang boleh ia lakukan di dalam tim
 * ini"; tabel ini menjawab "apa yang boleh ia lakukan terhadap aplikasinya" —
 * mengurasi gambar latar, dan mengurus akun orang. Menggabungnya berarti
 * pemilik satu workspace otomatis berkuasa atas seluruh pemakai.
 *
 * Tidak ditaruh sebagai kolom di tabel `user` karena tabel itu milik Better
 * Auth dan ditulis ulang tiap `npm run auth:generate`.
 *
 * Baris pertama tidak lahir dari sini melainkan dari env `ADMIN_EMAILS` —
 * lihat `requireAppAdmin` di worker/guards.ts. Itulah pintu daruratnya:
 * admin bawaan tidak bisa dicabut lewat panel, jadi panelnya tidak pernah
 * bisa terkunci dari dalam.
 */
export const appAdmins = sqliteTable("app_admins", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  /** Yang mengangkat. `set null`: pengangkatan tetap sah setelah ia pergi. */
  grantedBy: text("granted_by").references(() => user.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
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
export type CardMember = typeof cardMembers.$inferSelect;
export type CardWatch = typeof cardWatches.$inferSelect;
export type ColumnWatch = typeof columnWatches.$inferSelect;
export type CardActivity = typeof cardActivities.$inferSelect;
export type NotificationRow = typeof notifications.$inferSelect;
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect;
export type NotificationPrefs = typeof notificationPrefs.$inferSelect;
export type UserAvatar = typeof userAvatars.$inferSelect;
export type BackgroundImage = typeof backgroundImages.$inferSelect;
export type AppAdmin = typeof appAdmins.$inferSelect;
