import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AuthPage } from "./AuthPage";
import { useT } from "../hooks/useLanguage";
import { navigate, paths } from "../lib/route";
import { useSession } from "../lib/auth-client";
import { InviteSkeleton } from "./Skeleton";
import type { InvitePreview } from "../../shared/types";

export function InvitePage({ token }: { token: string }) {
  const t = useT();
  const { data: session, isPending } = useSession();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ROLE_LABEL = t.roles;

  useEffect(() => {
    api
      .previewInvitation(token)
      .then(setPreview)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : t.invite.invalidInvite),
      );
  }, [token]);

  if (isPending) return <InviteSkeleton />;

  if (error) {
    return (
      <div className="mx-auto max-w-sm p-8 text-center">
        <p className="text-sm text-danger">{error}</p>
        <button
          onClick={() => navigate(paths.workspaces)}
          className="mt-4 text-sm text-accent-ink hover:underline"
        >
          {t.invite.backToHome}
        </button>
      </div>
    );
  }

  if (!preview) return <InviteSkeleton />;

  // Belum login: tampilkan konteks undangan dulu, baru form auth.
  if (!session) {
    return (
      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-sm px-6 pt-8">
          <p className="glass glass-plate rounded-2xl p-4 text-sm">
            {t.invite.invitedToWorkspacePrefix} <strong>{preview.workspaceName}</strong>{" "}
            {t.invite.asRoleSuffix(ROLE_LABEL[preview.role])}
            <br />
            <span className="text-muted">{t.invite.signInWithEmail(preview.email)}</span>
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
      setError(e instanceof Error ? e.message : t.invite.genericAcceptError);
    } finally {
      setBusy(false);
    }
  };

  const emailMatches = session.user.email.toLowerCase() === preview.email;

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="glass glass-frost w-full max-w-sm rounded-3xl p-7 text-center">
        <h1 className="text-xl font-semibold tracking-tight">{t.invite.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {t.invite.invitedToPrefix} <strong className="text-ink">{preview.workspaceName}</strong>{" "}
          {t.invite.asRoleSuffix(ROLE_LABEL[preview.role])}
        </p>

        {emailMatches ? (
          <button
            onClick={() => void accept()}
            disabled={busy}
            className="btn btn-primary mt-6 w-full py-2.5"
          >
            {busy ? t.common.processing : t.invite.accept}
          </button>
        ) : (
          <p className="mt-6 rounded-xl bg-warn/10 p-3 text-sm text-warn">
            {t.invite.mismatchPrefix} <strong>{preview.email}</strong>,{" "}
            {t.invite.mismatchMiddle} <strong>{session.user.email}</strong>.{" "}
            {t.invite.mismatchSuffix}
          </p>
        )}
      </div>
    </div>
  );
}
