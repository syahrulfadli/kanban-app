import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  cardActivities,
  cardComments,
  cardLabels,
  cards,
  checklistItems,
  columns,
  labels,
  user,
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
import {
  notifyCard,
  notifyCardActivity,
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
import type { CardDetail, CardSummary, UserBrief } from "../../shared/types";

/** Kartu + segala yang menggantung padanya — payload untuk dialog kartu. */
async function buildCardDetail(db: Db, cardId: string, boardId: string): Promise<CardDetail> {
  const [card, extrasMap, items, comments, activities] = await Promise.all([
    db.select().from(cards).where(eq(cards.id, cardId)).get(),

    loadCardExtras(db, { cardId }),

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
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(cards).values(card);
      await markCardActivity(db, card.id, userId, {
        touchCard: false,
        note: { kind: "card_created" },
      });
      await touchBoard(c, boardId);
      notifyNewCard(c, { boardId, cardId: card.id, cardTitle: card.title });

      // Kartu baru masih kosong; klien tidak perlu menariknya ulang.
      const summary: CardSummary = {
        ...card,
        labels: [],
        checklist: { total: 0, done: 0 },
        commentCount: 0,
        participants: [toBrief(c.get("user"))],
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

  .get("/:id", async (c) => {
    const db = c.get("db");
    const { card, boardId } = await requireCard(db, c.req.param("id"), c.get("user").id);

    return c.json(await buildCardDetail(db, card.id, boardId));
  })

  .patch(
    "/:id",
    zValidator(
      "json",
      z.object({
        title: z.string().trim().min(1).max(500).optional(),
        description: z.string().max(5000).nullish(),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { card, boardId } = await requireCard(db, c.req.param("id"), userId);
      const body = c.req.valid("json");

      const updated = await db
        .update(cards)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
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
      });

      return c.json(updated);
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
    notifyCard(c, "changes", {
      cardId: card.id,
      boardId,
      cardTitle: card.title,
      body: `${sessionUser.name} menghapus kartu ini`,
      watchers,
    });

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
      notifyCard(c, "comments", {
        cardId: card.id,
        boardId,
        cardTitle: card.title,
        body: `${sessionUser.name}: ${comment.body}`,
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
