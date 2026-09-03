import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, count, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { boards, notifications, user, workspaces, type Db } from "../../db";
import type { AppEnv } from "../auth";
import type { NotificationItem, NotificationScope } from "../../shared/types";

/** Sekali tarik memuat sebanyak ini; sisanya lewat `cursor`. */
const PAGE_SIZE = 20;

/**
 * Penanda halaman: stempel waktu dan id, dipisah titik dua.
 *
 * Id ikut dibawa karena satu aksi bisa melahirkan beberapa baris pada
 * milidetik yang sama; tanpa pembeda kedua, baris kembar itu akan terlewat
 * atau muncul dua kali di halaman berikutnya.
 */
function decodeCursor(value: string | undefined) {
  if (!value) return null;

  const [at, id] = value.split(":");
  const millis = Number(at);
  if (!Number.isFinite(millis) || !id) return null;

  return { at: new Date(millis), id };
}

const encodeCursor = (item: { createdAt: Date; id: string }) =>
  `${item.createdAt.getTime()}:${item.id}`;

/** Berapa yang belum dibaca di seluruh kotak masuk orang ini. */
async function unreadCount(db: Db, userId: string): Promise<number> {
  const row = await db
    .select({ total: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .get();

  return row?.total ?? 0;
}

/**
 * Pilihan penyaring beserta jumlah yang belum dibaca di masing-masing.
 * Satu query bergrup: papan yang tidak punya kabar apa pun tidak ikut muncul.
 */
async function scopesFor(db: Db, userId: string): Promise<NotificationScope[]> {
  const rows = await db
    .select({
      workspaceId: notifications.workspaceId,
      workspaceName: workspaces.name,
      boardId: notifications.boardId,
      boardTitle: boards.title,
      unread: sql<number>`sum(case when ${notifications.readAt} is null then 1 else 0 end)`,
      newest: sql<number>`max(${notifications.createdAt})`,
    })
    .from(notifications)
    .innerJoin(workspaces, eq(workspaces.id, notifications.workspaceId))
    .innerJoin(boards, eq(boards.id, notifications.boardId))
    .where(eq(notifications.userId, userId))
    .groupBy(notifications.workspaceId, notifications.boardId)
    .all();

  const byWorkspace = new Map<string, NotificationScope & { newest: number }>();

  for (const row of rows) {
    let scope = byWorkspace.get(row.workspaceId);
    if (!scope) {
      scope = {
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName,
        unread: 0,
        boards: [],
        newest: 0,
      };
      byWorkspace.set(row.workspaceId, scope);
    }

    scope.unread += row.unread ?? 0;
    scope.newest = Math.max(scope.newest, row.newest ?? 0);
    scope.boards.push({ id: row.boardId, title: row.boardTitle, unread: row.unread ?? 0 });
  }

  // Yang paling belakangan berkabar berdiri paling depan — itulah yang sedang
  // dikerjakan orangnya hari ini.
  return [...byWorkspace.values()]
    .sort((a, b) => b.newest - a.newest)
    .map(({ newest: _newest, ...scope }) => ({
      ...scope,
      boards: scope.boards.sort((a, b) => a.title.localeCompare(b.title, "id")),
    }));
}

const app = new Hono<AppEnv>()

  /**
   * Kotak masuk, boleh disaring per workspace atau per papan.
   *
   * Penyaring tidak perlu pemeriksaan hak akses tersendiri: setiap baris sudah
   * terikat ke pemiliknya, jadi menyaring hanya mempersempit milik sendiri.
   */
  .get(
    "/",
    zValidator(
      "query",
      z.object({
        workspaceId: z.string().min(1).optional(),
        boardId: z.string().min(1).optional(),
        cursor: z.string().max(60).optional(),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { workspaceId, boardId, cursor } = c.req.valid("query");
      const page = decodeCursor(cursor);

      const rows = await db
        .select({
          id: notifications.id,
          kind: notifications.kind,
          title: notifications.title,
          body: notifications.body,
          workspaceId: notifications.workspaceId,
          workspaceName: workspaces.name,
          boardId: notifications.boardId,
          boardTitle: boards.title,
          cardId: notifications.cardId,
          readAt: notifications.readAt,
          createdAt: notifications.createdAt,
          actor: {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          },
        })
        .from(notifications)
        .innerJoin(workspaces, eq(workspaces.id, notifications.workspaceId))
        .innerJoin(boards, eq(boards.id, notifications.boardId))
        /* Left join: pelakunya boleh sudah keluar dari tim, dan kabarnya tetap
           harus terbaca — sama seperti lini masa kartu. */
        .leftJoin(user, eq(user.id, notifications.actorId))
        .where(
          and(
            eq(notifications.userId, userId),
            workspaceId ? eq(notifications.workspaceId, workspaceId) : undefined,
            boardId ? eq(notifications.boardId, boardId) : undefined,
            page
              ? or(
                  lt(notifications.createdAt, page.at),
                  and(eq(notifications.createdAt, page.at), lt(notifications.id, page.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        // Satu lebih banyak dari yang ditampilkan — itulah cara tahu masih ada
        // halaman berikutnya tanpa query hitung tersendiri.
        .limit(PAGE_SIZE + 1)
        .all();

      const visible = rows.slice(0, PAGE_SIZE);
      const [unread, scopes] = await Promise.all([
        unreadCount(db, userId),
        scopesFor(db, userId),
      ]);

      const items: NotificationItem[] = visible.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        body: row.body,
        workspaceId: row.workspaceId,
        workspaceName: row.workspaceName,
        boardId: row.boardId,
        boardTitle: row.boardTitle,
        cardId: row.cardId,
        actor: row.actor?.id ? row.actor : null,
        readAt: row.readAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
      }));

      return c.json({
        items,
        unread,
        scopes,
        nextCursor: rows.length > PAGE_SIZE ? encodeCursor(visible[visible.length - 1]) : null,
      });
    },
  )

  /**
   * Hanya angka lencananya. Dipisah dari daftar karena inilah yang ditanyakan
   * berkala di setiap halaman, dan ia cuma menyentuh satu indeks.
   */
  .get("/count", async (c) => c.json({ unread: await unreadCount(c.get("db"), c.get("user").id) }))

  .post(
    "/read",
    zValidator("json", z.object({ ids: z.array(z.string().min(1)).min(1).max(100) })),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;

      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
            inArray(notifications.id, c.req.valid("json").ids),
          ),
        );

      return c.json({ unread: await unreadCount(db, userId) });
    },
  )

  /**
   * Tandai terbaca sekaligus. Penyaring yang sedang aktif ikut dikirim, supaya
   * tombolnya menepati yang terlihat di layar: menandai satu papan tidak
   * diam-diam menghapus tanda dari papan lain.
   */
  .post(
    "/read-all",
    zValidator(
      "json",
      z.object({
        workspaceId: z.string().min(1).optional(),
        boardId: z.string().min(1).optional(),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const userId = c.get("user").id;
      const { workspaceId, boardId } = c.req.valid("json");

      await db
        .update(notifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(notifications.userId, userId),
            isNull(notifications.readAt),
            workspaceId ? eq(notifications.workspaceId, workspaceId) : undefined,
            boardId ? eq(notifications.boardId, boardId) : undefined,
          ),
        );

      return c.json({ unread: await unreadCount(db, userId) });
    },
  );

export default app;
