import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { AppHeader } from "./AppHeader";
import { navigate, paths } from "../lib/route";
import { useSession } from "../lib/auth-client";
import type { Invitation, MemberSummary, Role, WorkspaceSummary } from "../../shared/types";

const ROLE_LABEL: Record<Role, string> = {
  owner: "Pemilik",
  admin: "Admin",
  member: "Anggota",
};

export function MembersPage({ workspaceId }: { workspaceId: string }) {
  const { data: session } = useSession();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const canManage = workspace && workspace.role !== "member";

  const load = useCallback(async () => {
    try {
      const [workspaces, memberList] = await Promise.all([
        api.listWorkspaces(),
        api.listMembers(workspaceId),
      ]);

      const current = workspaces.find((w) => w.id === workspaceId) ?? null;
      setWorkspace(current);
      setMembers(memberList);

      // Daftar undangan hanya boleh dilihat admin ke atas.
      setInvitations(
        current && current.role !== "member" ? await api.listInvitations(workspaceId) : [],
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat anggota");
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const created = await api.invite(workspaceId, email.trim(), role);
      setEmail("");
      await navigator.clipboard?.writeText(created.url).catch(() => {});
      setCopied(created.url);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim undangan");
    }
  };

  const inviteUrl = (token: string) => `${location.origin}/#/invite/${token}`;

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aksi gagal");
    }
  };

  return (
    <>
      <AppHeader>
        <span className="text-slate-400">/</span>
        <button
          onClick={() => navigate(paths.workspace(workspaceId))}
          className="truncate text-sm font-medium hover:underline"
        >
          {workspace?.name ?? "…"}
        </button>
      </AppHeader>

      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Anggota</h1>
        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <ul className="mt-6 flex flex-col gap-2">
          {members.map((member) => {
            const isSelf = member.userId === session?.user.id;

            return (
              <li
                key={member.userId}
                className="flex items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {member.name} {isSelf && <span className="text-slate-400">(Anda)</span>}
                  </p>
                  <p className="truncate text-xs text-slate-500">{member.email}</p>
                </div>

                {workspace?.role === "owner" && !isSelf ? (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      void act(() =>
                        api.changeRole(workspaceId, member.userId, e.target.value as Role),
                      )
                    }
                    className="rounded-md border border-border-subtle bg-surface-raised px-2 py-1 text-xs"
                  >
                    {(["owner", "admin", "member"] as const).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs text-slate-500">
                    {ROLE_LABEL[member.role]}
                  </span>
                )}

                {(canManage || isSelf) && (
                  <button
                    onClick={() =>
                      void act(() => api.removeMember(workspaceId, member.userId))
                    }
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-500/10 hover:text-red-500"
                  >
                    {isSelf ? "Keluar" : "Keluarkan"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {canManage && (
          <>
            <h2 className="mt-8 text-sm font-semibold">Undang anggota</h2>
            <p className="mt-1 text-xs text-slate-500">
              Belum ada layanan email — tautan undangan disalin ke clipboard, kirim sendiri
              lewat chat.
            </p>

            <form onSubmit={invite} className="mt-3 flex gap-2">
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@rekan.com"
                className="min-w-0 flex-1 rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-lg border border-border-subtle bg-surface-raised px-2 text-sm"
              >
                <option value="member">Anggota</option>
                <option value="admin">Admin</option>
              </select>
              <button
                type="submit"
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white"
              >
                Undang
              </button>
            </form>

            {copied && (
              <p className="mt-2 rounded-lg bg-green-500/10 px-3 py-2 text-xs break-all text-green-700 dark:text-green-400">
                Tautan disalin: {copied}
              </p>
            )}

            {invitations.filter((i) => !i.acceptedAt).length > 0 && (
              <ul className="mt-4 flex flex-col gap-2">
                {invitations
                  .filter((i) => !i.acceptedAt)
                  .map((invitation) => (
                    <li
                      key={invitation.id}
                      className="flex items-center gap-2 rounded-lg border border-dashed border-border-subtle px-4 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{invitation.email}</p>
                        <p className="text-xs text-slate-500">
                          {ROLE_LABEL[invitation.role]} · menunggu diterima
                        </p>
                      </div>

                      <button
                        onClick={() =>
                          void navigator.clipboard
                            ?.writeText(inviteUrl(invitation.token))
                            .then(() => setCopied(inviteUrl(invitation.token)))
                        }
                        className="rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-500/10"
                      >
                        Salin tautan
                      </button>
                      <button
                        onClick={() => void act(() => api.revokeInvitation(invitation.id))}
                        className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-slate-500/10 hover:text-red-500"
                      >
                        Batalkan
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </>
        )}
      </div>
    </>
  );
}
