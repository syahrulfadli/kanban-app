import { and, eq, inArray, isNull, lt, ne, or } from "drizzle-orm";
import type { Context } from "hono";
import { nanoid } from "nanoid";
import {
  boards,
  cardParticipants,
  notificationPrefs,
  notifications,
  pushSubscriptions,
  workspaceMembers,
  type Db,
} from "../db";
import type { AppEnv } from "./auth";
import type { ActivityNote } from "./card-data";
import { createPusher } from "./push";
import { describeActivity } from "../shared/activity";

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
  /** Judul kartu — atau nama papan, untuk kabar kartu baru. */
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
 * Peserta kartu selain pelakunya — mereka inilah "anggota" sebuah kartu.
 *
 * Keanggotaan workspace ikut diperiksa: jejak seseorang di `card_participants`
 * tidak ikut terhapus saat ia dikeluarkan dari tim, dan tanpa penjagaan ini ia
 * akan terus menerima kabar tentang papan yang sudah tidak boleh ia buka.
 */
async function cardWatchers(
  db: Db,
  cardId: string,
  boardId: string,
  actorId: string,
): Promise<string[]> {
  const rows = await db
    .select({ userId: cardParticipants.userId })
    .from(cardParticipants)
    .innerJoin(boards, eq(boards.id, boardId))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, boards.workspaceId),
        eq(workspaceMembers.userId, cardParticipants.userId),
      ),
    )
    .where(and(eq(cardParticipants.cardId, cardId), ne(cardParticipants.userId, actorId)))
    .all();

  return rows.map((row) => row.userId);
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

/** Workspace pemilik sebuah board — konteks yang dipakai penyaring kotak masuk. */
async function boardWorkspace(db: Db, boardId: string): Promise<string | null> {
  const row = await db
    .select({ workspaceId: boards.workspaceId })
    .from(boards)
    .where(eq(boards.id, boardId))
    .get();

  return row?.workspaceId ?? null;
}

interface CardNews {
  cardId: string;
  boardId: string;
  /** Judul kartu — jadi baris pertama notifikasi. */
  cardTitle: string;
  /** Kalimatnya, sudah utuh: "Rina menulis followup: …". */
  body: string;
  /**
   * Penerima yang sudah dikumpulkan lebih dulu. Hanya dipakai penghapusan
   * kartu: daftar pesertanya ikut terhapus bersama kartunya, jadi harus
   * dibaca selagi masih ada.
   */
  watchers?: string[];
}

/**
 * Kabari peserta sebuah kartu. Aman dipanggil tanpa `await` — seluruh
 * pekerjaannya, termasuk mencari penerimanya, berjalan setelah respons pergi.
 */
export function notifyCard(
  c: Context<AppEnv>,
  channel: "comments" | "changes",
  news: CardNews,
): void {
  const db = c.get("db");
  const actorId = c.get("user").id;

  c.executionCtx.waitUntil(
    (async () => {
      const [watchers, workspaceId] = await Promise.all([
        news.watchers ?? cardWatchers(db, news.cardId, news.boardId, actorId),
        boardWorkspace(db, news.boardId),
      ]);

      // Boardnya keburu hilang di antara aksi dan kabarnya — tidak ada lagi
      // konteks yang bisa ditulis, dan tidak ada lagi yang perlu dikabari.
      if (!workspaceId) return;

      await announce(c, {
        userIds: watchers,
        channel,
        workspaceId,
        boardId: news.boardId,
        cardId: news.cardId,
        title: news.cardTitle,
        body: news.body,
      });
    })(),
  );
}

/**
 * Ubah catatan lini masa jadi satu kalimat: "Rina menambahkan label “Mendesak”".
 *
 * Kalimatnya dipinjam dari lini masa kartu, bukan ditulis ulang di sini —
 * dengan begitu notifikasi dan riwayat kartu selalu menceritakan kejadian yang
 * sama dengan kata-kata yang sama.
 */
function sentence(actorName: string, notes: ActivityNote[]): string | null {
  if (notes.length === 0) return null;

  const phrases = notes.map((note) => {
    const { verb, subject } = describeActivity(note.kind, note.detail ?? null);
    return subject ? `${verb} “${subject}”` : verb;
  });

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
  const body = sentence(c.get("user").name, news.notes ? [news.notes].flat() : []);
  if (!body) return;

  notifyCard(c, "changes", { ...news, body });
}

/** Kabari seluruh anggota workspace bahwa ada kartu baru di salah satu papannya. */
export function notifyNewCard(
  c: Context<AppEnv>,
  news: { boardId: string; cardId: string; cardTitle: string },
): void {
  const db = c.get("db");
  const actor = c.get("user");

  c.executionCtx.waitUntil(
    (async () => {
      const { workspaceId, boardTitle, userIds } = await boardAudience(db, news.boardId, actor.id);
      if (!workspaceId) return;

      await announce(c, {
        userIds,
        channel: "newCards",
        workspaceId,
        boardId: news.boardId,
        cardId: news.cardId,
        title: boardTitle,
        body: `${actor.name} menambahkan kartu “${news.cardTitle}”`,
      });
    })(),
  );
}

/** Peserta kartu, dibaca lebih dulu karena kartunya sebentar lagi dihapus. */
export function watchersBeforeDelete(
  c: Context<AppEnv>,
  cardId: string,
  boardId: string,
): Promise<string[]> {
  return cardWatchers(c.get("db"), cardId, boardId, c.get("user").id);
}
