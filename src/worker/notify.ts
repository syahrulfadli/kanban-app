import { and, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import {
  boards,
  cardParticipants,
  cardWatches,
  cards,
  columnWatches,
  notificationPrefs,
  notifications,
  pushSubscriptions,
  workspaceMembers,
  type Db,
} from "../db";
import type { AppEnv } from "./auth";
import type { ActivityNote } from "./card-data";
import { createPusher } from "./push";
import {
  describeCardDeleted,
  describeComment,
  describeNewCard,
  describeNotification,
} from "../shared/activity";

/**
 * Siapa yang dikabari, dan atas kabar jenis apa.
 *
 * Pemisahannya bukan soal teknis melainkan soal sopan santun: orang yang cuma
 * ingin tahu kalau ada yang menyapanya di followup tidak perlu ikut bergetar
 * setiap kali ada butir checklist dicentang.
 */
export type NotifyChannel = "comments" | "changes" | "newCards";

/**
 * Isi yang dibaca service worker (lihat public/sw.js). Sengaja pendek —
 * satu kiriman push hanya muat satu record 4 KB, dan yang perlu sampai cuma
 * cukup untuk mengetuk bahu orangnya.
 */
export interface PushPayload {
  title: string;
  body: string;
  /** Pengelompokan di perangkat: kabar baru tentang kartu yang sama menimpa yang lama. */
  tag: string;
  /** Ke mana notifikasi ini membuka aplikasi saat diketuk. */
  url: string;
}

/** Batas panjang teks yang aman untuk baris judul dan isi notifikasi. */
const TITLE_MAX = 80;
const BODY_MAX = 200;

/**
 * Umur riwayat kotak masuk. Notifikasi adalah ketukan di bahu, bukan arsip:
 * yang berumur lebih dari ini tidak pernah dibuka lagi, dan lini masa kartu
 * tetap menyimpan kejadiannya untuk selamanya.
 */
const RETENTION_DAYS = 60;

export function clip(text: string, max = BODY_MAX): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/**
 * Pilihan yang mengizinkan kanal ini.
 *
 * Belum pernah mengubah pengaturan berarti belum punya baris pref sama sekali,
 * jadi NULL harus dibaca sebagai nilai default kolomnya — bukan sebagai tidak.
 */
function allows(channel: NotifyChannel) {
  const column = notificationPrefs[channel];

  // `newCards` defaultnya mati: tanpa baris pref, tidak ada yang dikirim.
  if (channel === "newCards") return eq(column, true);

  return or(isNull(notificationPrefs.userId), eq(column, true));
}

/** Satu kabar, lengkap dengan konteks yang dibutuhkan penyaring kotak masuk. */
interface Announcement {
  userIds: string[];
  channel: NotifyChannel;
  workspaceId: string;
  boardId: string;
  cardId: string;
  /**
   * Baris pertama notifikasi: nama papannya.
   *
   * Bukan judul kartunya — kartu yang bersangkutan sudah disebut di dalam
   * kalimat, dan mengulangnya di baris atas hanya menghabiskan satu dari dua
   * baris yang tersedia di layar kunci.
   */
  title: string;
  body: string;
}

/**
 * Tulis kabar ini ke kotak masuk penerimanya.
 *
 * Tidak ada penyaringan preferensi di sini, berbeda dengan `deliver`: kotak
 * masuk adalah riwayat lengkap, sedangkan preferensi mengatur perangkat mana
 * yang ikut bergetar. Mematikan sebuah kanal menenangkan ponsel, bukan
 * menghapus kabarnya dari halaman.
 */
async function record(
  db: Db,
  announcement: Announcement,
  actorId: string,
  title: string,
  body: string,
): Promise<void> {
  const now = new Date();

  await db.insert(notifications).values(
    announcement.userIds.map((userId) => ({
      id: nanoid(),
      userId,
      workspaceId: announcement.workspaceId,
      boardId: announcement.boardId,
      cardId: announcement.cardId,
      kind: announcement.channel,
      actorId,
      title,
      body,
      createdAt: now,
    })),
  );

  /* Riwayat lama dibuang sekalian di sini. Satu DELETE per kejadian — bukan
     per penerima — dan indeks (user_id, created_at) yang mengerjakannya; itu
     lebih murah daripada menyiapkan tugas berkala yang harus dijadwalkan
     sendiri di plan gratis. */
  await db
    .delete(notifications)
    .where(
      and(
        inArray(notifications.userId, announcement.userIds),
        lt(notifications.createdAt, new Date(now.getTime() - RETENTION_DAYS * 86_400_000)),
      ),
    );
}

/**
 * Catat kabar ini di kotak masuk, lalu ketuk perangkat yang mau diketuk.
 *
 * Urutannya penting: notifikasi harus sudah ada di halaman sebelum ponselnya
 * berbunyi, supaya orang yang membuka aplikasi dari notifikasi tidak menemukan
 * kotak masuk yang masih kosong.
 */
async function announce(c: Context<AppEnv>, announcement: Announcement): Promise<void> {
  if (announcement.userIds.length === 0) return;

  const title = clip(announcement.title, TITLE_MAX);
  const body = clip(announcement.body);

  await record(c.get("db"), announcement, c.get("user").id, title, body);

  await deliver(c, announcement.userIds, announcement.channel, {
    title,
    body,
    // Satu tag per kartu: sepuluh perubahan beruntun meninggalkan satu
    // notifikasi di layar kunci, bukan sepuluh.
    tag: `card:${announcement.cardId}`,
    url: `/#/board/${announcement.boardId}/card/${announcement.cardId}`,
  });
}

/**
 * Kirim satu kabar ke sekumpulan orang, lewat semua perangkat mereka.
 *
 * Selalu dipanggil dari dalam `waitUntil` milik pemanggilnya, jadi orang yang
 * menulis followup tidak ikut menunggu push service menjawab.
 */
async function deliver(
  c: Context<AppEnv>,
  userIds: string[],
  channel: NotifyChannel,
  payload: PushPayload,
): Promise<void> {
  if (userIds.length === 0) return;

  const db = c.get("db");
  const pusher = await createPusher(c.env);
  if (!pusher) return;

  const devices = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .leftJoin(notificationPrefs, eq(notificationPrefs.userId, pushSubscriptions.userId))
    .where(and(inArray(pushSubscriptions.userId, userIds), allows(channel)))
    .all();

  if (devices.length === 0) return;

  const outcomes = await Promise.all(
    devices.map(async (device) => ({
      id: device.id,
      result: await pusher.send(device, payload),
    })),
  );

  /* Perangkat yang menjawab 404/410 sudah tidak ada — langganannya dicabut
     atau browsernya dipasang ulang. Barisnya dibuang di sini, karena tidak ada
     tempat lain yang akan pernah tahu. */
  const dead = outcomes.filter((o) => o.result === "gone").map((o) => o.id);
  if (dead.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, dead));
  }
}

