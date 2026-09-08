import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { AddItemForm } from "./AddItemForm";
import { AppHeader } from "./AppHeader";
import { ConfirmDialog } from "./ConfirmDialog";
import { NameColorPopover } from "./NameColorPopover";
import { useUndo } from "./UndoToasts";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import { insertAt } from "../lib/reorder";
import { navigate, paths } from "../lib/route";
import { ListSkeleton, SkeletonLine } from "./Skeleton";
import type { Board, LabelColor, WorkspaceSummary } from "../../shared/types";

export function WorkspacePage({ workspaceId }: { workspaceId: string }) {
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Board | null>(null);
  /* Id, bukan objeknya — alasan yang sama seperti di daftar workspace. */
  const [editingId, setEditingId] = useState<string | null>(null);
  /* Satu ref untuk seluruh daftar — alasan yang sama seperti di daftar
     workspace: hanya satu popover yang pernah terbuka sekaligus. */
  const editAnchorRef = useRef<HTMLButtonElement>(null);
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

  /** Judul dan warna penanda sekaligus — optimistik, pola sama dengan daftar
      workspace: keadaan lama disimpan sebagai jalan pulang, tanpa toast urung
      karena tidak ada yang hilang untuk diurungkan. */
  const save = async (board: Board, patch: { name: string; color: LabelColor | null }) => {
    const next = { title: patch.name, color: patch.color };
    setBoards((prev) => prev?.map((b) => (b.id === board.id ? { ...b, ...next } : b)) ?? null);

    try {
      await api.updateBoard(board.id, next);
    } catch (e: unknown) {
      setBoards((prev) => prev?.map((b) => (b.id === board.id ? board : b)) ?? null);
      setError(e instanceof Error ? e.message : "Gagal menyimpan board");
    }
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
        {workspace ? (
          <span className="truncate text-sm font-medium">{workspace.name}</span>
        ) : (
          <SkeletonLine className="w-24" />
        )}
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

        {!boards && !error && (
          <div className="mt-6">
            <ListSkeleton label="Memuat daftar board…" />
          </div>
        )}

        <ul className="mt-6 flex flex-col gap-2 empty:mt-0">
          {boards?.map((board) => (
            <li
              key={board.id}
              className="glass glass-plate glass-plate-hover relative flex items-center gap-2 rounded-2xl px-4 py-3.5 transition-colors"
            >
              {/* Sama seperti baris workspace: tanpa warna berarti tanpa titik,
                  bukan titik kosong. */}
              {board.color && (
                <span
                  aria-hidden
                  style={labelTint(board.color)}
                  className="label-dot size-2.5 shrink-0"
                />
              )}

              <button
                onClick={() => navigate(paths.board(board.id))}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent-ink"
              >
                {board.title}
              </button>

              {/* Beda dari tombol hapus di sebelahnya: mengubah judul & warna
                  papan terbuka untuk semua anggota, persis seperti mengganti
                  latarnya dari dalam papan — server pun tidak menuntut admin
                  untuk itu. */}
              <button
                ref={editingId === board.id ? editAnchorRef : null}
                onClick={() => setEditingId((id) => (id === board.id ? null : board.id))}
                aria-haspopup="dialog"
                aria-expanded={editingId === board.id}
                aria-label={`Ubah board ${board.title}`}
                title="Ubah nama & warna"
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full transition-colors hover:bg-accent-soft hover:text-accent-ink",
                  editingId === board.id ? "text-accent-ink" : "text-faint",
                )}
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 20h4l10-10a2.4 2.4 0 0 0-4-4L4 16v4Z" />
                </svg>
              </button>

              {editingId === board.id && (
                <NameColorPopover
                  subject="board"
                  name={board.title}
                  color={board.color}
                  anchorRef={editAnchorRef}
                  onSubmit={(patch) => void save(board, patch)}
                  onClose={() => setEditingId(null)}
                />
              )}

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
          <AddItemForm placeholder="Nama board…" submitLabel="Board baru" onSubmit={create} />
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
