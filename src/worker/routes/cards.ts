import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";
import {
  boards,
  cardActivities,
  cardComments,
  cardLabels,
  cardMembers,
  cardParticipants,
  cardWatches,
  cards,
  checklistItems,
  columns,
  labels,
  user,
  workspaceMembers,
  workspaces,
  type Db,
} from "../../db";
import type { AppEnv } from "../auth";
import {
  assertAuthor,
  assertRole,
  requireCard,
  requireChecklistItem,
  requireColumn,
  requireComment,
  requireLabel,
} from "../guards";
import { touchBoard } from "../realtime";
import { relabelForBoard } from "../transfer";
import {
  notifyCardActivity,
  notifyCardDeleted,
  notifyComment,
  notifyNewCard,
  watchersBeforeDelete,
} from "../notify";
import {
  extrasFor,
  loadCardExtras,
  markCardActivity,
  pruneParticipant,
  toBrief,
  type ActivityNote,
} from "../card-data";
import { evenPositions, needsRebalance, positionBetween } from "../../shared/position";
import { MIN_QUERY_LENGTH, matchesQuery, snippetAround } from "../../shared/search";
import type { CardDetail, CardSearchHit, CardSummary, UserBrief } from "../../shared/types";

/**
 * Sebanyak apa hasil pencarian dijawab sekaligus.
 *
 * Bukan halaman pertama dari sesuatu yang bisa ditelusuri lebih jauh: pencarian
 * di aplikasi ini dipakai untuk menemukan satu kartu yang sudah ada di kepala
 * orangnya, dan daftar yang lebih panjang dari ini dijawab dengan mengetik
 * satu kata lagi, bukan dengan menggulir.
 */
const SEARCH_LIMIT = 20;

/* `%` dan `_` punya arti khusus di dalam LIKE. Tanpa dilolosi, mengetik "_"
   akan mencocokkan huruf apa pun — dan "%" mencocokkan segalanya. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/** Kartu + segala yang menggantung padanya — payload untuk dialog kartu. */
async function buildCardDetail(
  db: Db,
  cardId: string,
  boardId: string,
  workspaceId: string,
  viewerId: string,
): Promise<CardDetail> {
  const [card, extrasMap, items, comments, activities] = await Promise.all([
    db.select().from(cards).where(eq(cards.id, cardId)).get(),

    loadCardExtras(db, { cardId }, viewerId),

    db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.cardId, cardId))
      .orderBy(asc(checklistItems.position))
      .all(),

    db
      .select({
        comment: cardComments,
        author: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      })
      .from(cardComments)
      .innerJoin(user, eq(cardComments.userId, user.id))
      .where(eq(cardComments.cardId, cardId))
      .orderBy(asc(cardComments.createdAt))
      .all(),

    /* Left join, bukan inner: pelaku yang sudah keluar dari tim menyisakan
       `user_id` null, dan barisnya tetap harus muncul di lini masa. */
    db
      .select({
        activity: cardActivities,
        actor: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      })
      .from(cardActivities)
      .leftJoin(user, eq(cardActivities.userId, user.id))
      .where(eq(cardActivities.cardId, cardId))
      .orderBy(asc(cardActivities.createdAt))
      .all(),
  ]);

  if (!card) throw new Error("Kartu hilang di tengah pembacaan");

  const extras = extrasFor(extrasMap, cardId);
  // Pembuat dan penyunting pasti tercatat sebagai peserta, jadi identitasnya
  // diambil dari daftar itu alih-alih dua query tambahan.
  const byId = (id: string | null): UserBrief | null =>
    (id && extras.participants.find((p) => p.id === id)) || null;

  return {
    ...card,
    ...extras,
    boardId,
    workspaceId,
    checklistItems: items,
    comments: comments.map(({ comment, author }) => ({ ...comment, author })),
    activities: activities.map(({ activity, actor }) => ({
      ...activity,
      actor: actor?.id ? actor : null,
    })),
    createdByUser: byId(card.createdBy),
    updatedByUser: byId(card.updatedBy),
  };
}

