import { createAuthClient } from "better-auth/react";

// Re-ekspor tipe ini bukan sekadar formalitas: tanpa nama lokal untuknya,
// TypeScript tidak bisa menuliskan tipe hasil useSession (TS2883).
export type { SessionQueryParams } from "better-auth/client";

export const authClient = createAuthClient({ basePath: "/api/auth" });

/** Pengguna yang sedang masuk, sebagaimana Better Auth membentuknya. */
export type SessionUser = typeof authClient.$Infer.Session.user;

/** Nama provider sosial untuk dibaca orang. Kuncinya `providerId` Better Auth. */
export const PROVIDER_LABEL: Record<string, string> = {
  github: "GitHub",
  google: "Google",
};

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  /** Nama dan foto profil — email sengaja tidak lewat sini, lihat changeEmail. */
  updateUser,
  changeEmail,
  changePassword,
  /** Cara akun ini bisa masuk: "credential" untuk email dan kata sandi. */
  listAccounts,
} = authClient;
