import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { asc, eq, ne, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { columns } from "../../db";
import type { AppEnv } from "../auth";
import { requireBoard, requireColumn } from "../guards";
import { touchBoard } from "../realtime";
import { evenPositions, needsRebalance, positionBetween } from "../../shared/position";

const app = new Hono<AppEnv>()

  .post(
    "/",
    zValidator(
      "json",
      z.object({
        boardId: z.string().min(1),
        title: z.string().trim().min(1).max(120),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const { boardId, title } = c.req.valid("json");
      const { board } = await requireBoard(db, boardId, c.get("user").id);

      const last = await db
        .select({ position: columns.position })
        .from(columns)
        .where(eq(columns.boardId, board.id))
        .orderBy(asc(columns.position))
        .all();

      const column = {
        id: nanoid(),
        boardId: board.id,
        title,
        position: positionBetween(last.at(-1)?.position ?? null, null),
        createdAt: new Date(),
      };

      await db.insert(columns).values(column);
      await touchBoard(c, board.id);

      return c.json(column, 201);
    },
  )

  .patch(
    "/:id",
    zValidator("json", z.object({ title: z.string().trim().min(1).max(120) })),
    async (c) => {
      const db = c.get("db");
      const { column } = await requireColumn(db, c.req.param("id"), c.get("user").id);

      const updated = await db
        .update(columns)
        .set({ title: c.req.valid("json").title })
        .where(eq(columns.id, column.id))
        .returning()
        .get();

      await touchBoard(c, column.boardId);
      return c.json(updated);
    },
  )

  /** Pindahkan kolom ke posisi `index` dalam board yang sama. */
  .post(
    "/:id/move",
    zValidator("json", z.object({ index: z.number().int().min(0) })),
    async (c) => {
      const db = c.get("db");
      const { column } = await requireColumn(db, c.req.param("id"), c.get("user").id);
      const { index } = c.req.valid("json");

      // Daftar kolom lain, terurut — kandidat tetangga posisi baru.
      let siblings = await db
        .select({ id: columns.id, position: columns.position })
        .from(columns)
        .where(and(eq(columns.boardId, column.boardId), ne(columns.id, column.id)))
        .orderBy(asc(columns.position))
        .all();

      let before = siblings[index - 1]?.position ?? null;
      let after = siblings[index]?.position ?? null;

      if (needsRebalance(before, after)) {
        const fresh = evenPositions(siblings.length);
        await db.batch(
          siblings.map((s, i) =>
            db.update(columns).set({ position: fresh[i] }).where(eq(columns.id, s.id)),
          ) as any,
        );
        siblings = siblings.map((s, i) => ({ ...s, position: fresh[i] }));
        before = siblings[index - 1]?.position ?? null;
        after = siblings[index]?.position ?? null;
      }

      const updated = await db
        .update(columns)
        .set({ position: positionBetween(before, after) })
        .where(eq(columns.id, column.id))
        .returning()
        .get();

      await touchBoard(c, column.boardId);
      return c.json(updated);
    },
  )

  .delete("/:id", async (c) => {
    const db = c.get("db");
    const { column } = await requireColumn(db, c.req.param("id"), c.get("user").id);

    await db.delete(columns).where(eq(columns.id, column.id));
    await touchBoard(c, column.boardId);

    return c.body(null, 204);
  });

export default app;