/**
 * Anggota sebuah workspace — penjaga terakhir setiap daftar penerima.
 *
 * Jejak seseorang di `card_participants` dan pilihan Awasinya tidak ikut
 * terhapus saat ia dikeluarkan dari tim, dan tanpa penyaringan ini ia akan
 * terus menerima kabar tentang papan yang sudah tidak boleh ia buka.
 */
async function memberIds(db: Db, workspaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .all();

  return new Set(rows.map((row) => row.userId));
}

/**
 * Siapa yang mengawasi kartu ini, selain pelakunya.
 *
 * Tiga lapis, dan urutan penerapannya yang menentukan artinya:
 *
 * 1. Peserta kartu mengawasi secara bawaan — inilah yang membuat pembuat dan
 *    kontributor kartu dikabari tanpa pernah menekan apa pun.
 * 2. Pengawas kolom tempat kartu itu sekarang berada ikut terbawa — dan, saat
 *    kartunya baru saja pindah, pengawas kolom yang ditinggalkannya juga —
 *    walau mereka belum pernah menyentuh kartunya.
 * 3. Pilihan manual di `card_watches` menimpa keduanya. Karena itulah
 *    mematikan Awasi di satu kartu tetap menyunyikannya sekalipun kolomnya
 *    sedang diawasi — yang dinyatakan orangnya selalu menang atas yang
 *    disimpulkan aplikasi.
 */
