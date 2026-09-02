import { eq } from "drizzle-orm";
import type { Context } from "hono";
import { boards } from "../db";
import type { AppEnv } from "./auth";
import type { BoardEvent } from "./board-room";

/**
 * Klien mengirim id koneksinya di header ini pada setiap request yang mengubah
 * data, supaya ia bisa mengabaikan gema perubahannya sendiri dan tidak
 * menimpa state optimistiknya.
 */
export const CLIENT_ID_HEADER = "X-Client-Id";

/**
 * Siarkan "board ini berubah" ke kolaborator yang sedang membukanya.
 * Dijalankan lewat waitUntil supaya tidak menahan respons.
 */
export function notifyBoard(c: Context<AppEnv>, boardId: string): void {
  const event: BoardEvent = {
    type: "board:changed",
    origin: c.req.header(CLIENT_ID_HEADER) ?? null,
    at: Date.now(),
  };

  const stub = c.env.BOARD_ROOM.get(c.env.BOARD_ROOM.idFromName(boardId));
  c.executionCtx.waitUntil(stub.broadcast(event));
}

/** Perbarui `updatedAt` board lalu siarkan perubahannya. */
export async function touchBoard(c: Context<AppEnv>, boardId: string): Promise<void> {
  await c.get("db").update(boards).set({ updatedAt: new Date() }).where(eq(boards.id, boardId));
  notifyBoard(c, boardId);
}
