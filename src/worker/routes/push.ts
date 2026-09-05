import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { notificationPrefs, pushSubscriptions } from "../../db";
import type { AppEnv } from "../auth";
import { createPusher, vapidPublicKey, VapidConfigError } from "../push";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "../../shared/types";

/** Bentuk `PushSubscription.toJSON()` di browser, seperlunya saja. */
const subscription = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(200),
    auth: z.string().min(1).max(100),
  }),
});

const app = new Hono<AppEnv>()

  /**
   * Yang perlu diketahui klien sebelum bisa menampilkan sakelar notifikasi:
   * kunci publik untuk mendaftar, dan pilihan yang tersimpan.
   *
   * `publicKey` null berarti server belum dipasangi kunci VAPID — klien
   * menyembunyikan sakelarnya, bukan menawarkan sesuatu yang tidak akan jalan.
   */
  .get("/", async (c) => {
    const prefs = await c
      .get("db")
      .select()
      .from(notificationPrefs)
      .where(eq(notificationPrefs.userId, c.get("user").id))
      .get();

    return c.json({
      publicKey: vapidPublicKey(c.env),
      prefs: prefs
        ? { comments: prefs.comments, changes: prefs.changes, newCards: prefs.newCards }
        : DEFAULT_NOTIFICATION_SETTINGS,
    });
  })

  /**
   * Daftarkan perangkat ini. Dikirim ulang setiap aplikasi dibuka: browser
   * boleh mengganti endpoint kapan saja, dan langganan yang sudah basi tidak
   * akan pernah memberi tahu siapa pun bahwa ia basi.
   *
   * Jawabannya membawa kunci publik yang berlaku sekarang. Itu yang membuat
   * pergantian kunci di server bisa disadari perangkat: langganan lama terikat
   * pada kunci lama dan diam-diam berhenti menerima apa pun, sedangkan tidak
   * ada satu pun pihak yang akan memberitahukannya.
   */
  .post("/subscribe", zValidator("json", subscription), async (c) => {
    const { endpoint, keys } = c.req.valid("json");
    const now = new Date();

    await c
      .get("db")
      .insert(pushSubscriptions)
      .values({
        id: nanoid(),
        userId: c.get("user").id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        createdAt: now,
        lastSeenAt: now,
      })
      /* Endpoint yang sama bisa berpindah pemilik — satu perangkat dipakai
         bergantian dua orang. `userId` ikut ditimpa supaya notifikasi tidak
         mendarat di perangkat yang sudah berganti penghuni. */
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          userId: c.get("user").id,
          p256dh: keys.p256dh,
          auth: keys.auth,
          lastSeenAt: now,
        },
      });

    return c.json({ publicKey: vapidPublicKey(c.env) });
  })

  .post(
    "/unsubscribe",
    zValidator("json", z.object({ endpoint: z.string().url().max(2000) })),
    async (c) => {
      await c
        .get("db")
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, c.req.valid("json").endpoint),
            // Hanya langganan sendiri: endpoint orang lain bukan urusan siapa pun.
            eq(pushSubscriptions.userId, c.get("user").id),
          ),
        );

      return c.body(null, 204);
    },
  )

  .patch(
    "/prefs",
    zValidator(
      "json",
      z.object({
        comments: z.boolean().optional(),
        changes: z.boolean().optional(),
        newCards: z.boolean().optional(),
      }),
    ),
    async (c) => {
      const userId = c.get("user").id;
      const patch = c.req.valid("json");
      const now = new Date();

      // Baris pref baru lahir saat pilihannya pertama kali diubah, jadi nilai
      // yang tidak disebut harus jatuh ke default — bukan ke NULL.
      const next: NotificationSettings = { ...DEFAULT_NOTIFICATION_SETTINGS, ...patch };

      const saved = await c
        .get("db")
        .insert(notificationPrefs)
        .values({ userId, ...next, updatedAt: now })
        .onConflictDoUpdate({
          target: notificationPrefs.userId,
          // Yang ditimpa hanya yang benar-benar dikirim; pilihan lain di baris
          // yang sudah ada tetap sebagaimana adanya.
          set: { ...patch, updatedAt: now },
        })
        .returning()
        .get();

      return c.json({
        comments: saved.comments,
        changes: saved.changes,
        newCards: saved.newCards,
      });
    },
  )

  /**
   * Kirim satu notifikasi percobaan ke perangkat ini. Rantainya panjang —
   * izin browser, service worker, kunci VAPID, push service — dan hanya
   * notifikasi yang benar-benar sampai yang membuktikan semuanya tersambung.
   */
  .post(
    "/test",
    zValidator("json", z.object({ endpoint: z.string().url().max(2000) })),
    async (c) => {
      const device = await c
        .get("db")
        .select()
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, c.req.valid("json").endpoint),
            eq(pushSubscriptions.userId, c.get("user").id),
          ),
        )
        .get();

      if (!device) return c.json({ error: "Perangkat ini belum terdaftar" }, 404);

      /* Kunci yang salah pasang dijawab dengan kalimatnya sendiri. Kalau
         dibiarkan melempar, yang sampai ke pengguna cuma 500 tanpa keterangan —
         padahal justru di sinilah keterangannya paling dibutuhkan: tombol ini
         memang dipakai untuk membuktikan seluruh rantainya tersambung. */
      let pusher;
      try {
        pusher = await createPusher(c.env, new URL(c.req.url).origin);
      } catch (e) {
        if (!(e instanceof VapidConfigError)) throw e;
        console.error(e);
        return c.json({ error: e.message }, 503);
      }

      if (!pusher) return c.json({ error: "Server belum dipasangi kunci VAPID" }, 503);

      const result = await pusher.send(device, {
        title: "Notifikasi aktif",
        body: "Beginilah kabar dari papan Anda akan muncul.",
        tag: "uji",
        url: "/",
      });

      if (result === "gone") {
        await c.get("db").delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id));
        return c.json({ error: "Langganan perangkat ini sudah tidak berlaku" }, 410);
      }

      if (result === "failed") {
        return c.json({ error: "Push service menolak kiriman" }, 502);
      }

      return c.body(null, 204);
    },
  );

export default app;
