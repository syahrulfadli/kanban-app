import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  boards,
  cards,
  columnWatches,
  columns,
  labels,
  workspaceMembers,
  workspaces,
} from "../../db";
import type { AppEnv } from "../auth";
import { assertRole, requireBoard, requireMembership } from "../guards";
import { notifyBoard } from "../realtime";
import { VIEWER_PARAM } from "../board-room";
import { extrasFor, loadCardExtras } from "../card-data";
import type { BoardDetail, MoveTargetWorkspace, UserBrief } from "../../shared/types";

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
      const userId = c.get("user").id;
      await requireMembership(db, workspaceId, userId);

      const now = new Date();
      const board = { id: nanoid(), workspaceId, title, createdAt: now, updatedAt: now };
      const starters = DEFAULT_COLUMNS.map((columnTitle, i) => ({
        id: nanoid(),
        boardId: board.id,
        title: columnTitle,
        position: (i + 1) * 1024,
        createdAt: now,
      }));

      /* Kolom bawaan ini tetap kolom yang dibuat orangnya — ia menekan "buat
         papan" dan ketiganya muncul — jadi ia mengawasinya, sama seperti kolom
         yang ia ketik sendiri nanti. Papan baru biasanya papan yang sedang
         digarap; kalau ternyata tidak, matanya tinggal dimatikan. */
      await db.batch([
        db.insert(boards).values(board),
        ...starters.map((column) => db.insert(columns).values(column)),
        ...starters.map((column) =>
          db.insert(columnWatches).values({ columnId: column.id, userId, createdAt: now }),
        ),
      ] as never);

      return c.json(board, 201);
    },
  )

  /**
   * Ke mana sebuah kolom atau kartu boleh dipindahkan: seluruh papan yang
   * boleh dibuka orang ini, dikelompokkan per workspace, lengkap dengan kolom
   * masing-masing.
   *
   * Satu tarikan untuk seluruh pemilih, bukan satu per papan yang dibuka:
   * daftar ini dibaca saat dialognya muncul, dan orang yang memindahkan kartu
   * belum tahu papan mana yang akan ia pilih. Isinya sengaja sesempit itu —
   * id dan nama — jadi puluhan papan pun masih satu payload kecil.
   *
   * Berdiri sebelum "/:id" supaya "destinations" tidak terbaca sebagai id.
   */
  .get("/destinations", async (c) => {
    const db = c.get("db");

    const rows = await db
      .select({
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        boardId: boards.id,
        boardTitle: boards.title,
        columnId: columns.id,
        columnTitle: columns.title,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .innerJoin(boards, eq(boards.workspaceId, workspaces.id))
      /* Left join: papan yang belum punya kolom tetap harus muncul. Ia bukan
         tujuan yang sah untuk kartu — kartu butuh kolom — tapi kolom boleh
         mendarat di sana, dan papan yang hilang dari daftar terbaca sebagai
         papan yang tidak boleh dibuka. */
      .leftJoin(columns, eq(columns.boardId, boards.id))
      .where(eq(workspaceMembers.userId, c.get("user").id))
      .orderBy(asc(workspaces.name), asc(boards.title), asc(columns.position))
      .all();

    const spaces = new Map<string, MoveTargetWorkspace>();

    for (const row of rows) {
      let space = spaces.get(row.workspaceId);
      if (!space) {
        space = { id: row.workspaceId, name: row.workspaceName, boards: [] };
        spaces.set(row.workspaceId, space);
      }

      let board = space.boards.at(-1);
      if (board?.id !== row.boardId) {
        board = { id: row.boardId, title: row.boardTitle, columns: [] };
        space.boards.push(board);
      }

      if (row.columnId) board.columns.push({ id: row.columnId, title: row.columnTitle! });
    }

    return c.json([...spaces.values()]);
  })

  /**
   * Kanal realtime board. Upgrade WebSocket dari browser tetap membawa cookie
   * sesi, jadi pemeriksaan keanggotaan yang sama berlaku di sini.
   */
  .get("/:id/ws", async (c) => {
    const { board } = await requireBoard(c.get("db"), c.req.param("id"), c.get("user").id);
    const { id, name, email, image } = c.get("user");

    /* Identitas penonton ditempelkan di sini, dari sesi yang barusan
       diperiksa — bukan dikirim klien. Papan memakainya untuk menjawab "siapa
       saja yang sedang membuka papan ini", dan jawaban itu tidak boleh bisa
       ditulis sendiri oleh tab yang bertanya. */
    const url = new URL(c.req.url);
    url.searchParams.set(
      VIEWER_PARAM,
      JSON.stringify({ id, name, email, image: image ?? null } satisfies UserBrief),
    );

    const stub = c.env.BOARD_ROOM.get(c.env.BOARD_ROOM.idFromName(board.id));
    return stub.fetch(new Request(url, c.req.raw));
  })

  .get("/:id", async (c) => {
    const db = c.get("db");
    const userId = c.get("user").id;
    const { board, role } = await requireBoard(db, c.req.param("id"), userId);

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

    // Label, progress checklist, jumlah followup, peserta, dan keadaan Awasi
    // ikut terangkut di payload board: kartu dan kolom harus bisa menggambar
    // semuanya tanpa dibuka dulu.
    const [extras, boardLabels, watched] = await Promise.all([
      loadCardExtras(db, { boardId: board.id }, userId),
      db
        .select()
        .from(labels)
        .where(eq(labels.boardId, board.id))
        .orderBy(asc(labels.createdAt)),
      db
        .select({ columnId: columnWatches.columnId })
        .from(columnWatches)
        .innerJoin(columns, eq(columns.id, columnWatches.columnId))
        .where(and(eq(columns.boardId, board.id), eq(columnWatches.userId, userId)))
        .all(),
    ]);

    const watchedColumns = new Set(watched.map((row) => row.columnId));

    const detail: BoardDetail = {
      ...board,
      role,
      labels: boardLabels,
      columns: cols.map((col) => ({
        ...col,
        watching: watchedColumns.has(col.id),
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
