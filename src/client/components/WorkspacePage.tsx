import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AddItemForm } from "./AddItemForm";
import { AppHeader } from "./AppHeader";
import { navigate, paths } from "../lib/route";
import type { Board, WorkspaceSummary } from "../../shared/types";

export function WorkspacePage({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.listWorkspaces(), api.listBoards(workspaceId)])
      .then(([workspaces, list]) => {
        setWorkspace(workspaces.find((w) => w.id === workspaceId) ?? null);
        setBoards(list);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Gagal memuat board"));
  }, [workspaceId]);

  const create = async (title: string) => {
    const board = await api.createBoard(workspaceId, title);
    navigate(paths.board(board.id));
  };

  const remove = async (id: string, title: string) => {
    if (!confirm(`Hapus board "${title}" beserta seluruh isinya?`)) return;

    try {
      await api.deleteBoard(id);
      setBoards((prev) => prev?.filter((b) => b.id !== id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus board");
    }
  };

  return (
    <>
      <AppHeader>
        <span className="text-slate-400">/</span>
        <span className="truncate text-sm font-medium">{workspace?.name ?? "…"}</span>
      </AppHeader>

      <div className="mx-auto max-w-2xl p-6">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-xl font-semibold">Board</h1>
          <button
            onClick={() => navigate(paths.members(workspaceId))}
            className="rounded-lg border border-border-subtle px-3 py-1.5 text-sm hover:bg-slate-500/5"
          >
            Anggota
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}

        <ul className="mt-6 flex flex-col gap-2">
          {boards?.map((board) => (
            <li
              key={board.id}
              className="flex items-center gap-2 rounded-lg border border-border-subtle bg-surface-raised px-4 py-3"
            >
              <button
                onClick={() => navigate(paths.board(board.id))}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
              >
                {board.title}
              </button>

              {/* Hapus board butuh admin — server tetap yang memutuskan. */}
              {workspace && workspace.role !== "member" && (
                <button
                  onClick={() => void remove(board.id, board.title)}
                  aria-label={`Hapus board ${board.title}`}
                  className="size-6 rounded text-slate-400 hover:bg-slate-500/10 hover:text-red-500"
                >
                  ×
                </button>
              )}
            </li>
          ))}

          {boards?.length === 0 && (
            <li className="rounded-lg border border-dashed border-border-subtle px-4 py-6 text-center text-sm text-slate-500">
              Belum ada board di workspace ini.
            </li>
          )}
        </ul>

        <div className="mt-4">
          <AddItemForm placeholder="Nama board…" submitLabel="+ Board baru" onSubmit={create} />
        </div>
      </div>
    </>
  );
}
