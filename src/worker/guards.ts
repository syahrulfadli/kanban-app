import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import {
  appAdmins,
  boards,
  cardComments,
  cards,
  checklistItems,
  columns,
  labels,
  workspaceMembers,
  type Db,
  type Role,
} from "../db";
import type { SessionUser } from "./auth";

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
      /* Ikut terbawa join yang sudah ada di sini: undangan ke kartu dibatasi
         anggota workspace pemilik papannya, dan tanpa ini setiap pemeriksaan
         itu butuh satu query lagi untuk menanyakan hal yang sudah lewat. */
      workspaceId: boards.workspaceId,
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

/** Label + board induk + peran user. */
export async function requireLabel(db: Db, labelId: string, userId: string) {
  const row = await db
    .select({ label: labels, boardId: boards.id, role: workspaceMembers.role })
    .from(labels)
    .innerJoin(boards, eq(labels.boardId, boards.id))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, boards.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .where(eq(labels.id, labelId))
    .get();

  if (!row) throw notFound();
  return row;
}

/** Butir checklist + kartu + board induk + peran user. */
export async function requireChecklistItem(db: Db, itemId: string, userId: string) {
  const row = await db
    .select({
      item: checklistItems,
      cardId: cards.id,
      cardTitle: cards.title,
      boardId: boards.id,
      role: workspaceMembers.role,
    })
    .from(checklistItems)
    .innerJoin(cards, eq(checklistItems.cardId, cards.id))
    .innerJoin(columns, eq(cards.columnId, columns.id))
    .innerJoin(boards, eq(columns.boardId, boards.id))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, boards.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .where(eq(checklistItems.id, itemId))
    .get();

  if (!row) throw notFound();
  return row;
}

/**
 * Followup + kartu + board induk + peran user.
 *
 * Menyunting dan menghapus followup adalah hak penulisnya; admin boleh
 * menghapus, tapi tidak boleh menaruh kata-kata di mulut orang lain.
 */
export async function requireComment(db: Db, commentId: string, userId: string) {
  const row = await db
    .select({
      comment: cardComments,
      cardId: cards.id,
      cardTitle: cards.title,
      boardId: boards.id,
      role: workspaceMembers.role,
    })
    .from(cardComments)
    .innerJoin(cards, eq(cardComments.cardId, cards.id))
    .innerJoin(columns, eq(cards.columnId, columns.id))
    .innerJoin(boards, eq(columns.boardId, boards.id))
    .innerJoin(
      workspaceMembers,
      and(
        eq(workspaceMembers.workspaceId, boards.workspaceId),
        eq(workspaceMembers.userId, userId),
      ),
    )
    .where(eq(cardComments.id, commentId))
    .get();

  if (!row) throw notFound();
  return row;
}

export function assertAuthor(authorId: string, userId: string) {
  if (authorId !== userId) {
    throw new HTTPException(403, { message: "Hanya penulisnya yang boleh mengubah ini" });
  }
}

/* ── Admin aplikasi ────────────────────────────────────────────────
   Berbeda dari peran workspace: yang diurus di sini gambar latar dan akun
   orang, bukan isi satu tim. Sumbernya dua, dan urutannya disengaja. */

/**
 * Email yang selalu admin, dari env. Pintu darurat aplikasinya: admin dari
 * sini tidak bisa dicabut lewat panel, jadi panelnya tidak pernah bisa
 * terkunci dari dalam — termasuk oleh admin yang mencabut dirinya sendiri.
 *
 * Dicocokkan huruf-kecil dan terpangkas, karena yang mengetiknya manusia di
 * dalam berkas konfigurasi.
 */
export function envAdminEmails(env: Env): Set<string> {
  return new Set(
    (env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const isEnvAdmin = (env: Env, email: string) =>
  envAdminEmails(env).has(email.trim().toLowerCase());

/** Apakah orang ini admin aplikasi — dan dari mana kewenangannya datang. */
export async function appAdminAccess(db: Db, env: Env, user: SessionUser) {
  const fromEnv = isEnvAdmin(env, user.email);
  if (fromEnv) return { admin: true, fromEnv: true };

  const row = await db.select().from(appAdmins).where(eq(appAdmins.userId, user.id)).get();
  return { admin: Boolean(row), fromEnv: false };
}

/**
 * Tolak siapa pun yang bukan admin aplikasi.
 *
 * 404, bukan 403 — sama seperti keanggotaan workspace: keberadaan panelnya
 * pun tidak perlu dibocorkan kepada yang tidak boleh membukanya.
 */
export async function requireAppAdmin(db: Db, env: Env, user: SessionUser) {
  const access = await appAdminAccess(db, env, user);
  if (!access.admin) throw notFound();
  return access;
}
