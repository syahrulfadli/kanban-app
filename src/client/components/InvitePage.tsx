import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AuthPage } from "./AuthPage";
import { navigate, paths } from "../lib/route";
import { useSession } from "../lib/auth-client";
import type { InvitePreview } from "../../shared/types";

const ROLE_LABEL = {
  owner: "Pemilik",
  admin: "Admin",
  member: "Anggota",
} as const;

export function InvitePage({ token }: { token: string }) {
  const { data: session, isPending } = useSession();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .previewInvitation(token)
      .then(setPreview)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Undangan tidak valid"),
      );
  }, [token]);

  if (isPending) return <p className="p-8 text-sm text-muted">Memuat…</p>;

  if (error) {
    return (
      <div className="mx-auto max-w-sm p-8 text-center">
        <p className="text-sm text-danger">{error}</p>
        <button
          onClick={() => navigate(paths.workspaces)}
          className="mt-4 text-sm text-accent-ink hover:underline"
        >
          Ke halaman utama
        </button>
      </div>
    );
  }

  if (!preview) return <p className="p-8 text-sm text-muted">Memuat undangan…</p>;

  // Belum login: tampilkan konteks undangan dulu, baru form auth.
  if (!session) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-sm px-6 pt-8">
          <p className="glass glass-plate rounded-2xl p-4 text-sm">
            Anda diundang ke workspace <strong>{preview.workspaceName}</strong> sebagai{" "}
            {ROLE_LABEL[preview.role]}.
            <br />
            <span className="text-muted">
              Masuk atau daftar dengan {preview.email} untuk menerimanya.
            </span>
          </p>
        </div>
        <AuthPage />
      </div>
    );
  }

  const accept = async () => {
    setBusy(true);
    try {
      const result = await api.acceptInvitation(token);
      navigate(paths.workspace(result.workspaceId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menerima undangan");
    } finally {
      setBusy(false);
    }
  };

  const emailMatches = session.user.email.toLowerCase() === preview.email;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="glass glass-frost w-full max-w-sm rounded-3xl p-7 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Undangan workspace</h1>
        <p className="mt-2 text-sm text-muted">
          Anda diundang ke <strong className="text-ink">{preview.workspaceName}</strong>{" "}
          sebagai {ROLE_LABEL[preview.role]}.
        </p>

        {emailMatches ? (
          <button
            onClick={() => void accept()}
            disabled={busy}
            className="btn btn-primary mt-6 w-full py-2.5"
          >
            {busy ? "Memproses…" : "Terima undangan"}
          </button>
        ) : (
          <p className="mt-6 rounded-xl bg-warn/10 p-3 text-sm text-warn">
            Undangan ini untuk <strong>{preview.email}</strong>, sedangkan Anda masuk
            sebagai <strong>{session.user.email}</strong>. Keluar dulu, lalu masuk dengan
            akun yang diundang.
          </p>
        )}
      </div>
    </div>
  );
}
