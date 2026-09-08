import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useDismiss } from "../hooks/useDismiss";
import { api } from "../lib/api";
import { formatDateTime, formatRelative } from "../lib/format";
import type { ArchivedCard } from "../../shared/types";

/** Kotak arsip — sama dengan ikon "Arsipkan" di `CardModal`. */
function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

interface Props {
  boardId: string;
  /** Jumlah kartu terarsip — sudah datang bersama board, tidak perlu ditarik ulang untuk badge-nya. */
  count: number;
  /** Board perlu ditarik ulang setelah pulihkan/hapus permanen, supaya kartu
      yang dipulihkan muncul lagi di papan dan badge di sini ikut berubah. */
  onChanged: () => void;
}

/**
 * Panel arsip di kepala papan, sejajar tombol Filter dan Latar.
 *
 * Isinya daftar datar — bukan CardModal yang dibuka ulang: kartu terarsip
 * sudah keluar dari `board.columns` (lihat GET /boards/:id), jadi dialog
 * kartu yang bergantung pada board tidak akan pernah menemukannya lagi.
 * Baris di sini cukup untuk mengenali kartunya dan memutuskan: pulihkan,
 * atau hapus selamanya.
 */
export function ArchivePanel({ boardId, count, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArchivedCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useDismiss(open, () => setOpen(false), [ref, panelRef]);

  // Daftarnya ditarik saat panel dibuka, bukan saat board dimuat — kebanyakan
  // orang membuka board tanpa pernah melihat arsipnya.
  useEffect(() => {
    if (!open) return;

    let alive = true;
    void (async () => {
      try {
        const rows = await api.listArchivedCards(boardId);
        if (alive) setItems(rows);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Gagal memuat arsip");
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, boardId]);

  const restore = async (id: string) => {
    setItems((prev) => prev?.filter((item) => item.id !== id) ?? prev);
    try {
      await api.restoreCard(id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memulihkan kartu");
    } finally {
      onChanged();
    }
  };

  const confirmDeletePermanent = async () => {
    const id = pendingDeleteId;
    if (!id) return;
    setPendingDeleteId(null);

    setItems((prev) => prev?.filter((item) => item.id !== id) ?? prev);
    try {
      await api.deleteCard(id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menghapus kartu");
    } finally {
      onChanged();
    }
  };

  const pendingTitle = items?.find((item) => item.id === pendingDeleteId)?.title ?? "Kartu ini";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? `Arsip, ${count} kartu` : "Arsip"}
        title="Arsip kartu"
        className="chip cursor-pointer transition-colors hover:bg-line-soft"
      >
        <ArchiveIcon />
        <span className="hidden sm:inline">Arsip</span>
        {count > 0 && (
          <span className="grid size-4 place-items-center rounded-full bg-accent text-[0.625rem] leading-none font-semibold text-accent-on tabular-nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Arsip kartu"
          className="sheet sheet-frost absolute top-full right-0 z-30 mt-2 w-80 max-w-[calc(100vw-1.5rem)] rounded-2xl p-1.5"
        >
          <p className="px-2.5 pt-1.5 text-xs font-semibold tracking-tight">Arsip</p>

          <div className="mt-1 flex max-h-[min(60vh,26rem)] flex-col gap-0.5 overflow-y-auto">
            {error && <p className="px-2.5 py-4 text-center text-[11px] text-danger">{error}</p>}

            {!error && items === null && (
              <p className="px-2.5 py-4 text-center text-[11px] text-muted">Memuat…</p>
            )}

            {!error && items && items.length === 0 && (
              <p className="px-2.5 py-4 text-center text-[11px] leading-relaxed text-muted">
                Belum ada kartu yang diarsipkan.
              </p>
            )}

            {items?.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-2 rounded-xl px-2.5 py-2 transition-colors hover:bg-line-soft"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] font-medium text-ink-soft">{item.title}</p>
                  <p className="mt-0.5 truncate text-[11px] text-faint">
                    {item.columnTitle} ·{" "}
                    <span title={formatDateTime(item.archivedAt)}>
                      {formatRelative(item.archivedAt)}
                    </span>
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => void restore(item.id)}
                    className="cursor-pointer rounded-lg px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-accent-soft hover:text-accent-ink"
                  >
                    Pulihkan
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(item.id)}
                    className="cursor-pointer rounded-lg px-1.5 py-1 text-[11px] text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    Hapus permanen
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title="Hapus kartu secara permanen?"
          body={`"${pendingTitle}" akan hilang selamanya — beda dari arsip, ini tidak bisa dipulihkan lagi.`}
          confirmLabel="Hapus permanen"
          onConfirm={() => void confirmDeletePermanent()}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </div>
  );
}
