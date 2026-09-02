import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Context } from "hono";
import {
  boards,
  cardParticipants,
  notificationPrefs,
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

/** Peserta kartu selain pelakunya — mereka inilah "anggota" sebuah kartu. */
async function cardWatchers(db: Db, cardId: string, actorId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: cardParticipants.userId })
    .from(cardParticipants)
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
    .select({ userId: workspaceMembers.userId, boardTitle: boards.title })
    .from(workspaceMembers)
    .innerJoin(boards, eq(boards.workspaceId, workspaceMembers.workspaceId))
    .where(and(eq(boards.id, boardId), ne(workspaceMembers.userId, actorId)))
    .all();

  return { boardTitle: rows[0]?.boardTitle ?? "Papan", userIds: rows.map((row) => row.userId) };
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
  // Tanpa kunci VAPID tidak ada notifikasi sama sekali; tidak perlu ada satu
  // query pun yang jalan untuk menemukan itu.
  if (!c.env.VAPID_PUBLIC_KEY) return;

  const db = c.get("db");
  const actorId = c.get("user").id;

  c.executionCtx.waitUntil(
    (async () => {
      const watchers = news.watchers ?? (await cardWatchers(db, news.cardId, actorId));

      await deliver(c, watchers, channel, {
        title: clip(news.cardTitle, TITLE_MAX),
        body: clip(news.body),
        // Satu tag per kartu: sepuluh perubahan beruntun meninggalkan satu
        // notifikasi di layar kunci, bukan sepuluh.
        tag: `card:${news.cardId}`,
        url: `/#/board/${news.boardId}/card/${news.cardId}`,
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
  if (!c.env.VAPID_PUBLIC_KEY) return;

  const body = sentence(c.get("user").name, news.notes ? [news.notes].flat() : []);
  if (!body) return;

  notifyCard(c, "changes", { ...news, body });
}

/** Kabari seluruh anggota workspace bahwa ada kartu baru di salah satu papannya. */
export function notifyNewCard(
  c: Context<AppEnv>,
  news: { boardId: string; cardId: string; cardTitle: string },
): void {
  if (!c.env.VAPID_PUBLIC_KEY) return;

  const db = c.get("db");
  const actor = c.get("user");

  c.executionCtx.waitUntil(
    (async () => {
      const { boardTitle, userIds } = await boardAudience(db, news.boardId, actor.id);

      await deliver(c, userIds, "newCards", {
        title: clip(boardTitle, TITLE_MAX),
        body: clip(`${actor.name} menambahkan kartu “${news.cardTitle}”`),
        tag: `card:${news.cardId}`,
        url: `/#/board/${news.boardId}/card/${news.cardId}`,
      });
    })(),
  );
}

/** Peserta kartu, dibaca lebih dulu karena kartunya sebentar lagi dihapus. */
export function watchersBeforeDelete(
  c: Context<AppEnv>,
  cardId: string,
): Promise<string[]> | undefined {
  if (!c.env.VAPID_PUBLIC_KEY) return undefined;
  return cardWatchers(c.get("db"), cardId, c.get("user").id);
}
