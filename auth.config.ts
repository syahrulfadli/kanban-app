/**
 * Konfigurasi khusus untuk @better-auth/cli (generate schema).
 * Runtime memakai src/worker/auth.ts — file ini tidak dipakai saat aplikasi jalan.
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: "sqlite" }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    github: { clientId: "", clientSecret: "" },
    google: { clientId: "", clientSecret: "" },
  },
});
