import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AddItemForm } from "./AddItemForm";
import { AppHeader } from "./AppHeader";
import { navigate, paths } from "../lib/route";
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

      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Workspace</h1>
        <p className="mt-1 text-sm text-slate-500">
          Workspace adalah tempat board dibagikan. Undang rekan lewat menu Anggota.
        </p>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <ul className="mt-6 flex flex-col gap-2">
          {workspaces?.map((workspace) => (
            <li key={workspace.id}>
              <button
                onClick={() => navigate(paths.workspace(workspace.id))}
                className="flex w-full items-center gap-3 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3 text-left hover:border-blue-500"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {workspace.name}
                </span>
                <span className="rounded-full bg-slate-500/10 px-2 py-0.5 text-xs text-slate-500">
                  {ROLE_LABEL[workspace.role]}
                </span>
              </button>
            </li>
          ))}

          {workspaces?.length === 0 && (
            <li className="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-center text-sm text-slate-500">
              Belum ada workspace. Buat yang pertama di bawah.
            </li>
          )}
        </ul>

        <div className="mt-4">
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
