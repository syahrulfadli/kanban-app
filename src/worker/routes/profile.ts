import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { APIError } from "better-auth/api";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { userAvatars } from "../../db";
import type { AppEnv } from "../auth";
import { AVATAR_MIMES, MAX_AVATAR_BASE64 } from "../../shared/types";

/**
 * Bagian akun yang tidak ditangani Better Auth sendiri.
 *
 * Nama, email, dan kata sandi punya endpoint bawaan di /api/auth — yang di
 * sini hanya foto profil (Better Auth cuma menyimpan URL-nya, bukan
 * berkasnya) dan pembuatan kata sandi pertama, yang endpoint-nya sengaja
 * dibuat server-only oleh Better Auth.
 */
const app = new Hono<AppEnv>()

  /**
   * Simpan foto profil perangkat ini. Klien sudah memangkas dan mengecilkan
   * gambarnya sebelum sampai ke sini — server tidak punya pengolah gambar,
   * jadi ia hanya memeriksa tipe dan ukurannya.
   *
   * Yang dikembalikan URL-nya; klien yang memasangnya ke `user.image` lewat
   * Better Auth, supaya sesinya ikut diperbarui oleh yang memilikinya.
   */
  .put(
    "/avatar",
    zValidator(
      "json",
      z.object({
        mime: z.enum(AVATAR_MIMES),
        /** base64 tanpa awalan data URL. */
        data: z.string().min(1).max(MAX_AVATAR_BASE64),
      }),
    ),
    async (c) => {
      const { mime, data } = c.req.valid("json");
      const userId = c.get("user").id;
      const version = nanoid(8);

      await c
        .get("db")
        .insert(userAvatars)
        .values({ userId, mime, data, version, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: userAvatars.userId,
          set: { mime, data, version, updatedAt: new Date() },
        });

      return c.json({ image: `/api/avatars/${userId}?v=${version}` });
    },
  )

  .delete("/avatar", async (c) => {
    await c.get("db").delete(userAvatars).where(eq(userAvatars.userId, c.get("user").id));
    return c.body(null, 204);
  })

  /**
   * Kata sandi pertama untuk akun yang masuk lewat Google atau GitHub — sejak
   * itu ia bisa juga masuk dengan email dan kata sandi.
   *
   * Mengganti kata sandi yang sudah ada bukan urusan rute ini: itu wajib
   * menyertakan kata sandi lama, dan Better Auth sudah menyediakannya di
   * /api/auth/change-password. Di sini pun Better Auth yang menolak kalau
   * kata sandinya sudah pernah dibuat.
   */
  .post(
    "/password",
    zValidator("json", z.object({ newPassword: z.string().min(8).max(128) })),
    async (c) => {
      try {
        await c.get("auth").api.setPassword({
          body: { newPassword: c.req.valid("json").newPassword },
          headers: c.req.raw.headers,
        });
      } catch (e) {
        /* Penolakannya datang dalam bahasa Inggris dan lewat galat yang bukan
           HTTPException, jadi tanpa ini ia berakhir sebagai 500 tanpa sebab.
           Klien sudah menyembunyikan formulir ini untuk akun yang punya kata
           sandi — ini jaring terakhirnya. */
        if (e instanceof APIError && e.body?.code === "PASSWORD_ALREADY_SET") {
          throw new HTTPException(400, {
            message: "Akun ini sudah punya kata sandi. Gantilah lewat formulir ganti kata sandi.",
          });
        }

        throw e;
      }

      return c.body(null, 204);
    },
  );

/**
 * Berkas fotonya sendiri, terpisah dari rute akun karena alamatnya menyebut
 * pemiliknya: URL inilah yang tersimpan di `user.image` dan dipakai setiap
 * avatar di aplikasi.
 *
 * Tetap di balik login — foto orang bukan aset publik. Query `v` membuat
 * setiap unggahan punya alamat baru, jadi responsnya boleh di-cache selamanya
 * tanpa pernah menyajikan foto yang sudah diganti.
 */
export const avatars = new Hono<AppEnv>().get("/:userId", async (c) => {
  const row = await c
    .get("db")
    .select({ mime: userAvatars.mime, data: userAvatars.data })
    .from(userAvatars)
    .where(eq(userAvatars.userId, c.req.param("userId")))
    .get();

  if (!row) return c.json({ error: "Foto profil tidak ditemukan" }, 404);

  const binary = atob(row.data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return c.body(bytes, 200, {
    "Content-Type": row.mime,
    "Cache-Control": "private, max-age=31536000, immutable",
  });
});

export default app;
