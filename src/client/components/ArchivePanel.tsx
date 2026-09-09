import { useEffect, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { useLanguage, useT } from "../hooks/useLanguage";
import { api } from "../lib/api";
import { formatDateTime, formatRelative } from "../lib/format";
import { navigate, paths } from "../lib/route";
import type { ArchivedCard } from "../../shared/types";

/** Kotak arsip — sama dengan ikon "Arsipkan" di `CardModal`. */
function ArchiveIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
 * Arsip di kepala papan — dialog modal seperti `CardModal`/`ConfirmDialog`,
 * bukan popover kecil: isinya daftar yang dibaca dan diklik, bobotnya lebih
 * dekat ke dialog daripada ke menu singkat.
 *
 * Judul barisnya bisa diklik untuk membuka kartunya lewat `CardModal` biasa
 * (menutup dialog arsip ini dulu, lalu pindah alamat — pola yang sama
 * dengan hasil `CardSearch`). Pulihkan dan hapus permanen tetap tinggal di
 * baris ini sebagai aksi cepat tanpa perlu membuka kartunya dulu.
 */
export function ArchivePanel({ boardId, count, onChanged }: Props) {
  const t = useT();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ArchivedCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

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
        if (alive) setError(e instanceof Error ? e.message : t.archivePanel.loadError);
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, boardId]);

  // Fokus pindah ke dialog begitu terbuka, sama seperti CardModal — Escape
  // harus bekerja tanpa pengguna perlu mengklik apa pun dulu.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  const openCard = (id: string) => {
    setOpen(false);
    navigate(paths.card(boardId, id));
  };

  const restore = async (id: string) => {
    setItems((prev) => prev?.filter((item) => item.id !== id) ?? prev);
    try {
      await api.restoreCard(id);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.archivePanel.restoreError);
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
      setError(e instanceof Error ? e.message : t.archivePanel.deleteError);
    } finally {
      onChanged();
    }
  };

  const pendingTitle =
    items?.find((item) => item.id === pendingDeleteId)?.title ?? t.archivePanel.defaultCardName;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={count > 0 ? t.archivePanel.archiveAria(count) : t.archivePanel.archiveButton}
        title={t.archivePanel.archiveTitle}
        className="chip shrink-0 cursor-pointer transition-colors hover:bg-line-soft"
      >
        <ArchiveIcon className="size-3.5" />
        <span className="hidden sm:inline">{t.archivePanel.archiveButton}</span>
        {count > 0 && (
          <span className="grid size-4 place-items-center rounded-full bg-accent text-[0.625rem] leading-none font-semibold text-accent-on tabular-nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4 sm:p-6"
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
          }}
        >
          <div className="scrim scrim-dim" onClick={() => setOpen(false)} aria-hidden />

          {/* `.card-plain`, bukan `.glass.glass-lens` — pelat pekat yang
              sama dengan `CardModal`, bukan kaca yang direfraksi. Daftar ini
              dibaca, bukan sekilas-lalu-tutup seperti `ConfirmDialog`, dan
              kaca di atas latar papan yang warna-warni (terutama di tema
              gelap) membuat teksnya kalah kontras dengan apa pun yang
              kebetulan ada di baliknya. */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={t.archivePanel.dialogLabel}
            tabIndex={-1}
            className="card-plain relative flex max-h-[min(80vh,36rem)] w-full max-w-lg flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center gap-2 px-5 pt-4 pb-3">
              <h2 className="text-base font-semibold tracking-tight">{t.archivePanel.archiveButton}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={t.archivePanel.closeAria}
                // `--card-plate-hi`, bukan `hover:bg-line-soft`: garis rambut
                // 7% putihnya nyaris tak kelihatan di atas `--card-fill` yang
                // sepekat ini — token yang sama dipakai `.btn-glass:hover` di
                // dalam kartu polos ini, dengan alasan yang sama.
                className="ml-auto grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-(--card-plate-hi) hover:text-ink"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                  <path d="M6 6 18 18M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
              {error && <p className="px-3 py-6 text-center text-sm text-danger">{error}</p>}

              {!error && items === null && (
                <p className="px-3 py-6 text-center text-sm text-muted">{t.archivePanel.loading}</p>
              )}

              {!error && items && items.length === 0 && (
                <p className="px-3 py-10 text-center text-sm leading-relaxed text-muted">
                  {t.archivePanel.empty}
                </p>
              )}

              {items?.map((item) => (
                <div key={item.id} className="flex items-center gap-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => openCard(item.id)}
                    className="min-w-0 flex-1 cursor-pointer rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-(--card-plate-hi)"
                  >
                    {/* `text-ink`, bukan `text-ink-soft`: judul kartu adalah
                        teks utama daftar ini, dan di tema gelap ia harus
                        sekuat judul di dialog kartu — di atas `--card-fill`
                        yang sepekat #171A21, `--color-ink` memberi 16:1
                        sementara `ink-soft` berhenti di 11:1. Yang di
                        bawahnya tetap `text-muted` (6,6:1) supaya hierarki
                        dua barisnya tidak ikut mendatar. */}
                    <p className="truncate text-sm font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {item.columnTitle} ·{" "}
                      <span title={formatDateTime(item.archivedAt, language)}>
                        {formatRelative(item.archivedAt, language, t)}
                      </span>
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-0.5 pr-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void restore(item.id);
                      }}
                      /* Keduanya aksi, bukan keterangan — dan `text-muted`
                         membuatnya terbaca sederajat dengan baris nama kolom
                         di sebelahnya. `text-ink-soft` mengembalikan bedanya
                         tanpa membuat mereka menyaingi judul kartunya. */
                      className="cursor-pointer rounded-lg px-2 py-1.5 text-xs text-ink-soft transition-colors hover:bg-accent-soft hover:text-accent-ink"
                    >
                      {t.archivePanel.restore}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDeleteId(item.id);
                      }}
                      className="cursor-pointer rounded-lg px-2 py-1.5 text-xs text-ink-soft transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      {t.archivePanel.deletePermanent}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {pendingDeleteId && (
        <ConfirmDialog
          title={t.archivePanel.confirmDeleteTitle}
          body={t.archivePanel.confirmDeleteBody(pendingTitle)}
          confirmLabel={t.archivePanel.deletePermanent}
          onConfirm={() => void confirmDeletePermanent()}
          onCancel={() => setPendingDeleteId(null)}
        />
      )}
    </>
  );
}
