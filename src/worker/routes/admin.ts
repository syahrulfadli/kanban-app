import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { and, asc, count, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { hashPassword } from "better-auth/crypto";
import { HTTPException } from "hono/http-exception";
import { nanoid } from "nanoid";
import {
  account,
  appAdmins,
  backgroundImages,
  boards,
  session,
  user,
  workspaceMembers,
  workspaces,
  type Db,
} from "../../db";
import type { AppEnv } from "../auth";
import { appAdminAccess, envAdminEmails, requireAppAdmin } from "../guards";
import { positionBetween } from "../../shared/position";
import {
  UNSPLASH_IMAGE_HOST,
  type AdminBackgroundImage,
  type AdminUserSummary,
  type LoginMethod,
} from "../../shared/types";

/** Sebanyak ini akun per halaman. Cukup untuk satu layar penuh, tidak lebih. */
const PAGE_SIZE = 30;

/* Sama dengan yang dipakai pencarian kartu (routes/cards.ts): tanpa ini,
   tanda persen yang diketik di kotak cari akan mencocokkan segalanya. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * Alamat gambar Unsplash, dibersihkan.
 *
 * Parameter ukuran dibuang di sini, bukan di sisi yang menggambar: yang
 * disimpan harus alamat dasarnya, supaya pemilih boleh meminta keping kecil
 * dan papan meminta yang besar dari baris yang sama. Kalau `?w=2400` ikut
 * tersimpan, setiap keping 200 piksel di panel menarik gambar 2400 piksel.
 *
 * Hostnya dikunci ke images.unsplash.com — lihat catatan di tabelnya.
 */
function cleanUnsplashUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HTTPException(400, { message: "Alamatnya bukan URL yang sah" });
  }

  if (url.hostname !== UNSPLASH_IMAGE_HOST) {
    throw new HTTPException(400, {
      message:
        `Alamat gambar harus dari ${UNSPLASH_IMAGE_HOST}. ` +
        "Di halaman foto Unsplash, klik kanan gambarnya lalu pilih “Salin alamat gambar” — " +
        "bukan alamat halamannya.",
    });
  }

  /* Yang disisakan hanya `ixid`/`ixlib` kalau ada: itu penanda asal yang
     diminta Unsplash, bukan parameter tampilan. Sisanya — w, q, fit, auto —
     ditentukan ulang saat menggambar. */
  const keep = new URLSearchParams();
  for (const key of ["ixid", "ixlib"]) {
    const value = url.searchParams.get(key);
    if (value) keep.set(key, value);
  }

  url.search = keep.toString();
  return url.toString();
}

/** Bentuk satu gambar untuk panel — termasuk berapa papan yang memakainya. */
const toAdminImage = (
  row: typeof backgroundImages.$inferSelect,
  usedBy: number,
): AdminBackgroundImage => ({
  id: row.id,
  name: row.name,
  url: row.url,
  photographer: row.photographer,
  photographerUrl: row.photographerUrl,
  active: row.active,
  usedBy,
});

/** Semua gambar beserta hitungan pemakaiannya, urut seperti di pemilih. */
async function listImages(db: Db): Promise<AdminBackgroundImage[]> {
  const [rows, usage] = await Promise.all([
    db.select().from(backgroundImages).orderBy(asc(backgroundImages.position)).all(),
    db
      .select({ value: boards.backgroundValue, used: count() })
      .from(boards)
      .where(eq(boards.backgroundKind, "image"))
      .groupBy(boards.backgroundValue)
      .all(),
  ]);

  const used = new Map(usage.map((row) => [row.value, row.used]));
  return rows.map((row) => toAdminImage(row, used.get(row.id) ?? 0));
}

const imageBody = z.object({
  name: z.string().trim().min(1).max(80),
  url: z.string().trim().min(1).max(600),
  photographer: z.string().trim().min(1).max(80),
  photographerUrl: z.string().trim().max(300).nullish(),
});

