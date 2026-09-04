import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AddItemForm } from "./AddItemForm";
import { AppHeader } from "./AppHeader";
import { ConfirmDialog } from "./ConfirmDialog";
import { useUndo } from "./UndoToasts";
import { insertAt } from "../lib/reorder";
import { navigate, paths } from "../lib/route";
import { ListSkeleton } from "./Skeleton";
import type { WorkspaceSummary } from "../../shared/types";

const ROLE_LABEL = { owner: "Pemilik", admin: "Admin", member: "Anggota" } as const;

export function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<WorkspaceSummary | null>(null);
  const undo = useUndo();

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

  /* Sama seperti menghapus board: barisnya hilang sekarang, perintah DELETE-nya
     berangkat setelah jendela urung habis — lihat UndoProvider. Yang ikut
     terbawa cascade di sini jauh lebih banyak (board, kolom, kartu, dan
     keanggotaan), jadi jendela itu justru paling berguna di halaman ini. */
  const remove = (workspace: WorkspaceSummary) => {
    const index = workspaces?.findIndex((w) => w.id === workspace.id) ?? -1;
    if (index < 0) return;

    setPending(null);
    setWorkspaces((prev) => prev?.filter((w) => w.id !== workspace.id) ?? null);

    undo({
      message: `Workspace “${workspace.name}” dihapus`,
      commit: (options) => api.deleteWorkspace(workspace.id, options),
      revert: () => setWorkspaces((prev) => (prev ? insertAt(prev, workspace, index) : prev)),
      onError: setError,
    });
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
            <li
              key={workspace.id}
              className="glass glass-plate glass-plate-hover flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors"
            >
              <button
                onClick={() => navigate(paths.workspace(workspace.id))}
                className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent-ink"
              >
                {workspace.name}
              </button>

              <span className="chip shrink-0">{ROLE_LABEL[workspace.role]}</span>

              {/* Hanya pemilik yang boleh menghapus workspace — server tetap
                  yang memutuskan; ini cuma menyembunyikan tombol yang pasti
                  ditolak. Anggota lain yang ingin pergi memakai "keluar dari
                  workspace" di halaman Anggota, bukan tombol ini. */}
              {workspace.role === "owner" && (
                <button
                  onClick={() => setPending(workspace)}
                  aria-label={`Hapus workspace ${workspace.name}`}
                  title="Hapus workspace"
                  className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <path d="M6 6 18 18M18 6 6 18" />
                  </svg>
                </button>
              )}
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
            submitLabel="Workspace baru"
            onSubmit={create}
          />
        </div>
      </div>

      {pending && (
        <ConfirmDialog
          title="Hapus workspace?"
          body={
            <>
              “{pending.name}” akan dihapus bersama seluruh board, kolom, dan kartu di dalamnya,
              dan anggotanya kehilangan aksesnya. Setelah jendela urung tutup, isinya tidak bisa
              dipulihkan.
            </>
          }
          confirmLabel="Hapus workspace"
          onConfirm={() => remove(pending)}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
