import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AddItemForm } from "./AddItemForm";
import { AppHeader } from "./AppHeader";
import { ConfirmDialog } from "./ConfirmDialog";
import { useUndo } from "./UndoToasts";
import { insertAt } from "../lib/reorder";
import { navigate, paths } from "../lib/route";
import type { Board, WorkspaceSummary } from "../../shared/types";

export function WorkspacePage({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Board | null>(null);
  const undo = useUndo();

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

  /* Board hilang dari daftar sekarang; perintah ke server baru berangkat
     setelah jendela urung habis — lihat UndoProvider. */
  const remove = (board: Board) => {
    const index = boards?.findIndex((b) => b.id === board.id) ?? -1;
    if (index < 0) return;

    setPending(null);
    setBoards((prev) => prev?.filter((b) => b.id !== board.id) ?? null);

    undo({
      message: `Board “${board.title}” dihapus`,
      commit: (options) => api.deleteBoard(board.id, options),
      revert: () => setBoards((prev) => (prev ? insertAt(prev, board, index) : prev)),
      onError: setError,
    });
  };

  return (
    <>
      <AppHeader>
        <span className="text-faint">/</span>
        <span className="truncate text-sm font-medium">{workspace?.name ?? "…"}</span>
      </AppHeader>

      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <div className="flex items-center gap-3">
          <h1 className="flex-1 text-2xl font-semibold tracking-tight">Board</h1>
          <button
            onClick={() => navigate(paths.members(workspaceId))}
            className="btn btn-glass"
          >
            Anggota
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-danger">{error}</p>}

        <ul className="mt-6 flex flex-col gap-2">
          {boards?.map((board) => (
            <li
              key={board.id}
              className="glass glass-plate glass-plate-hover flex items-center gap-2 rounded-2xl px-4 py-3.5 transition-colors"
            >
              <button
                onClick={() => navigate(paths.board(board.id))}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent-ink"
              >
                {board.title}
              </button>

              {/* Hapus board butuh admin — server tetap yang memutuskan. */}
              {workspace && workspace.role !== "member" && (
                <button
                  onClick={() => setPending(board)}
                  aria-label={`Hapus board ${board.title}`}
                  className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6 18 18M18 6 6 18" />
                  </svg>
                </button>
              )}
            </li>
          ))}

          {boards?.length === 0 && (
            <li className="rounded-2xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">
              Belum ada board di workspace ini.
            </li>
          )}
        </ul>

        <div className="mt-3">
          <AddItemForm placeholder="Nama board…" submitLabel="+ Board baru" onSubmit={create} />
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          title="Hapus board?"
          body={
            <>
              “{pending.title}” akan dihapus bersama seluruh kolom dan kartu di dalamnya. Setelah
              jendela urung tutup, isinya tidak bisa dipulihkan.
            </>
          }
          confirmLabel="Hapus board"
          onConfirm={() => remove(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
