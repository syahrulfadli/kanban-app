import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { cards } from "../../db";
import type { AppEnv } from "../auth";
import { requireCard, requireColumn } from "../guards";
import { touchBoard } from "../realtime";
import { evenPositions, needsRebalance, positionBetween } from "../../shared/position";

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
      const body = c.req.valid("json");
      const { column, boardId } = await requireColumn(db, body.columnId, c.get("user").id);

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
        createdAt: now,
        updatedAt: now,
      };

      await db.insert(cards).values(card);
      await touchBoard(c, boardId);

      return c.json(card, 201);
    },
  )

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
      const { card, boardId } = await requireCard(db, c.req.param("id"), c.get("user").id);
      const body = c.req.valid("json");

      const updated = await db
        .update(cards)
        .set({
          ...(body.title !== undefined && { title: body.title }),
          ...(body.description !== undefined && { description: body.description }),
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id))
        .returning()
        .get();

      await touchBoard(c, boardId);
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
          updatedAt: new Date(),
        })
        .where(eq(cards.id, card.id))
        .returning()
        .get();

      await touchBoard(c, boardId);
      return c.json(updated);
    },
  )

  .delete("/:id", async (c) => {
    const db = c.get("db");
    const { card, boardId } = await requireCard(db, c.req.param("id"), c.get("user").id);

    await db.delete(cards).where(eq(cards.id, card.id));
    await touchBoard(c, boardId);

    return c.body(null, 204);
  });

export default app;
