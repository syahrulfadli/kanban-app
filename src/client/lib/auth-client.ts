import { createAuthClient } from "better-auth/react";

// Re-ekspor tipe ini bukan sekadar formalitas: tanpa nama lokal untuknya,
// TypeScript tidak bisa menuliskan tipe hasil useSession (TS2883).
export type { SessionQueryParams } from "better-auth/client";

export const authClient = createAuthClient({ basePath: "/api/auth" });

export const { useSession, signIn, signUp, signOut } = authClient;
