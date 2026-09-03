import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import * as authSchema from "../db/auth-schema";
import type { Db } from "../db";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    db: Db;
    auth: ReturnType<typeof createAuth>;
    user: SessionUser;
  };
};

export function createAuth(env: Env, db: Db) {
  // Provider sosial hanya diaktifkan kalau kredensialnya tersedia,
  // supaya aplikasi tetap jalan tanpa perlu mendaftarkan OAuth app dulu.
  const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};

  if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
    socialProviders.github = {
      clientId: env.GITHUB_CLIENT_ID,
      clientSecret: env.GITHUB_CLIENT_SECRET,
    };
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    socialProviders.google = {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
    };
  }

  return betterAuth({
    database: drizzleAdapter(db, { provider: "sqlite", schema: authSchema }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    emailAndPassword: { enabled: true },
    socialProviders,
    user: {
      /* Ganti email tanpa surat verifikasi. Mengirim surat butuh layanan email
         berbayar, dan aplikasi ini dijalankan tanpa biaya — jadi yang boleh
         berganti hanya email yang memang belum pernah diverifikasi, yaitu
         akun yang mendaftar sendiri dengan email dan kata sandi.

         Akun dari Google/GitHub datang dengan emailVerified true, dan Better
         Auth menolak permintaannya di sini. Itu memang yang diinginkan:
         email mereka milik penyedianya, bukan milik aplikasi ini. */
      changeEmail: { enabled: true, updateEmailWithoutVerification: true },
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      // Worker selalu HTTPS di produksi; di dev Better Auth menyesuaikan sendiri.
      defaultCookieAttributes: { sameSite: "lax" },
    },
  });
}

/** Tolak request tanpa sesi login yang sah. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await c.get("auth").api.getSession({ headers: c.req.raw.headers });

  if (!session?.user) {
    throw new HTTPException(401, { message: "Silakan login terlebih dahulu" });
  }

  c.set("user", session.user as SessionUser);
  await next();
};
