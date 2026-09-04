import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { asc, eq, ne, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { columnWatches, columns, COLUMN_COLORS } from "../../db";
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
      const userId = c.get("user").id;
      const { board } = await requireBoard(db, boardId, userId);

      const last = await db
        .select({ position: columns.position })
        .from(columns)
        .where(eq(columns.boardId, board.id))
        .orderBy(asc(columns.position))
        .all();

      const now = new Date();
      const column = {
        id: nanoid(),
        boardId: board.id,
        title,
        position: positionBetween(last.at(-1)?.position ?? null, null),
        createdAt: now,
      };

      /* Membuat kolom berarti mengawasinya — orang yang membuka tempat baru di
         papan hampir selalu orang yang ingin tahu apa yang mendarat di sana. */
      await db.batch([
        db.insert(columns).values(column),
        db.insert(columnWatches).values({ columnId: column.id, userId, createdAt: now }),
      ] as never);
      await touchBoard(c, board.id);

      return c.json({ ...column, watching: true }, 201);
    },
  )

  /* Tambal sebagian: judul dan warna datang dari dua gerakan yang berbeda
     (ganti nama, pilih warna) dan tidak pernah dikirim bersama. Warna boleh
     null — itulah cara kolom dikembalikan ke tanpa warna — jadi "ada di
     payload" tidak bisa diwakili nilainya sendiri dan harus diperiksa
     lewat kehadiran kuncinya. */
  .patch(
    "/:id",
    zValidator(
      "json",
      z
        .object({
          title: z.string().trim().min(1).max(120).optional(),
          color: z.enum(COLUMN_COLORS).nullable().optional(),
        })
        .refine((v) => v.title !== undefined || v.color !== undefined, {
          message: "Tidak ada yang diubah",
        }),
    ),
    async (c) => {
      const db = c.get("db");
      const { column } = await requireColumn(db, c.req.param("id"), c.get("user").id);
      const patch = c.req.valid("json");

      const updated = await db
        .update(columns)
        .set({
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.color !== undefined && { color: patch.color }),
        })
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

  /**
   * Awasi kolom ini, atau berhenti mengawasinya.
   *
   * Sengaja tidak memanggil `touchBoard`: yang berubah cuma keadaan satu orang,
   * dan tidak ada gunanya memaksa seisi papan menarik ulang datanya hanya
   * karena seseorang menyalakan matanya sendiri.
   */
  .post(
    "/:id/watch",
    zValidator("json", z.object({ watching: z.boolean() })),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { column } = await requireColumn(db, c.req.param("id"), userId);
      const { watching } = c.req.valid("json");

      /* Kehadiran barisnya sudah berarti "diawasi", jadi berhenti mengawasi
         cukup menghapusnya — tidak ada aturan bawaan yang perlu dibantah,
         berbeda dengan kartu (lihat `card_watches` di skema). */
      if (watching) {
        await db
          .insert(columnWatches)
          .values({ columnId: column.id, userId, createdAt: new Date() })
          .onConflictDoNothing();
      } else {
        await db
          .delete(columnWatches)
          .where(and(eq(columnWatches.columnId, column.id), eq(columnWatches.userId, userId)));
      }

      return c.json({ watching });
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