const app = new Hono<AppEnv>()

  /* Setiap rute di berkas ini melewati penjaga yang sama. Ditaruh sebagai
     middleware, bukan diulang di tiap penangan: satu rute yang lupa
     memanggilnya adalah seluruh panel yang terbuka. */
  .use("*", async (c, next) => {
    await requireAppAdmin(c.get("db"), c.env, c.get("user"));
    await next();
  })

  /* ── Gambar latar ──────────────────────────────────────────────── */

  .get("/backgrounds", async (c) => c.json(await listImages(c.get("db"))))

  .post("/backgrounds", zValidator("json", imageBody), async (c) => {
    const db = c.get("db");
    const body = c.req.valid("json");
    const now = new Date();

    // Gambar baru mendarat di ujung daftar, seperti kolom dan kartu baru.
    const last = await db
      .select({ position: backgroundImages.position })
      .from(backgroundImages)
      .orderBy(desc(backgroundImages.position))
      .limit(1)
      .get();

    const row = await db
      .insert(backgroundImages)
      .values({
        id: nanoid(),
        name: body.name,
        url: cleanUnsplashUrl(body.url),
        photographer: body.photographer,
        photographerUrl: body.photographerUrl?.trim() || null,
        position: positionBetween(last?.position ?? null, null),
        active: true,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .get();

    return c.json(toAdminImage(row, 0), 201);
  })

  .patch(
    "/backgrounds/:id",
    zValidator("json", imageBody.partial().extend({ active: z.boolean().optional() })),
    async (c) => {
      const db = c.get("db");
      const patch = c.req.valid("json");

      const row = await db
        .update(backgroundImages)
        .set({
          ...(patch.name !== undefined && { name: patch.name }),
          ...(patch.url !== undefined && { url: cleanUnsplashUrl(patch.url) }),
          ...(patch.photographer !== undefined && { photographer: patch.photographer }),
          /* `nullish` di skemanya: undefined berarti "jangan sentuh", null dan
             string kosong sama-sama berarti "tidak ada profilnya". */
          ...(patch.photographerUrl !== undefined && {
            photographerUrl: patch.photographerUrl?.trim() || null,
          }),
          ...(patch.active !== undefined && { active: patch.active }),
          updatedAt: new Date(),
        })
        .where(eq(backgroundImages.id, c.req.param("id")))
        .returning()
        .get();

      if (!row) throw new HTTPException(404, { message: "Gambar tidak ditemukan" });

      const usage = await db
        .select({ used: count() })
        .from(boards)
        .where(and(eq(boards.backgroundKind, "image"), eq(boards.backgroundValue, row.id)))
        .get();

      return c.json(toAdminImage(row, usage?.used ?? 0));
    },
  )

  /**
   * Urutan di pemilih. Yang dikirim indeks tujuan, bukan posisi — sisi klien
   * tidak perlu tahu apa pun tentang fractional indexing.
   */
  .post(
    "/backgrounds/:id/move",
    zValidator("json", z.object({ index: z.number().int().min(0) })),
    async (c) => {
      const db = c.get("db");
      const id = c.req.param("id");

      const rows = await db
        .select({ id: backgroundImages.id, position: backgroundImages.position })
        .from(backgroundImages)
        .orderBy(asc(backgroundImages.position))
        .all();

      const rest = rows.filter((row) => row.id !== id);
      if (rest.length === rows.length) {
        throw new HTTPException(404, { message: "Gambar tidak ditemukan" });
      }

      const index = Math.min(c.req.valid("json").index, rest.length);
      const position = positionBetween(
        rest[index - 1]?.position ?? null,
        rest[index]?.position ?? null,
      );

      await db
        .update(backgroundImages)
        .set({ position, updatedAt: new Date() })
        .where(eq(backgroundImages.id, id));

      return c.json(await listImages(db));
    },
  )

  /**
   * Hapus gambar. Papan yang memakainya dikembalikan ke latar bawaan lebih
   * dulu — `background_value` bukan foreign key (lihat skemanya), jadi tidak
   * ada yang membersihkannya kalau bukan di sini. Papan yang menunjuk gambar
   * hantu akan tampil polos juga, tapi diam-diam: pemiliknya membuka pemilih
   * dan melihat "Bawaan" tidak tersorot, tanpa tahu apa yang tersorot.
   */
  .delete("/backgrounds/:id", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");

    await db.batch([
      db
        .update(boards)
        .set({ backgroundKind: "default", backgroundValue: null })
        .where(and(eq(boards.backgroundKind, "image"), eq(boards.backgroundValue, id))),
      db.delete(backgroundImages).where(eq(backgroundImages.id, id)),
    ] as never);

    return c.body(null, 204);
  })

  /* ── Akun ──────────────────────────────────────────────────────── */

  /**
   * Daftar akun, halaman demi halaman.
   *
   * Diurutkan dari yang terbaru mendaftar, dan halaman berikutnya ditandai
   * `createdAt` baris terakhir — bukan offset. Dengan offset, satu akun yang
   * dihapus selagi daftarnya dibaca menggeser seluruh sisanya dan satu baris
   * terlewat tanpa jejak.
   */
  .get(
    "/users",
    zValidator(
      "query",
      z.object({ q: z.string().trim().max(120).optional(), cursor: z.string().optional() }),
    ),
    async (c) => {
      const db = c.get("db");
      const { q, cursor } = c.req.valid("query");

      const pattern = q ? `%${escapeLike(q)}%` : null;
      // SQLite mencocokkan LIKE tanpa memandang besar-kecil huruf untuk ASCII.
      const like = (column: AnySQLiteColumn) => sql`${column} LIKE ${pattern} ESCAPE '\\'`;
      const search = pattern ? or(like(user.name), like(user.email)) : undefined;

      /* Kursornya waktu daftar, bukan id: urutannya memang menurut waktu itu.
         Dua akun yang lahir pada milidetik yang sama akan saling menutupi di
         batas halaman — harga yang murah untuk daftar yang tidak pernah
         melewatkan baris saat ada yang dihapus di tengah pembacaan. */
      const before = cursor ? Number(cursor) : null;
      const where = before ? and(search, sql`${user.createdAt} < ${before}`) : search;

      const [rows, totals] = await Promise.all([
        db
          .select({
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            createdAt: user.createdAt,
          })
          .from(user)
          .where(where)
          .orderBy(desc(user.createdAt))
          .limit(PAGE_SIZE + 1)
          .all(),
        db.select({ total: count() }).from(user).get(),
      ]);

      const page = rows.slice(0, PAGE_SIZE);
      const ids = page.map((row) => row.id);

      /* Cara masuk, jumlah tim, dan status admin ditarik sekali untuk seluruh
         halaman — tiga query, bukan tiga per baris. */
      const [methods, spaces, admins] = await Promise.all([
        ids.length
          ? db
              .select({ userId: account.userId, providerId: account.providerId })
              .from(account)
              .where(inArray(account.userId, ids))
              .all()
          : [],
        ids.length
          ? db
              .select({ userId: workspaceMembers.userId, total: count() })
              .from(workspaceMembers)
              .where(inArray(workspaceMembers.userId, ids))
              .groupBy(workspaceMembers.userId)
              .all()
          : [],
        ids.length
          ? db
              .select({ userId: appAdmins.userId })
              .from(appAdmins)
              .where(inArray(appAdmins.userId, ids))
              .all()
          : [],
      ]);

      const byUser = new Map<string, LoginMethod[]>();
      for (const row of methods) {
        const method = row.providerId as LoginMethod;
        if (method !== "credential" && method !== "google" && method !== "github") continue;
        byUser.set(row.userId, [...(byUser.get(row.userId) ?? []), method]);
      }

      const memberships = new Map(spaces.map((row) => [row.userId, row.total]));
      const granted = new Set(admins.map((row) => row.userId));
      const fromEnv = envAdminEmails(c.env);

      const items: AdminUserSummary[] = page.map((row) => {
        const envAdmin = fromEnv.has(row.email.toLowerCase());
        return {
          id: row.id,
          name: row.name,
          email: row.email,
          image: row.image ?? null,
          createdAt: row.createdAt.toISOString(),
          methods: byUser.get(row.id) ?? [],
          workspaces: memberships.get(row.id) ?? 0,
          admin: envAdmin || granted.has(row.id),
          fromEnv: envAdmin,
        };
      });

      return c.json({
        items,
        nextCursor:
          rows.length > PAGE_SIZE ? String(page.at(-1)!.createdAt.getTime()) : null,
        total: totals?.total ?? 0,
      });
    },
  )

  /**
   * Angkat atau cabut admin aplikasi.
   *
   * Admin dari env tidak bisa disentuh dari sini — kewenangannya tidak lahir
   * di database, jadi menghapus barisnya tidak mencabut apa pun dan hanya
   * akan membuat panel berbohong tentang apa yang barusan terjadi.
   */
  .post(
    "/users/:id/admin",
    zValidator("json", z.object({ admin: z.boolean() })),
    async (c) => {
      const db = c.get("db");
      const id = c.req.param("id");
      const target = await db.select().from(user).where(eq(user.id, id)).get();

      if (!target) throw new HTTPException(404, { message: "Akun tidak ditemukan" });

      if (envAdminEmails(c.env).has(target.email.toLowerCase())) {
        throw new HTTPException(400, {
          message:
            "Akun ini admin lewat konfigurasi server (ADMIN_EMAILS), " +
            "jadi statusnya tidak bisa diubah dari panel.",
        });
      }

      if (c.req.valid("json").admin) {
        await db
          .insert(appAdmins)
          .values({ userId: id, grantedBy: c.get("user").id, createdAt: new Date() })
          .onConflictDoNothing();
      } else {
        await db.delete(appAdmins).where(eq(appAdmins.userId, id));
      }

      return c.body(null, 204);
    },
  )

  /**
   * Tetapkan kata sandi baru untuk akun yang lupa miliknya.
   *
   * Belum ada layanan email di aplikasi ini, jadi tautan "lupa kata sandi"
   * tidak bisa dikirim ke mana pun — inilah gantinya, dan admin yang
   * menyampaikan sandinya lewat jalur lain.
   *
   * Hanya memperbarui baris kredensial yang SUDAH ada. Akun yang cuma masuk
   * lewat Google atau GitHub tidak punya kata sandi untuk direset, dan
   * membuatkannya di sini berarti merakit sendiri baris autentikasi yang
   * bentuknya milik Better Auth — pekerjaan yang akan diam-diam salah begitu
   * bentuk itu berubah.
   */
  .post(
    "/users/:id/password",
    zValidator("json", z.object({ newPassword: z.string().min(8).max(128) })),
    async (c) => {
      const db = c.get("db");
      const id = c.req.param("id");

      const credential = await db
        .select({ id: account.id })
        .from(account)
        .where(and(eq(account.userId, id), eq(account.providerId, "credential")))
        .get();

      if (!credential) {
        throw new HTTPException(400, {
          message:
            "Akun ini masuk lewat Google atau GitHub dan belum punya kata sandi. " +
            "Kata sandi pertamanya hanya bisa dibuat sendiri lewat halaman pengaturan.",
        });
      }

      const hash = await hashPassword(c.req.valid("json").newPassword);

      await db.batch([
        db
          .update(account)
          .set({ password: hash, updatedAt: new Date() })
          .where(eq(account.id, credential.id)),
        /* Sesi yang sedang berjalan diputus. Kata sandi yang diganti karena
           akunnya diduga bermasalah tidak ada gunanya kalau sesi lama tetap
           hidup di perangkat yang justru jadi alasan penggantiannya.

           Catatan yang harus diingat sebelum menjanjikan lebih dari ini:
           sesi memakai cookie cache (lihat `session.cookieCache` di
           worker/auth.ts), jadi perangkat yang sudah masuk masih bisa
           terlayani sampai cache-nya kedaluwarsa — lima menit. Penghapusan
           baris ini yang membuat masa itu berakhir, bukan memperpendeknya.
           Kalimat di panel mengatakan hal yang sama. */
        db.delete(session).where(eq(session.userId, id)),
      ] as never);

      return c.body(null, 204);
    },
  )

  /**
   * Hapus akun. Cascade di skema yang membereskan sisanya — keanggotaan,
   * foto, langganan push, kotak masuk. Kartu dan followup-nya tetap tinggal
   * (`set null` pada pelakunya), karena riwayat papan tidak boleh berlubang
   * hanya karena orangnya pergi.
   */
  .delete("/users/:id", async (c) => {
    const db = c.get("db");
    const id = c.req.param("id");

    if (id === c.get("user").id) {
      throw new HTTPException(400, { message: "Anda tidak bisa menghapus akun Anda sendiri" });
    }

    const target = await db.select().from(user).where(eq(user.id, id)).get();
    if (!target) throw new HTTPException(404, { message: "Akun tidak ditemukan" });

    if (envAdminEmails(c.env).has(target.email.toLowerCase())) {
      throw new HTTPException(400, {
        message:
          "Akun ini admin lewat konfigurasi server (ADMIN_EMAILS). " +
          "Keluarkan emailnya dari sana dulu sebelum menghapus akunnya.",
      });
    }

    /**
     * Workspace yang dimiliki sendirian ikut hilang bersamanya.
     *
     * Bukan pilihan yang menyenangkan, tapi alternatifnya lebih buruk:
     * `workspace_members` cascade, jadi tanpa ini yang tertinggal adalah
     * workspace tanpa satu pun anggota — tidak muncul di daftar siapa pun,
     * tidak bisa dibuka, tidak bisa dihapus. Workspace yang masih punya
     * anggota lain tidak disentuh; yang tertinggal di sana boleh naik jadi
     * pemilik lewat halaman anggota.
     */
    const mine = await db
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, id))
      .all();

    /* Satu query untuk seluruhnya, bukan satu per workspace: orang ini sudah
       pasti anggota di setiap barisnya, jadi "jumlah anggotanya satu" sama
       artinya dengan "tidak ada orang lain di sana". */
    const ids = mine.map((row) => row.workspaceId);
    const solo = ids.length
      ? await db
          .select({ workspaceId: workspaceMembers.workspaceId })
          .from(workspaceMembers)
          .where(inArray(workspaceMembers.workspaceId, ids))
          .groupBy(workspaceMembers.workspaceId)
          .having(eq(count(), 1))
          .all()
      : [];

    await db.delete(user).where(eq(user.id, id));
    if (solo.length) {
      await db.delete(workspaces).where(
        inArray(
          workspaces.id,
          solo.map((row) => row.workspaceId),
        ),
      );
    }

    return c.body(null, 204);
  });

/**
 * "Boleh saya membuka panelnya?" — satu-satunya rute admin yang tidak
 * dijaga `requireAppAdmin`, karena pertanyaannya justru itu. Dipanggil
 * sekali per sesi oleh kapsul profil, yang ada di setiap halaman.
 */
export const adminAccess = new Hono<AppEnv>().get("/", async (c) =>
  c.json(await appAdminAccess(c.get("db"), c.env, c.get("user"))),
);

export default app;

/* Dipakai rute board untuk menyusun daftar pilihan latar — lihat
   routes/boards.ts. Tinggal di sini karena aturannya milik gambar, bukan
   milik papan: yang boleh dipilih adalah yang aktif, urut seperti di panel. */
export async function activeBackgrounds(db: Db) {
  return db
    .select({
      id: backgroundImages.id,
      name: backgroundImages.name,
      url: backgroundImages.url,
      photographer: backgroundImages.photographer,
      photographerUrl: backgroundImages.photographerUrl,
    })
    .from(backgroundImages)
    .where(eq(backgroundImages.active, true))
    .orderBy(asc(backgroundImages.position))
    .all();
}
