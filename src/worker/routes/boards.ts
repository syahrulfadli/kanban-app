import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import { boards, cards, columns, labels } from "../../db";
import type { AppEnv } from "../auth";
import { assertRole, requireBoard, requireMembership } from "../guards";
import { notifyBoard } from "../realtime";
import { extrasFor, loadCardExtras } from "../card-data";
import type { BoardDetail } from "../../shared/types";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];

const app = new Hono<AppEnv>()

  .get(
    "/",
    zValidator("query", z.object({ workspaceId: z.string().min(1) })),
    async (c) => {
      const db = c.get("db");
      const { workspaceId } = c.req.valid("query");
      await requireMembership(db, workspaceId, c.get("user").id);

      const rows = await db
        .select()
        .from(boards)
        .where(eq(boards.workspaceId, workspaceId))
        .orderBy(desc(boards.updatedAt));

      return c.json(rows);
    },
  )

  .post(
    "/",
    zValidator(
      "json",
      z.object({
        workspaceId: z.string().min(1),
        title: z.string().trim().min(1).max(120),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const { workspaceId, title } = c.req.valid("json");
      await requireMembership(db, workspaceId, c.get("user").id);

      const now = new Date();
      const board = { id: nanoid(), workspaceId, title, createdAt: now, updatedAt: now };

      await db.batch([
        db.insert(boards).values(board),
        ...DEFAULT_COLUMNS.map((columnTitle, i) =>
          db.insert(columns).values({
            id: nanoid(),
            boardId: board.id,
            title: columnTitle,
            position: (i + 1) * 1024,
            createdAt: now,
          }),
        ),
      ] as never);

      return c.json(board, 201);
    },
  )

  /**
   * Kanal realtime board. Upgrade WebSocket dari browser tetap membawa cookie
   * sesi, jadi pemeriksaan keanggotaan yang sama berlaku di sini.
   */
  .get("/:id/ws", async (c) => {
    const { board } = await requireBoard(c.get("db"), c.req.param("id"), c.get("user").id);

    const stub = c.env.BOARD_ROOM.get(c.env.BOARD_ROOM.idFromName(board.id));
    return stub.fetch(c.req.raw);
  })

  .get("/:id", async (c) => {
    const db = c.get("db");
    const { board, role } = await requireBoard(db, c.req.param("id"), c.get("user").id);

    const cols = await db
      .select()
      .from(columns)
      .where(eq(columns.boardId, board.id))
      .orderBy(asc(columns.position));

    const columnIds = cols.map((col) => col.id);
    const allCards = columnIds.length
      ? await db
          .select()
          .from(cards)
          .where(inArray(cards.columnId, columnIds))
          .orderBy(asc(cards.position))
      : [];

    // Label, progress checklist, jumlah followup, dan peserta ikut terangkut di
    // payload board: kartu harus bisa menggambar semuanya tanpa dibuka dulu.
    const [extras, boardLabels] = await Promise.all([
      loadCardExtras(db, { boardId: board.id }),
      db
        .select()
        .from(labels)
        .where(eq(labels.boardId, board.id))
        .orderBy(asc(labels.createdAt)),
    ]);

    const detail: BoardDetail = {
      ...board,
      role,
      labels: boardLabels,
      columns: cols.map((col) => ({
        ...col,
        cards: allCards
          .filter((card) => card.columnId === col.id)
          .map((card) => ({ ...card, ...extrasFor(extras, card.id) })),
      })),
    };

    return c.json(detail);
  })

  .patch(
    "/:id",
    zValidator("json", z.object({ title: z.string().trim().min(1).max(120) })),
    async (c) => {
      const db = c.get("db");
      const { board } = await requireBoard(db, c.req.param("id"), c.get("user").id);

      const updated = await db
        .update(boards)
        .set({ title: c.req.valid("json").title, updatedAt: new Date() })
        .where(eq(boards.id, board.id))
        .returning()
        .get();

      notifyBoard(c, board.id);
      return c.json(updated);
    },
  )

  .delete("/:id", async (c) => {
    const db = c.get("db");
    const { board, role } = await requireBoard(db, c.req.param("id"), c.get("user").id);
    assertRole(role, "admin");

    await db.delete(boards).where(eq(boards.id, board.id));
    notifyBoard(c, board.id);

    return c.body(null, 204);
  });

export default app;
