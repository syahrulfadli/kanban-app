import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AddItemForm } from "./AddItemForm";
import { AppHeader } from "./AppHeader";
import { navigate, paths } from "../lib/route";
import { ListSkeleton } from "./Skeleton";
import type { WorkspaceSummary } from "../../shared/types";

const ROLE_LABEL = { owner: "Pemilik", admin: "Admin", member: "Anggota" } as const;

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Gagal memuat workspace"),
      );
  }, []);

  const create = async (name: string) => {
    const workspace = await api.createWorkspace(name);
    navigate(paths.workspace(workspace.id));
  };

  return (
    <>
      <AppHeader />

      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Workspace</h1>
        <p className="mt-1 text-sm text-muted">
          Workspace adalah tempat board dibagikan. Undang rekan lewat menu Anggota.
        </p>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        {/* `null` berarti masih dimuat; senarai kosong berarti memang belum
            ada workspace. Keduanya tidak boleh terlihat sama. */}
        {!workspaces && !error && (
          <div className="mt-6">
            <ListSkeleton label="Memuat daftar workspace…" />
          </div>
        )}

        <ul className="mt-6 flex flex-col gap-2 empty:mt-0">
          {workspaces?.map((workspace) => (
            <li key={workspace.id}>
              <button
                onClick={() => navigate(paths.workspace(workspace.id))}
                className="glass glass-plate glass-plate-hover flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {workspace.name}
                </span>
                <span className="chip">{ROLE_LABEL[workspace.role]}</span>
              </button>
            </li>
          ))}

          {workspaces?.length === 0 && (
            <li className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              Belum ada workspace. Buat yang pertama di bawah.
            </li>
          )}
        </ul>

        <div className="mt-3">
          <AddItemForm
            placeholder="Nama workspace…"
            submitLabel="+ Workspace baru"
            onSubmit={create}
          />
        </div>
      </div>
    </>
  );
}
