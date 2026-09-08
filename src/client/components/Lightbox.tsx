import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Lightbox ringan: konten mengambang di atas backdrop gelap, tanpa zoom/pan.
 * Dipakai untuk pratinjau gambar lampiran dan foto profil ukuran asli.
 *
 * Fokus dipindah ke wadahnya sendiri saat terbuka, dan Escape di sini
 * dihentikan propagasinya — persis pola `ConfirmDialog`. Tanpa itu, Escape
 * menembus ke dialog di baliknya (kartu, atau popover profil) dan
 * menutupnya juga, bukan cuma lightbox-nya.
 */
export function Lightbox({ label, onClose, children }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed inset-0 z-[57] flex items-center justify-center overflow-hidden p-4 outline-none"
    >
      <div className="scrim" onClick={onClose} aria-hidden />
      {children}
    </div>
  );
}