const app = new Hono<AppEnv>()

  .post(
    "/",
    zValidator(
      "json",
      z.object({
        columnId: z.string().min(1),
        title: z.string().trim().min(1).max(500),
        description: z.string().max(5000).nullish(),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const body = c.req.valid("json");
      const { column, boardId } = await requireColumn(db, body.columnId, userId);

      const existing = await db
        .select({ position: cards.position })
        .from(cards)
        .where(eq(cards.columnId, column.id))
        .orderBy(asc(cards.position))
        .all();

      const now = new Date();
      const card = {
        id: nanoid(),
        columnId: column.id,
        title: body.title,
        description: body.description ?? null,
        position: positionBetween(existing.at(-1)?.position ?? null, null),
        createdBy: userId,
        updatedBy: userId,
        // Kartu baru selalu lahir tanpa tenggat; ia dipasang belakangan, di
        // dialognya, oleh orang yang sudah tahu kapan kartu ini harus selesai.
        dueAt: null,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(cards).values(card);
      await markCardActivity(db, card.id, userId, {
        touchCard: false,
        note: { kind: "card_created" },
      });
      await touchBoard(c, boardId);
      notifyNewCard(c, {
        boardId,
        cardId: card.id,
        cardTitle: card.title,
        columnTitle: column.title,
      });

      // Kartu baru masih kosong; klien tidak perlu menariknya ulang.
      const summary: CardSummary = {
        ...card,
        labels: [],
        checklist: { total: 0, done: 0 },
        commentCount: 0,
        participants: [toBrief(c.get("user"))],
        members: [],
        // Membuat kartu berarti mengawasinya — lewat jejaknya sebagai peserta.
        watching: true,
      };

      return c.json(summary, 201);
    },
  )

  /* ── Followup & checklist ──────────────────────────────────────────
     Rute per-butir didaftarkan lebih dulu dan memakai prefiks harfiah,
     supaya "/comments/:id" tidak pernah tertangkap oleh "/:id". */

  .patch(
    "/comments/:commentId",
    zValidator("json", z.object({ body: z.string().trim().min(1).max(5000) })),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { comment, cardId, boardId } = await requireComment(
        db,
        c.req.param("commentId"),
        userId,
      );
      assertAuthor(comment.userId, userId);

      const updated = await db
        .update(cardComments)
        .set({ body: c.req.valid("json").body, updatedAt: new Date() })
        .where(eq(cardComments.id, comment.id))
        .returning()
        .get();

      await markCardActivity(db, cardId, userId);
      await touchBoard(c, boardId);

      return c.json(updated);
    },
  )

  .delete("/comments/:commentId", async (c) => {
    const db = c.get("db");
    const userId = c.get("user").id;
    const { comment, cardId, cardTitle, boardId, role } = await requireComment(
      db,
      c.req.param("commentId"),
      userId,
    );

    // Penulis boleh menghapus miliknya sendiri; selain itu perlu admin.
    if (comment.userId !== userId) assertRole(role, "admin");

    await db.delete(cardComments).where(eq(cardComments.id, comment.id));
    await pruneParticipant(db, cardId, comment.userId);
    const note = { kind: "comment_deleted" } as const;
    await markCardActivity(db, cardId, userId, { note });
    await touchBoard(c, boardId);
    notifyCardActivity(c, { cardId, boardId, cardTitle, notes: note });

    return c.body(null, 204);
  })

  .patch(
    "/checklist/:itemId",
    zValidator(
      "json",
      z.object({
        text: z.string().trim().min(1).max(500).optional(),
        done: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { item, cardId, cardTitle, boardId } = await requireChecklistItem(
        db,
        c.req.param("itemId"),
        userId,
      );
      const body = c.req.valid("json");

      const updated = await db
        .update(checklistItems)
        .set({
          ...(body.text !== undefined && { text: body.text }),
          ...(body.done !== undefined && { done: body.done }),
        })
        .where(eq(checklistItems.id, item.id))
        .returning()
        .get();

      /* Yang dicatat adalah perubahan yang benar-benar terjadi: mengirim
         teks yang sama persis tidak meninggalkan jejak apa pun. */
      const notes: ActivityNote[] = [];
      if (body.done !== undefined && body.done !== item.done) {
        notes.push({
          kind: body.done ? "checklist_checked" : "checklist_unchecked",
          detail: { text: updated.text },
        });
      }
      if (body.text !== undefined && body.text !== item.text) {
        notes.push({ kind: "checklist_renamed", detail: { from: item.text, to: body.text } });
      }

      await markCardActivity(db, cardId, userId, { note: notes });
      await touchBoard(c, boardId);
      notifyCardActivity(c, { cardId, boardId, cardTitle, notes });

      return c.json(updated);
    },
  )

  .delete("/checklist/:itemId", async (c) => {
    const db = c.get("db");
    const userId = c.get("user").id;
    const { item, cardId, cardTitle, boardId } = await requireChecklistItem(
      db,
      c.req.param("itemId"),
      userId,
    );

    const note = { kind: "checklist_removed", detail: { text: item.text } } as const;

    await db.delete(checklistItems).where(eq(checklistItems.id, item.id));
    await markCardActivity(db, cardId, userId, { note });
    await touchBoard(c, boardId);
    notifyCardActivity(c, { cardId, boardId, cardTitle, notes: note });

    return c.body(null, 204);
  })

  /**
   * Cari kartu di seluruh papan yang boleh dibuka orang ini.
   *
   * Yang ikut dicocokkan bukan hanya judul dan deskripsi, tapi juga nama label
   * dan nama orang yang menyentuh kartunya: "kartu Rina yang Mendesak itu"
   * adalah cara orang benar-benar mengingat kartu, dan keduanya tidak pernah
   * tertulis di judulnya.
   *
   * LIKE, bukan FTS5: tabel bayangan FTS harus dijaga tetap sinkron lewat
   * trigger di setiap tulis, dan pada papan sebesar yang muat di free tier,
   * pemindaian biasa yang dibatasi keanggotaan sudah jauh lebih cepat daripada
   * ongkos merawatnya. Kalau kelak papannya membesar, di sinilah tempatnya
   * diganti.
   *
   * Berdiri sebelum "/:id" supaya "search" tidak terbaca sebagai id kartu.
   */
  .get(
    "/search",
    zValidator(
      "query",
      z.object({ q: z.string().trim().min(MIN_QUERY_LENGTH).max(120) }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { q } = c.req.valid("query");

      const pattern = `%${escapeLike(q)}%`;
      // SQLite mencocokkan LIKE tanpa memandang besar-kecil huruf untuk ASCII;
      // aturan yang sama dipakai klien saat menandai potongan yang cocok.
      const like = (column: AnySQLiteColumn) => sql`${column} LIKE ${pattern} ESCAPE '\\'`;

      const byLabel = db
        .select({ id: cardLabels.cardId })
        .from(cardLabels)
        .innerJoin(labels, eq(cardLabels.labelId, labels.id))
        .where(like(labels.name));

      const byPerson = db
        .select({ id: cardParticipants.cardId })
        .from(cardParticipants)
        .innerJoin(user, eq(cardParticipants.userId, user.id))
        .where(or(like(user.name), like(user.email)));

      /* Keanggotaan workspace yang membatasi jangkauannya — join yang sama
         dengan yang dipakai guard, dan satu-satunya yang menjaga pencarian
         tidak berubah jadi cara membaca papan orang lain. */
      const rows = await db
        .select({
          id: cards.id,
          title: cards.title,
          description: cards.description,
          columnTitle: columns.title,
          boardId: boards.id,
          boardTitle: boards.title,
          workspaceName: workspaces.name,
        })
        .from(cards)
        .innerJoin(columns, eq(cards.columnId, columns.id))
        .innerJoin(boards, eq(columns.boardId, boards.id))
        .innerJoin(workspaces, eq(boards.workspaceId, workspaces.id))
        .innerJoin(
          workspaceMembers,
          and(
            eq(workspaceMembers.workspaceId, workspaces.id),
            eq(workspaceMembers.userId, userId),
          ),
        )
        .where(
          or(
            like(cards.title),
            like(cards.description),
            inArray(cards.id, byLabel),
            inArray(cards.id, byPerson),
          ),
        )
        /* Judul yang cocok naik ke atas — itu kartu yang memang dicari
           namanya. Sisanya urut dari yang terakhir disentuh, karena di antara
           kartu yang sama-sama menyebut kata itu, yang masih dikerjakan hampir
           selalu yang dimaksud. */
        .orderBy(desc(like(cards.title)), desc(cards.updatedAt))
        .limit(SEARCH_LIMIT)
        .all();

      if (rows.length === 0) return c.json([] satisfies CardSearchHit[]);

      const extras = await loadCardExtras(db, { cardIds: rows.map((row) => row.id) }, userId);

      const hits: CardSearchHit[] = rows.map((row) => {
        const { labels: attached, participants } = extrasFor(extras, row.id);

        return {
          id: row.id,
          title: row.title,
          snippet: snippetAround(row.description, q),
          boardId: row.boardId,
          boardTitle: row.boardTitle,
          workspaceName: row.workspaceName,
          columnTitle: row.columnTitle,
          labels: attached,
          participants,
          /* Dihitung di sini, bukan lewat query keenam: label dan pesertanya
             sudah ada di tangan, dan aturan cocoknya sama dengan yang barusan
             dipakai SQL. */
          matchedLabelIds: attached
            .filter((label) => matchesQuery(label.name, q))
            .map((label) => label.id),
          matchedUserIds: participants
            .filter((person) => matchesQuery(person.name, q) || matchesQuery(person.email, q))
            .map((person) => person.id),
        };
      });

      return c.json(hits);
    },
  )

  .get("/:id", async (c) => {
    const db = c.get("db");
    const userId = c.get("user").id;
    const { card, boardId, workspaceId } = await requireCard(db, c.req.param("id"), userId);

    return c.json(await buildCardDetail(db, card.id, boardId, workspaceId, userId));
  })

  /**
   * Awasi kartu ini, atau berhenti mengawasinya.
   *
   * Selalu menulis baris — juga saat jawabannya "jangan". Baris itulah yang
   * membuat pilihannya bertahan: tanpa ia, aturan bawaan akan menyalakan
   * kembali Awasi di followup berikutnya orang yang sama (lihat `card_watches`
   * di skema). Tidak memanggil `touchBoard`, karena yang berubah cuma keadaan
   * satu orang.
   */
  .post(
    "/:id/watch",
    zValidator("json", z.object({ watching: z.boolean() })),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { card } = await requireCard(db, c.req.param("id"), userId);
      const { watching } = c.req.valid("json");

      await db
        .insert(cardWatches)
        .values({ cardId: card.id, userId, watching, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [cardWatches.cardId, cardWatches.userId],
          set: { watching, updatedAt: new Date() },
        });

      return c.json({ watching });
    },
  )

  .patch(
    "/:id",
    zValidator(
      "json",
      z.object({
        title: z.string().trim().min(1).max(500).optional(),
        description: z.string().max(5000).nullish(),
        /* Tenggat tiba sebagai ISO — dengan zona, karena itu satu-satunya
           bentuk yang tidak berubah arti di perjalanan. Null menghapusnya, dan
           karena itu ia harus benar-benar terkirim, bukan dihilangkan dari
           payload seperti nilai kosong lainnya. */
        dueAt: z.iso.datetime().nullish(),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { card, boardId } = await requireCard(db, c.req.param("id"), userId);
      const body = c.req.valid("json");

      const dueAt = body.dueAt ? new Date(body.dueAt) : null;
      const dueChanged =
        body.dueAt !== undefined && (card.dueAt?.getTime() ?? null) !== (dueAt?.getTime() ?? null);

      const updated = await db
        .update(cards)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.dueAt !== undefined && { dueAt }),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id))
        .returning()
        .get();

      const notes: ActivityNote[] = [];
      if (body.title !== undefined && body.title !== card.title) {
        notes.push({ kind: "title_changed", detail: { from: card.title, to: body.title } });
      }
      if (body.description !== undefined && (body.description ?? null) !== card.description) {
        notes.push({ kind: "description_changed", detail: { to: body.description ?? null } });
      }
      /* Tanggalnya dicatat sebagai ISO, bukan sebagai kalimat jadi: yang
         membacanya nanti bisa berada di zona mana pun, dan hanya perambannya
         yang tahu jam berapa itu baginya. */
      if (dueChanged) {
        notes.push(
          dueAt
            ? {
                kind: "due_changed",
                detail: { from: card.dueAt?.toISOString() ?? null, to: dueAt.toISOString() },
              }
            : { kind: "due_cleared" },
        );
      }

      await markCardActivity(db, card.id, userId, { touchCard: false, note: notes });
      await touchBoard(c, boardId);
      notifyCardActivity(c, {
        cardId: card.id,
        boardId,
        cardTitle: updated.title,
        notes,
      });

      return c.json(updated);
    },
  )

  /**
   * Pindahkan kartu ke `index` dalam `columnId` (boleh kolom lain).
   * Posisi dihitung di server supaya klien tidak perlu tahu soal fractional index.
   */
  .post(
    "/:id/move",
    zValidator(
      "json",
      z.object({
        columnId: z.string().min(1),
        index: z.number().int().min(0),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { card, boardId } = await requireCard(db, c.req.param("id"), userId);
      const { columnId, index } = c.req.valid("json");

      // Kolom tujuan harus ada di board milik user yang sama.
      const target = await requireColumn(db, columnId, userId);
      if (target.boardId !== boardId) {
        return c.json({ error: "Kolom tujuan ada di board lain" }, 400);
      }

      // Kartu lain di kolom tujuan, terurut — kandidat tetangga posisi baru.
      let siblings = await db
        .select({ id: cards.id, position: cards.position })
        .from(cards)
        .where(and(eq(cards.columnId, columnId), ne(cards.id, card.id)))
        .orderBy(asc(cards.position))
        .all();

      let before = siblings[index - 1]?.position ?? null;
      let after = siblings[index]?.position ?? null;

      if (needsRebalance(before, after)) {
        const fresh = evenPositions(siblings.length);
        await db.batch(
          siblings.map((s, i) =>
            db.update(cards).set({ position: fresh[i] }).where(eq(cards.id, s.id)),
          ) as any,
        );
        siblings = siblings.map((s, i) => ({ ...s, position: fresh[i] }));
        before = siblings[index - 1]?.position ?? null;
        after = siblings[index]?.position ?? null;
      }

      const updated = await db
        .update(cards)
        .set({
          columnId,
          position: positionBetween(before, after),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id))
        .returning()
        .get();

      /* Hanya perpindahan antarkolom yang dicatat: menggeser kartu ke atas
         atau ke bawah di kolom yang sama bukan kabar bagi siapa pun. */
      const from =
        columnId === card.columnId
          ? null
          : await db
              .select({ title: columns.title })
              .from(columns)
              .where(eq(columns.id, card.columnId))
              .get();

      const note = from
        ? ({ kind: "card_moved", detail: { from: from.title, to: target.column.title } } as const)
        : undefined;

      await markCardActivity(db, card.id, userId, { touchCard: false, note });
      await touchBoard(c, boardId);
      notifyCardActivity(c, {
        cardId: card.id,
        boardId,
        cardTitle: card.title,
        notes: note,
        // Kartunya sudah pindah, jadi kolom asalnya harus disebut sendiri —
        // pengawasnya tidak akan ditemukan lagi lewat kartu ini.
        fromColumnId: from ? card.columnId : undefined,
      });

      return c.json(updated);
    },
  )

  /**
   * Pindahkan kartu ke sebuah kolom di papan LAIN.
   *
   * Berdiri sendiri, tidak menumpang "/move", karena yang dikerjakannya memang
   * bukan hal yang sama: perpindahan di dalam papan cuma menghitung posisi —
   * dan itu dijalankan tiap kali seseorang menyeret kartu — sedangkan pindah
   * papan harus ikut mengurus label yang menempel padanya, mengabari dua papan
   * sekaligus, dan menyebut papan tujuan di lini masa.
   *
   * Tidak menerima `index`: kartunya mendarat di ujung kolom tujuan. Tidak ada
   * urutan yang bisa dipilih orang yang memindahkannya — ia sedang melihat
   * papan asal, bukan papan tujuan.
   */
  .post(
    "/:id/transfer",
    zValidator("json", z.object({ columnId: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { card, boardId } = await requireCard(db, c.req.param("id"), userId);
      const { columnId } = c.req.valid("json");

      const target = await requireColumn(db, columnId, userId);
      if (target.boardId === boardId) {
        return c.json({ error: "Kolom tujuan ada di papan ini — pakai tarik-lepas" }, 400);
      }

      const board = await db
        .select({ title: boards.title })
        .from(boards)
        .where(eq(boards.id, target.boardId))
        .get();

      const last = await db
        .select({ position: cards.position })
        .from(cards)
        .where(eq(cards.columnId, columnId))
        .orderBy(asc(cards.position))
        .all();

      const updated = await db
        .update(cards)
        .set({
          columnId,
          position: positionBetween(last.at(-1)?.position ?? null, null),
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id))
        .returning()
        .get();

      // Label dimiliki papan: yang menempel di kartu ini harus dicarikan
      // padanannya di papan tujuan — lihat catatan di worker/transfer.ts.
      await relabelForBoard(db, { cardId: card.id }, target.boardId);

      const note = {
        kind: "card_transferred",
        detail: { to: target.column.title, text: board?.title },
      } as const;

      await markCardActivity(db, card.id, userId, { touchCard: false, note });

      // Dua papan yang berubah, dua papan yang harus menggambar ulang.
      await touchBoard(c, boardId);
      await touchBoard(c, target.boardId);

      notifyCardActivity(c, {
        cardId: card.id,
        boardId: target.boardId,
        cardTitle: card.title,
        notes: note,
        // Kartunya sudah pergi dari sana, jadi pengawas kolom asal tidak akan
        // ditemukan lagi lewat kartu ini — padahal justru merekalah yang perlu
        // tahu bahwa isinya berkurang satu.
        fromColumnId: card.columnId,
      });

      return c.json({ ...updated, boardId: target.boardId });
    },
  )

  .delete("/:id", async (c) => {
    const db = c.get("db");
    const sessionUser = c.get("user");
    const { card, boardId } = await requireCard(db, c.req.param("id"), sessionUser.id);

    // Daftar pesertanya ikut lenyap bersama kartunya, jadi harus dibaca selagi
    // barisnya masih ada.
    const watchers = await watchersBeforeDelete(c, card.id, boardId);

    await db.delete(cards).where(eq(cards.id, card.id));
    await touchBoard(c, boardId);
    notifyCardDeleted(c, {
      cardId: card.id,
      boardId,
      cardTitle: card.title,
      watchers,
    });

    return c.body(null, 204);
  })

  /* ── Orang pada kartu ──────────────────────────────────────────────
     Yang boleh diundang hanya anggota workspace pemilik papannya. Undangan
     tidak memberi akses — orangnya sudah punya akses sejak jadi anggota; yang
     diberikannya perhatian: wajahnya muncul di muka kartu dan kabar dari
     kartu itu mulai sampai kepadanya (lihat `cardAudience` di notify.ts). */

  .post(
    "/:id/members",
    zValidator("json", z.object({ userId: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const actorId = c.get("user").id;
      const { card, boardId, workspaceId } = await requireCard(db, c.req.param("id"), actorId);
      const { userId: inviteeId } = c.req.valid("json");

      /* Keanggotaan dan identitasnya ditanyakan sekaligus: yang dikembalikan
         ke klien adalah wajah orangnya, dan yang menjaga rutenya adalah baris
         keanggotaan yang sama. */
      const invitee = await db
        .select({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(workspaceMembers)
        .innerJoin(user, eq(user.id, workspaceMembers.userId))
        .where(
          and(
            eq(workspaceMembers.workspaceId, workspaceId),
            eq(workspaceMembers.userId, inviteeId),
          ),
        )
        .get();

      if (!invitee) {
        return c.json({ error: "Orang itu bukan anggota workspace papan ini" }, 400);
      }

      // Mengundang orang yang sudah diundang bukan kesalahan — klien
      // optimistik boleh mengulang tanpa memicu error.
      const inserted = await db
        .insert(cardMembers)
        .values({
          cardId: card.id,
          userId: invitee.id,
          invitedBy: actorId,
          createdAt: new Date(),
        })
        .onConflictDoNothing()
        .returning()
        .get();

      /* Undangan yang tidak mengubah apa pun juga tidak diceritakan: tanpa
         penjagaan ini, klien yang mengulang kiriman akan menumpuk baris
         "mengundang Rina" di lini masa kartu yang sama. */
      const note = inserted
        ? ({ kind: "member_added", detail: { text: invitee.name } } as const)
        : undefined;

      await markCardActivity(db, card.id, actorId, { note });
      await touchBoard(c, boardId);
      notifyCardActivity(c, {
        cardId: card.id,
        boardId,
        cardTitle: card.title,
        notes: note,
      });

      return c.json(invitee satisfies UserBrief, 201);
    },
  )

  .delete("/:id/members/:userId", async (c) => {
    const db = c.get("db");
    const actorId = c.get("user").id;
    const { card, boardId } = await requireCard(db, c.req.param("id"), actorId);
    const inviteeId = c.req.param("userId");

    // Namanya dibaca sebelum barisnya dilepas — lini masa menyimpan salinannya,
    // sama seperti nama label yang dicabut.
    const invitee = await db
      .select({ name: user.name })
      .from(cardMembers)
      .innerJoin(user, eq(user.id, cardMembers.userId))
      .where(and(eq(cardMembers.cardId, card.id), eq(cardMembers.userId, inviteeId)))
      .get();

    await db
      .delete(cardMembers)
      .where(and(eq(cardMembers.cardId, card.id), eq(cardMembers.userId, inviteeId)));

    const note = invitee
      ? ({ kind: "member_removed", detail: { text: invitee.name } } as const)
      : undefined;

    await markCardActivity(db, card.id, actorId, { note });
    await touchBoard(c, boardId);
    notifyCardActivity(c, { cardId: card.id, boardId, cardTitle: card.title, notes: note });

    return c.body(null, 204);
  })

  /* ── Label pada kartu ──────────────────────────────────────────────
     Label sendiri milik board (lihat routes/labels.ts); di sini hanya
     dipasang dan dilepas. */

  .post(
    "/:id/labels",
    zValidator("json", z.object({ labelId: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { card, boardId } = await requireCard(db, c.req.param("id"), userId);
      const { label, boardId: labelBoardId } = await requireLabel(
        db,
        c.req.valid("json").labelId,
        userId,
      );

      if (labelBoardId !== boardId) {
        return c.json({ error: "Label itu milik board lain" }, 400);
      }

      // Memasang label yang sudah terpasang bukan kesalahan — klien optimistik
      // boleh mengulang tanpa memicu error.
      await db
        .insert(cardLabels)
        .values({ cardId: card.id, labelId: label.id })
        .onConflictDoNothing();

      const note = {
        kind: "label_added",
        detail: { text: label.name, color: label.color },
      } as const;

      await markCardActivity(db, card.id, userId, { note });
      await touchBoard(c, boardId);
      notifyCardActivity(c, { cardId: card.id, boardId, cardTitle: card.title, notes: note });

      return c.json(label, 201);
    },
  )

  .delete("/:id/labels/:labelId", async (c) => {
    const db = c.get("db");
    const userId = c.get("user").id;
    const { card, boardId } = await requireCard(db, c.req.param("id"), userId);
    const labelId = c.req.param("labelId");

    // Namanya dibaca sebelum dilepas — lini masa menyimpan salinannya, jadi
    // catatan tetap terbaca meski labelnya kelak dihapus dari board.
    const label = await db
      .select({ name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.id, labelId))
      .get();

    await db
      .delete(cardLabels)
      .where(and(eq(cardLabels.cardId, card.id), eq(cardLabels.labelId, labelId)));

    const note = label
      ? ({ kind: "label_removed", detail: { text: label.name, color: label.color } } as const)
      : undefined;

    await markCardActivity(db, card.id, userId, { note });
    await touchBoard(c, boardId);
    notifyCardActivity(c, { cardId: card.id, boardId, cardTitle: card.title, notes: note });

    return c.body(null, 204);
  })

  .post(
    "/:id/comments",
    zValidator("json", z.object({ body: z.string().trim().min(1).max(5000) })),
    async (c) => {
      const db = c.get("db");
      const sessionUser = c.get("user");
      const { card, boardId } = await requireCard(db, c.req.param("id"), sessionUser.id);

      const now = new Date();
      const comment = {
        id: nanoid(),
        cardId: card.id,
        userId: sessionUser.id,
        body: c.req.valid("json").body,
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(cardComments).values(comment);
      await markCardActivity(db, card.id, sessionUser.id);
      await touchBoard(c, boardId);
      notifyComment(c, {
        cardId: card.id,
        boardId,
        cardTitle: card.title,
        comment: comment.body,
      });

      return c.json({ ...comment, author: toBrief(sessionUser) }, 201);
    },
  )

  .post(
    "/:id/checklist",
    zValidator("json", z.object({ text: z.string().trim().min(1).max(500) })),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { card, boardId } = await requireCard(db, c.req.param("id"), userId);

      const existing = await db
        .select({ position: checklistItems.position })
        .from(checklistItems)
        .where(eq(checklistItems.cardId, card.id))
        .orderBy(asc(checklistItems.position))
        .all();

      const item = {
        id: nanoid(),
        cardId: card.id,
        text: c.req.valid("json").text,
        done: false,
        position: positionBetween(existing.at(-1)?.position ?? null, null),
        createdAt: new Date(),
      };

      const note = { kind: "checklist_added", detail: { text: item.text } } as const;

      await db.insert(checklistItems).values(item);
      await markCardActivity(db, card.id, userId, { note });
      await touchBoard(c, boardId);
      notifyCardActivity(c, { cardId: card.id, boardId, cardTitle: card.title, notes: note });

      return c.json(item, 201);
    },
  );

export default app;