async function cardAudience(
  db: Db,
  cardId: string,
  workspaceId: string,
  actorId: string,
  /**
   * Kolom lain yang pengawasnya ikut dikabari. Dipakai perpindahan kartu:
   * kolom asalnya sudah tidak memuat kartu ini lagi saat kabarnya disusun,
   * padahal "kartu itu keluar dari sini" justru kabar untuk yang menjaganya.
   */
  alsoColumnId?: string,
): Promise<string[]> {
  const [participants, choices, columnWatchers, alsoWatchers, members] = await Promise.all([
    db
      .select({ userId: cardParticipants.userId })
      .from(cardParticipants)
      .where(eq(cardParticipants.cardId, cardId))
      .all(),

    db
      .select({ userId: cardWatches.userId, watching: cardWatches.watching })
      .from(cardWatches)
      .where(eq(cardWatches.cardId, cardId))
      .all(),

    db
      .select({ userId: columnWatches.userId })
      .from(columnWatches)
      .innerJoin(cards, eq(cards.columnId, columnWatches.columnId))
      .where(eq(cards.id, cardId))
      .all(),

    alsoColumnId
      ? db
          .select({ userId: columnWatches.userId })
          .from(columnWatches)
          .where(eq(columnWatches.columnId, alsoColumnId))
          .all()
      : [],

    memberIds(db, workspaceId),
  ]);

  const watching = new Set<string>();
  for (const row of participants) watching.add(row.userId);
  for (const row of columnWatchers) watching.add(row.userId);
  for (const row of alsoWatchers) watching.add(row.userId);
  for (const row of choices) {
    if (row.watching) watching.add(row.userId);
    else watching.delete(row.userId);
  }

  watching.delete(actorId);

  return [...watching].filter((id) => members.has(id));
}

/**
 * Anggota workspace pemilik board, selain pelakunya — beserta nama boardnya,
 * yang ikut terbawa join ini sehingga tidak perlu query kedua.
 */
async function boardAudience(db: Db, boardId: string, actorId: string) {
  const rows = await db
    .select({
      userId: workspaceMembers.userId,
      workspaceId: boards.workspaceId,
      boardTitle: boards.title,
    })
    .from(workspaceMembers)
    .innerJoin(boards, eq(boards.workspaceId, workspaceMembers.workspaceId))
    .where(and(eq(boards.id, boardId), ne(workspaceMembers.userId, actorId)))
    .all();

  return {
    workspaceId: rows[0]?.workspaceId ?? null,
    boardTitle: rows[0]?.boardTitle ?? "Papan",
    userIds: rows.map((row) => row.userId),
  };
}

/**
 * Papan beserta workspace pemiliknya: namanya jadi baris pertama notifikasi,
 * workspace-nya jadi konteks penyaring kotak masuk.
 */
async function boardScope(db: Db, boardId: string) {
  const row = await db
    .select({ workspaceId: boards.workspaceId, title: boards.title })
    .from(boards)
    .where(eq(boards.id, boardId))
    .get();

  return row ?? null;
}

interface CardNews {
  cardId: string;
  boardId: string;
  /** Judul kartu — disebut di dalam kalimatnya, bukan di baris judul. */
  cardTitle: string;
  /** Kalimatnya, sudah utuh: "Rina menulis di “Perbaiki login”: …". */
  body: string;
  /**
   * Penerima yang sudah dikumpulkan lebih dulu. Hanya dipakai penghapusan
   * kartu: daftar pesertanya ikut terhapus bersama kartunya, jadi harus
   * dibaca selagi masih ada.
   */
  watchers?: string[];
  /** Kolom yang baru saja ditinggalkan kartu ini — pengawasnya ikut dikabari. */
  fromColumnId?: string;
}

/**
 * Kabari pengawas sebuah kartu. Aman dipanggil tanpa `await` — seluruh
 * pekerjaannya, termasuk mencari penerimanya, berjalan setelah respons pergi.
 *
 * Tidak diekspor: rute cukup menyebutkan apa yang terjadi lewat salah satu
 * pembungkus di bawah, supaya seluruh kalimat notifikasi lahir di berkas ini.
 */
function notifyCard(c: Context<AppEnv>, channel: "comments" | "changes", news: CardNews): void {
  const db = c.get("db");
  const actorId = c.get("user").id;

  c.executionCtx.waitUntil(
    (async () => {
      const board = await boardScope(db, news.boardId);

      // Boardnya keburu hilang di antara aksi dan kabarnya — tidak ada lagi
      // konteks yang bisa ditulis, dan tidak ada lagi yang perlu dikabari.
      if (!board) return;

      const watchers =
        news.watchers ??
        (await cardAudience(db, news.cardId, board.workspaceId, actorId, news.fromColumnId));

      await announce(c, {
        userIds: watchers,
        channel,
        workspaceId: board.workspaceId,
        boardId: news.boardId,
        cardId: news.cardId,
        title: board.title,
        body: news.body,
      });
    })(),
  );
}

/**
 * Ubah catatan lini masa jadi satu kalimat utuh:
 * "Rina menambahkan label “Mendesak” pada “Perbaiki login”".
 *
 * Kartunya ikut disebut — beda dengan baris lini masa, yang sudah berdiri di
 * dalam kartunya. Notifikasi dibaca jauh dari sana, dan kalimat tanpa objek
 * ("memindahkan dari Backlog ke Selesai") memaksa orang menebak apa yang
 * sebenarnya berpindah.
 */
