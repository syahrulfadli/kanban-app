import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";
import {
  BOARD_GRADIENTS,
  backgroundImages,
  boards,
  cards,
  columnWatches,
  columns,
  labels,
  workspaceMembers,
  workspaces,
  type Db,
} from "../../db";
import type { AppEnv } from "../auth";
import { assertRole, requireBoard, requireMembership } from "../guards";
import { notifyBoard } from "../realtime";
import { VIEWER_PARAM } from "../board-room";
import { extrasFor, loadCardExtras } from "../card-data";
import { activeBackgrounds } from "./admin";
import type {
  BoardBackground,
  BoardDetail,
  MoveTargetWorkspace,
  UserBrief,
} from "../../shared/types";

const DEFAULT_COLUMNS = ["To Do", "In Progress", "Done"];

/**
 * Sepasang kolom di database jadi satu nilai yang bisa digambar.
 *
 * Gambar yang sudah tidak ada jatuh ke "default" alih-alih membuat papannya
 * gagal dimuat: latar adalah hiasan, dan hiasan yang hilang tidak boleh
 * menghalangi orang membuka pekerjaannya. Itu juga jaring untuk papan yang
 * sempat menunjuk gambar yang dihapus di luar rute penghapusan.
 */
async function resolveBackground(
  db: Db,
  kind: string,
  value: string | null,
): Promise<BoardBackground> {
  if (kind === "gradient") {
    const gradient = BOARD_GRADIENTS.find((name) => name === value);
    return gradient ? { kind: "gradient", gradient } : { kind: "default" };
  }

  if (kind === "image" && value) {
    const image = await db
      .select({
        id: backgroundImages.id,
        name: backgroundImages.name,
        url: backgroundImages.url,
        photographer: backgroundImages.photographer,
        photographerUrl: backgroundImages.photographerUrl,
      })
      .from(backgroundImages)
      .where(eq(backgroundImages.id, value))
      .get();

    return image ? { kind: "image", image } : { kind: "default" };
  }

  return { kind: "default" };
}

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
   * Gambar latar yang boleh dipilih. Terbuka untuk siapa pun yang sudah
   * masuk, bukan hanya admin: yang dikurasi admin adalah daftarnya, dan yang
   * memilih dari daftar itu setiap anggota papan.
   *
   * Berdiri sebelum "/:id", sama seperti "destinations".
   */
  .get("/backgrounds", async (c) => c.json(await activeBackgrounds(c.get("db"))))

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
    const [extras, boardLabels, watched, background] = await Promise.all([
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
      resolveBackground(db, board.backgroundKind, board.backgroundValue),
    ]);

    const watchedColumns = new Set(watched.map((row) => row.columnId));

    const detail: BoardDetail = {
      ...board,
      role,
      background,
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

  /**
   * Judul dan latar papan.
   *
   * Latar datang sebagai satu objek bertanda (`{ kind, value }`), bukan dua
   * field lepas: itu satu-satunya bentuk yang tidak bisa mengirim "gambar"
   * tanpa gambarnya. Zod yang menegakkannya, jadi kombinasi yang mustahil
   * ditolak sebelum menyentuh database.
   *
   * Siapa pun anggota workspace boleh mengubahnya — sama seperti judul.
   * Latar itu perabot bersama, dan menguncinya untuk admin berarti satu tim
   * yang seluruhnya anggota tidak pernah bisa mengganti latar papannya
   * sendiri.
   */
  .patch(
    "/:id",
    zValidator(
      "json",
      z.object({
        title: z.string().trim().min(1).max(120).optional(),
        background: z
          .discriminatedUnion("kind", [
            z.object({ kind: z.literal("default") }),
            z.object({ kind: z.literal("gradient"), value: z.enum(BOARD_GRADIENTS) }),
            z.object({ kind: z.literal("image"), value: z.string().min(1) }),
          ])
          .optional(),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const { board } = await requireBoard(db, c.req.param("id"), c.get("user").id);
      const patch = c.req.valid("json");

      /* Gambar yang dipilih harus ada DAN aktif. Yang nonaktif tetap terbaca
         di papan yang sudah memakainya, tapi tidak boleh dipilih baru —
         kalau tidak, "nonaktifkan" di panel admin tidak berarti apa-apa. */
      if (patch.background?.kind === "image") {
        const image = await db
          .select({ id: backgroundImages.id })
          .from(backgroundImages)
          .where(
            and(
              eq(backgroundImages.id, patch.background.value),
              eq(backgroundImages.active, true),
            ),
          )
          .get();

        if (!image) {
          throw new HTTPException(400, {
            message: "Gambar latar itu sudah tidak tersedia. Muat ulang pemilihnya.",
          });
        }
      }

      const updated = await db
        .update(boards)
        .set({
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.background !== undefined && {
            backgroundKind: patch.background.kind,
            backgroundValue:
              patch.background.kind === "default" ? null : patch.background.value,
          }),
          updatedAt: new Date(),
        })
        .where(eq(boards.id, board.id))
        .returning()
        .get();

      notifyBoard(c, board.id);

      return c.json({
        ...updated,
        background: await resolveBackground(
          db,
          updated.backgroundKind,
          updated.backgroundValue,
        ),
      });
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
