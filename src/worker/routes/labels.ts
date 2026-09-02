import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { LABEL_COLORS, labels } from "../../db";
import type { AppEnv } from "../auth";
import { requireBoard, requireLabel } from "../guards";
import { touchBoard } from "../realtime";

const color = z.enum(LABEL_COLORS);
const name = z.string().trim().min(1).max(60);

/**
 * Label hidup di tingkat board, bukan kartu: sekali dibuat ia jadi bagian dari
 * kosakata board itu dan bisa dipasang ke kartu mana pun di dalamnya.
 */
const app = new Hono<AppEnv>()

  .post(
    "/",
    zValidator("json", z.object({ boardId: z.string().min(1), name, color })),
    async (c) => {
      const db = c.get("db");
      const body = c.req.valid("json");
      const { board } = await requireBoard(db, body.boardId, c.get("user").id);

      const label = {
        id: nanoid(),
        boardId: board.id,
        name: body.name,
        color: body.color,
        createdAt: new Date(),
      };

      await db.insert(labels).values(label);
      await touchBoard(c, board.id);

      return c.json(label, 201);
    },
  )

  .patch(
    "/:id",
    zValidator("json", z.object({ name: name.optional(), color: color.optional() })),
    async (c) => {
      const db = c.get("db");
      const { label, boardId } = await requireLabel(db, c.req.param("id"), c.get("user").id);
      const body = c.req.valid("json");

      const updated = await db
        .update(labels)
        .set({
          ...(body.name !== undefined && { name: body.name }),
          ...(body.color !== undefined && { color: body.color }),
        })
        .where(eq(labels.id, label.id))
        .returning()
        .get();

      await touchBoard(c, boardId);
      return c.json(updated);
    },
  )

  /** Menghapus label mencabutnya dari semua kartu sekaligus (cascade). */
  .delete("/:id", async (c) => {
    const db = c.get("db");
    const { label, boardId } = await requireLabel(db, c.req.param("id"), c.get("user").id);

    await db.delete(labels).where(eq(labels.id, label.id));
    await touchBoard(c, boardId);

    return c.body(null, 204);
  });

export default app;
