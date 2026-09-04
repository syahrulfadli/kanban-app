import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import {
  cardActivities,
  cardComments,
  cardLabels,
  cardParticipants,
  cardWatches,
  cards,
  checklistItems,
  columns,
  labels,
  user,
  type Db,
} from "../db";
import type { SessionUser } from "./auth";
import type {
  ActivityDetail,
  ActivityKind,
  CardSummary,
  ChecklistProgress,
  UserBrief,
} from "../shared/types";

/** Apa yang perlu dicatat di lini masa kartu untuk satu aksi. */
export interface ActivityNote {
  kind: ActivityKind;
  detail?: ActivityDetail;
}

/**
 * Sesi Better Auth membawa seluruh baris user (termasuk emailVerified dan
 * stempel waktunya). Yang boleh keluar hanya empat kolom ini — sama persis
 * dengan yang dikembalikan query pembacaan, jadi bentuknya tidak berubah-ubah
 * tergantung endpoint mana yang menjawab.
 */
export const toBrief = (u: SessionUser): UserBrief => ({
  id: u.id,
  name: u.name,
  email: u.email,
  image: u.image ?? null,
});

/** Bagian kartu yang tidak tersimpan di baris `cards` itu sendiri. */
export interface CardExtras {
  labels: CardSummary["labels"];
  checklist: ChecklistProgress;
  commentCount: number;
  participants: UserBrief[];
  watching: boolean;
}

const EMPTY_EXTRAS = (): CardExtras => ({
  labels: [],
  checklist: { total: 0, done: 0 },
  commentCount: 0,
  participants: [],
  watching: false,
});

/**
 * Lingkup pengambilan: satu kartu, sekumpulan kartu, atau semua kartu di
 * sebuah board.
 *
 * Lingkup board dipasang sebagai subquery `card_id IN (SELECT …)`, bukan daftar
 * id yang dibentangkan — satu parameter terikat berapa pun banyaknya kartu,
 * jadi board besar tidak menabrak batas parameter D1. Lingkup `cardIds` justru
 * membentangkannya, dan itu aman karena yang memakainya — hasil pencarian —
 * memang sudah dibatasi segenggam baris.
 */
export type CardScope = { boardId: string } | { cardId: string } | { cardIds: string[] };

function scoped(db: Db, column: AnySQLiteColumn, scope: CardScope) {
  if ("cardId" in scope) return eq(column, scope.cardId);
  if ("cardIds" in scope) return inArray(column, scope.cardIds);

  const ids = db
    .select({ id: cards.id })
    .from(cards)
    .innerJoin(columns, eq(cards.columnId, columns.id))
    .where(eq(columns.boardId, scope.boardId));

  return inArray(column, ids);
}

/** Tabel bantu: kunci baru diisi saat pertama kali dibutuhkan. */
function bucket(map: Map<string, CardExtras>, cardId: string) {
  let extras = map.get(cardId);
  if (!extras) map.set(cardId, (extras = EMPTY_EXTRAS()));
  return extras;
}

/**
 * Label, progress checklist, jumlah followup, peserta, dan keadaan Awasi untuk
 * sekumpulan kartu — lima query tetap, tidak peduli berapa kartu yang diminta.
 *
 * `viewerId` hanya dipakai keadaan Awasi, yang memang pertanyaan tentang orang
 * yang sedang melihat, bukan tentang kartunya.
 */
