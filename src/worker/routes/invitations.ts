import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { invitations, workspaceMembers, workspaces } from "../../db";
import type { AppEnv } from "../auth";
import { assertRole, requireMembership } from "../guards";

async function loadUsable(db: AppEnv["Variables"]["db"], token: string) {
  const row = await db
    .select({ invitation: invitations, workspaceName: workspaces.name })
    .from(invitations)
    .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(eq(invitations.token, token))
    .get();

  if (!row) throw new HTTPException(404, { message: "Undangan tidak ditemukan" });
  if (row.invitation.acceptedAt) {
    throw new HTTPException(410, { message: "Undangan ini sudah dipakai" });
  }
  if (row.invitation.expiresAt.getTime() < Date.now()) {
    throw new HTTPException(410, { message: "Undangan ini sudah kedaluwarsa" });
  }

  return row;
}

/**
 * Pratinjau undangan — sengaja TIDAK butuh login, supaya penerima tahu
 * workspace apa yang mengundangnya sebelum membuat akun.
 */
export const invitePreview = new Hono<AppEnv>().get("/:token", async (c) => {
  const { invitation, workspaceName } = await loadUsable(c.get("db"), c.req.param("token"));

  return c.json({
    workspaceName,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt,
  });
});

const app = new Hono<AppEnv>()

  .post("/:token/accept", async (c) => {
    const db = c.get("db");
    const currentUser = c.get("user");
    const { invitation, workspaceName } = await loadUsable(db, c.req.param("token"));

    // Undangan terikat ke satu alamat email — tidak bisa dipakai akun lain.
    if (invitation.email !== currentUser.email.toLowerCase()) {
      throw new HTTPException(403, {
        message: `Undangan ini ditujukan untuk ${invitation.email}`,
      });
    }

    const existing = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, invitation.workspaceId))
      .all();

    const alreadyMember = existing.some((m) => m.userId === currentUser.id);
    const now = new Date();

    await db.batch([
      ...(alreadyMember
        ? []
        : [
            db.insert(workspaceMembers).values({
              workspaceId: invitation.workspaceId,
              userId: currentUser.id,
              role: invitation.role,
              createdAt: now,
            }),
          ]),
      db.update(invitations).set({ acceptedAt: now }).where(eq(invitations.id, invitation.id)),
    ] as never);

    return c.json({ workspaceId: invitation.workspaceId, workspaceName });
  })

  .delete("/:id", async (c) => {
    const db = c.get("db");
    const invitation = await db
      .select()
      .from(invitations)
      .where(eq(invitations.id, c.req.param("id")))
      .get();

    if (!invitation) throw new HTTPException(404, { message: "Undangan tidak ditemukan" });

    const member = await requireMembership(db, invitation.workspaceId, c.get("user").id);
    assertRole(member.role, "admin");

    await db.delete(invitations).where(eq(invitations.id, invitation.id));
    return c.body(null, 204);
  });

export default app;
