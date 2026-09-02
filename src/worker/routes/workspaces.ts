import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, desc, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { HTTPException } from "hono/http-exception";
import { invitations, ROLES, user, workspaceMembers, workspaces } from "../../db";
import type { AppEnv } from "../auth";
import { assertRole, requireMembership } from "../guards";

/** Undangan berlaku 7 hari. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const app = new Hono<AppEnv>()

  .get("/", async (c) => {
    const rows = await c
      .get("db")
      .select({
        id: workspaces.id,
        name: workspaces.name,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt,
        role: workspaceMembers.role,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, c.get("user").id))
      .orderBy(desc(workspaces.updatedAt));

    return c.json(rows);
  })

  .post(
    "/",
    zValidator("json", z.object({ name: z.string().trim().min(1).max(120) })),
    async (c) => {
      const db = c.get("db");
      const now = new Date();
      const workspace = {
        id: nanoid(),
        name: c.req.valid("json").name,
        createdAt: now,
        updatedAt: now,
      };

      await db.batch([
        db.insert(workspaces).values(workspace),
        db.insert(workspaceMembers).values({
          workspaceId: workspace.id,
          userId: c.get("user").id,
          role: "owner",
          createdAt: now,
        }),
      ] as never);

      return c.json({ ...workspace, role: "owner" as const }, 201);
    },
  )

  .patch(
    "/:id",
    zValidator("json", z.object({ name: z.string().trim().min(1).max(120) })),
    async (c) => {
      const db = c.get("db");
      const id = c.req.param("id");
      const member = await requireMembership(db, id, c.get("user").id);
      assertRole(member.role, "admin");

      const updated = await db
        .update(workspaces)
        .set({ name: c.req.valid("json").name, updatedAt: new Date() })
        .where(eq(workspaces.id, id))
        .returning()
        .get();

      return c.json(updated);
    },
  )

  .delete("/:id", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const member = await requireMembership(db, id, c.get("user").id);
    assertRole(member.role, "owner");

    await db.delete(workspaces).where(eq(workspaces.id, id));
    return c.body(null, 204);
  })

  /* ---------- anggota ---------- */

  .get("/:id/members", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    await requireMembership(db, id, c.get("user").id);

    const rows = await db
      .select({
        userId: workspaceMembers.userId,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.createdAt,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(workspaceMembers)
      .innerJoin(user, eq(user.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, id));

    return c.json(rows);
  })

  .patch(
    "/:id/members/:userId",
    zValidator("json", z.object({ role: z.enum(ROLES) })),
    async (c) => {
      const db = c.get("db");
      const { id, userId } = c.req.param();
      const member = await requireMembership(db, id, c.get("user").id);
      assertRole(member.role, "owner");

      if (userId === c.get("user").id) {
        throw new HTTPException(400, { message: "Tidak bisa mengubah peran sendiri" });
      }

      const updated = await db
        .update(workspaceMembers)
        .set({ role: c.req.valid("json").role })
        .where(
          and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)),
        )
        .returning()
        .get();

      if (!updated) throw new HTTPException(404, { message: "Anggota tidak ditemukan" });
      return c.json(updated);
    },
  )

  .delete("/:id/members/:userId", async (c) => {
    const db = c.get("db");
    const { id, userId } = c.req.param();
    const self = c.get("user").id;
    const member = await requireMembership(db, id, self);

    // Keluar sendiri boleh; mengeluarkan orang lain butuh admin.
    if (userId !== self) assertRole(member.role, "admin");

    if (member.role === "owner" && userId === self) {
      const otherOwner = await db
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, id),
            eq(workspaceMembers.role, "owner"),
            ne(workspaceMembers.userId, self),
          ),
        )
        .get();

      if (!otherOwner) {
        throw new HTTPException(400, {
          message: "Owner terakhir tidak bisa keluar — angkat owner lain atau hapus workspace",
        });
      }
    }

    await db
      .delete(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, id), eq(workspaceMembers.userId, userId)));

    return c.body(null, 204);
  })

  /* ---------- undangan ---------- */

  .get("/:id/invitations", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");
    const member = await requireMembership(db, id, c.get("user").id);
    assertRole(member.role, "admin");

    const rows = await db
      .select()
      .from(invitations)
      .where(eq(invitations.workspaceId, id))
      .orderBy(desc(invitations.createdAt));

    return c.json(rows);
  })

  .post(
    "/:id/invitations",
    zValidator(
      "json",
      z.object({
        email: z.string().trim().toLowerCase().email(),
        role: z.enum(ROLES).exclude(["owner"]).default("member"),
      }),
    ),
    async (c) => {
      const db = c.get("db");
      const id = c.req.param("id");
      const member = await requireMembership(db, id, c.get("user").id);
      assertRole(member.role, "admin");

      const { email, role } = c.req.valid("json");
      const now = new Date();

      const invitation = {
        id: nanoid(),
        workspaceId: id,
        email,
        role,
        token: nanoid(32),
        invitedBy: c.get("user").id,
        expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
        acceptedAt: null,
        createdAt: now,
      };

      await db.insert(invitations).values(invitation);

      // Tanpa layanan email, tautan dikembalikan agar bisa dibagikan manual.
      return c.json({ ...invitation, url: `${new URL(c.req.url).origin}/#/invite/${invitation.token}` }, 201);
    },
  );

export default app;