function sentence(actorName: string, cardTitle: string, notes: ActivityNote[]): string | null {
  if (notes.length === 0) return null;

  const phrases = notes.map((note) =>
    describeNotification(note.kind, note.detail ?? null, cardTitle),
  );

  return `${actorName} ${phrases.join(" dan ")}`;
}

/**
 * Kabari peserta kartu tentang perubahan yang baru dicatat di lini masanya.
 * Aksi yang tidak meninggalkan catatan apa pun juga tidak mengabari siapa pun.
 */
export function notifyCardActivity(
  c: Context<AppEnv>,
  news: Omit<CardNews, "body"> & { notes?: ActivityNote | ActivityNote[] },
): void {
  const notes = news.notes ? [news.notes].flat() : [];
  const body = sentence(c.get("user").name, news.cardTitle, notes);
  if (!body) return;

  notifyCard(c, "changes", { ...news, body });
}

/** Followup baru: isinya sendiri yang jadi kabarnya, di kartu yang disebut namanya. */
export function notifyComment(
  c: Context<AppEnv>,
  news: Omit<CardNews, "body"> & { comment: string },
): void {
  notifyCard(c, "comments", {
    ...news,
    body: `${c.get("user").name} ${describeComment(news.cardTitle, news.comment)}`,
  });
}

/**
 * Kartu yang dihapus. Penerimanya harus sudah dikumpulkan lebih dulu lewat
 * `watchersBeforeDelete` — daftar pesertanya ikut lenyap bersama kartunya.
 */
export function notifyCardDeleted(c: Context<AppEnv>, news: Omit<CardNews, "body">): void {
  notifyCard(c, "changes", {
    ...news,
    body: `${c.get("user").name} ${describeCardDeleted(news.cardTitle)}`,
  });
}

/**
 * Kabari yang perlu tahu bahwa ada kartu baru — lewat dua kabar yang berbeda,
 * karena bagi dua kelompok ini kejadiannya memang bukan hal yang sama.
 *
 * Bagi pengawas kolomnya ini kabar tentang sesuatu yang mereka ikuti, jadi ia
 * datang sebagai `changes`: bercerita tentang kartunya, dan ikut aturan kanal
 * yang defaultnya nyala. Bagi seluruh anggota workspace ini siaran — kartu di
 * papan yang belum tentu mereka pedulikan — dan tetap `newCards`, kanal yang
 * defaultnya mati. Tidak ada yang menerima dua-duanya.
 */
export function notifyNewCard(
  c: Context<AppEnv>,
  news: { boardId: string; cardId: string; cardTitle: string; columnTitle: string },
): void {
  const db = c.get("db");
  const actor = c.get("user");

  c.executionCtx.waitUntil(
    (async () => {
      const { workspaceId, boardTitle, userIds } = await boardAudience(db, news.boardId, actor.id);
      if (!workspaceId) return;

      /* Kartunya baru lahir, jadi satu-satunya pesertanya adalah pembuatnya —
         yang sudah tersaring sebagai pelaku. Yang tersisa dari daftar ini
         persis para pengawas kolomnya. */
      const watchers = await cardAudience(db, news.cardId, workspaceId, actor.id);
      const watching = new Set(watchers);

      const context = { workspaceId, boardId: news.boardId, cardId: news.cardId };

      await announce(c, {
        ...context,
        userIds: watchers,
        channel: "changes",
        title: boardTitle,
        // Pengawas kolomnya perlu tahu kolom mana yang bertambah isi.
        body: `${actor.name} ${describeNewCard(news.cardTitle)} di kolom “${news.columnTitle}”`,
      });

      await announce(c, {
        ...context,
        userIds: userIds.filter((id) => !watching.has(id)),
        channel: "newCards",
        title: boardTitle,
        body: `${actor.name} ${describeNewCard(news.cardTitle)}`,
      });
    })(),
  );
}

/** Pengawas kartu, dibaca lebih dulu karena kartunya sebentar lagi dihapus. */
export async function watchersBeforeDelete(
  c: Context<AppEnv>,
  cardId: string,
  boardId: string,
): Promise<string[]> {
  const db = c.get("db");
  const board = await boardScope(db, boardId);
  if (!board) return [];

  return cardAudience(db, cardId, board.workspaceId, c.get("user").id);
}
