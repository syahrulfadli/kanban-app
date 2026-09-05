import { cn } from "../lib/cn";

/**
 * Sakelar dua keadaan. Tombolnya sendiri yang jadi jalur peluncurnya.
 *
 * Berdiri sendiri sejak dipakai di dua tempat — pengaturan notifikasi dan
 * pemilih latar papan. Menyalinnya berarti dua sakelar yang cepat atau lambat
 * bergerak dengan kurva yang berbeda.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  labelledBy,
  className,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
  /* Pemilih latar memakainya dalam ukuran yang lebih kecil; ukuran bawaannya
     tetap ukuran di halaman pengaturan. */
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
        // Keadaan mati butuh cincin: isian redup saja nyaris hilang di tema
        // terang, dan sakelar yang tak terlihat tidak bisa ditekan orang.
        checked
          ? "bg-accent"
          : "bg-line-soft shadow-[inset_0_0_0_1px_var(--color-line)]",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-0 size-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
}