export async function loadCardExtras(
  db: Db,
  scope: CardScope,
  viewerId: string,
): Promise<Map<string, CardExtras>> {
  const [labelRows, checklistRows, commentRows, participantRows, watchRows] = await Promise.all([
    db
      .select({ cardId: cardLabels.cardId, label: labels })
      .from(cardLabels)
      .innerJoin(labels, eq(cardLabels.labelId, labels.id))
      .where(scoped(db, cardLabels.cardId, scope))
      .orderBy(asc(labels.createdAt))
      .all(),

    db
      .select({
        cardId: checklistItems.cardId,
        total: sql<number>`count(*)`,
        done: sql<number>`sum(case when ${checklistItems.done} then 1 else 0 end)`,
      })
      .from(checklistItems)
      .where(scoped(db, checklistItems.cardId, scope))
      .groupBy(checklistItems.cardId)
      .all(),

    db
      .select({ cardId: cardComments.cardId, total: sql<number>`count(*)` })
      .from(cardComments)
      .where(scoped(db, cardComments.cardId, scope))
      .groupBy(cardComments.cardId)
      .all(),

    db
      .select({
        cardId: cardParticipants.cardId,
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(cardParticipants)
      .innerJoin(user, eq(cardParticipants.userId, user.id))
      .where(scoped(db, cardParticipants.cardId, scope))
      .orderBy(asc(cardParticipants.firstActiveAt))
      .all(),

    db
      .select({ cardId: cardWatches.cardId, watching: cardWatches.watching })
      .from(cardWatches)
      .where(and(scoped(db, cardWatches.cardId, scope), eq(cardWatches.userId, viewerId)))
      .all(),
  ]);

  const map = new Map<string, CardExtras>();

  for (const row of labelRows) bucket(map, row.cardId).labels.push(row.label);

  for (const row of checklistRows) {
    bucket(map, row.cardId).checklist = { total: row.total, done: row.done ?? 0 };
  }

  for (const row of commentRows) bucket(map, row.cardId).commentCount = row.total;

  for (const { cardId, ...person } of participantRows) {
    bucket(map, cardId).participants.push(person);
  }

  /* Aturan bawaannya: menyentuh kartu berarti mengawasinya. Dihitung dari
     daftar peserta yang sudah ada di tangan, bukan dari query keenam. */
  for (const extras of map.values()) {
    extras.watching = extras.participants.some((p) => p.id === viewerId);
  }

  // Pilihan manual menimpanya — termasuk ketika pilihannya "jangan".
  for (const row of watchRows) bucket(map, row.cardId).watching = row.watching;

  return map;
}

export const extrasFor = (map: Map<string, CardExtras>, cardId: string): CardExtras =>
  map.get(cardId) ?? EMPTY_EXTRAS();

/**
 * Catat bahwa `userId` menyentuh kartu ini, tandai kartunya sebagai baru
 * diubah, dan — kalau aksinya membawa `note` — tulis satu baris ke lini masa.
 *
 * Dipanggil dari setiap aksi pada kartu — membuat, menyunting, memberi label,
 * mencentang checklist, menulis followup — karena deretan avatar pada kartu
 * justru diturunkan dari jejak ini.
 */
export async function markCardActivity(
  db: Db,
  cardId: string,
  userId: string,
  options: { touchCard?: boolean; note?: ActivityNote | ActivityNote[] } = {},
): Promise<Date> {
  const now = new Date();

  await db
    .insert(cardParticipants)
    .values({ cardId, userId, firstActiveAt: now, lastActiveAt: now })
    // `firstActiveAt` sengaja tidak ikut diperbarui: itulah yang mengurutkan
    // avatar, dan pembuat kartu harus tetap berdiri paling depan.
    .onConflictDoUpdate({
      target: [cardParticipants.cardId, cardParticipants.userId],
      set: { lastActiveAt: now },
    });

  if (options.touchCard !== false) {
    await db
      .update(cards)
      .set({ updatedAt: now, updatedBy: userId })
      .where(eq(cards.id, cardId));
  }

  const notes = options.note ? [options.note].flat() : [];

  if (notes.length > 0) {
    await db.insert(cardActivities).values(
      notes.map((note, i) => ({
        id: nanoid(),
        cardId,
        userId,
        kind: note.kind,
        detail: note.detail ?? null,
        // Satu milidetik selisih per catatan: dua kejadian dari satu aksi
        // harus tetap terurut sama setiap kali lini masanya dibaca ulang.
        createdAt: new Date(now.getTime() + i),
      })),
    );
  }

  return now;
}

/** Peserta yang tidak lagi punya jejak apa pun di kartu — dilepas dari avatar. */
export async function pruneParticipant(db: Db, cardId: string, userId: string) {
  const stillCommenting = await db
    .select({ id: cardComments.id })
    .from(cardComments)
    .where(and(eq(cardComments.cardId, cardId), eq(cardComments.userId, userId)))
    .limit(1)
    .get();

  if (stillCommenting) return;

  const card = await db
    .select({ createdBy: cards.createdBy, updatedBy: cards.updatedBy })
    .from(cards)
    .where(eq(cards.id, cardId))
    .get();

  if (card?.createdBy === userId || card?.updatedBy === userId) return;

  await db
    .delete(cardParticipants)
    .where(and(eq(cardParticipants.cardId, cardId), eq(cardParticipants.userId, userId)));
}
