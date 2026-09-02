import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { boards, cards, columns, workspaceMembers, type Db, type Role } from "../db";

const notFound = () => new HTTPException(404, { message: "Data tidak ditemukan" });

/** Peringkat peran — dipakai untuk pemeriksaan "minimal harus admin", dst. */
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 };

export function assertRole(role: Role, minimum: Role) {
  if (RANK[role] < RANK[minimum]) {
    throw new HTTPException(403, { message: "Peran Anda tidak mencukupi untuk aksi ini" });
  }
}

/**
 * Keanggotaan user di sebuah workspace.
 * Bukan anggota → 404, bukan 403: keberadaan workspace pun tidak dibocorkan.
 */
export async function requireMembership(db: Db, workspaceId: string, userId: string) {
  const member = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)),
    )
    .get();

  if (!member) throw notFound();
  return member;
}

/** Board beserta peran user di workspace pemiliknya. */
export async function requireBoard(db: Db, boardId: string, userId: string) {
  const row = await db
    .select({ board: boards, role: workspaceMembers.role })
    .from(boards)
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, boards.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .where(eq(boards.id, boardId))
    .get();

  if (!row) throw notFound();
  return row;
}

/** Kolom + board induk + peran user. */
export async function requireColumn(db: Db, columnId: string, userId: string) {
  const row = await db
    .select({ column: columns, boardId: boards.id, role: workspaceMembers.role })
    .from(columns)
    .innerJoin(boards, eq(columns.boardId, boards.id))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, boards.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .where(eq(columns.id, columnId))
    .get();

  if (!row) throw notFound();
  return row;
}

/** Kartu + kolom + board induk + peran user. */
export async function requireCard(db: Db, cardId: string, userId: string) {
  const row = await db
    .select({
      card: cards,
      columnId: columns.id,
      boardId: boards.id,
      role: workspaceMembers.role,
    })
    .from(cards)
    .innerJoin(columns, eq(cards.columnId, columns.id))
    .innerJoin(boards, eq(columns.boardId, boards.id))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, boards.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .where(eq(cards.id, cardId))
    .get();

  if (!row) throw notFound();
  return row;
}
