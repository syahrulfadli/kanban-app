import { useEffect, useId, useRef } from "react";

interface Props {
  title: string;
  /** Apa yang ikut hilang — bukan pengulangan judul. */
  body: React.ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog penegasan untuk aksi yang merusak. Tombol utamanya yang difokus:
 * penghapusan di aplikasi ini selalu masih bisa diurungkan lewat toast, jadi
 * ongkos salah tekan kecil sementara ongkos menghalangi alur kerja tidak.
 */
export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }: Props) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const labelId = useId();
  const bodyId = useId();

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center overflow-hidden p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      {/* Saudara, bukan induk — lihat catatan .glass-frost. */}
      <div className="scrim" onClick={onCancel} aria-hidden />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={bodyId}
        className="glass glass-lens card-dialog relative w-full max-w-sm p-5 outline-none"
      >
        <h2 id={labelId} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        <p id={bodyId} className="mt-2 text-sm leading-relaxed text-muted">
          {body}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn-glass">
            Batal
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className="btn btn-danger">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
