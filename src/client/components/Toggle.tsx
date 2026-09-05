import { cn } from "../lib/cn";

/**
 * Sakelar dua keadaan. Tombolnya sendiri yang jadi jalur peluncurnya.
 *
 * Berdiri sendiri sejak dipakai di dua tempat — pengaturan notifikasi dan
 * pemilih latar papan. Menyalinnya berarti dua sakelar yang cepat atau lambat
 * bergerak dengan kurva yang berbeda.
 */
type Size = "md" | "sm";

/**
 * Ukurannya disebut, bukan dititipkan lewat kelas.
 *
 * Jalur dan kenop harus cocok satu sama lain: kenop yang tingginya dipatok
 * untuk jalur 24 piksel akan menyentuh tepi jalur 20 piksel dan terlihat
 * keluar dari relnya. Jadi keduanya lahir dari satu tempat, dan pemanggil
 * memilih dari ukuran yang memang sudah dipasangkan.
 *
 * Jarak kiri dan kanan dibuat sama persis: 4 piksel di ukuran biasa (4 + 16 +
 * 20 = 40) dan 3 piksel di ukuran kecil (3 + 14 + 19 = 36). Tegaknya tidak
 * dihitung sama sekali — kenopnya dipusatkan sendiri, jadi jalur setinggi
 * berapa pun tidak bisa membuatnya melenceng.
 */
const SIZES: Record<Size, { track: string; knob: string; off: string; on: string }> = {
  md: { track: "h-6 w-10", knob: "size-4", off: "translate-x-1", on: "translate-x-5" },
  sm: {
    track: "h-5 w-9",
    knob: "size-3.5",
    off: "translate-x-[3px]",
    on: "translate-x-[19px]",
  },
};

export function Toggle({
  checked,
  onChange,
  disabled,
  labelledBy,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
  size?: Size;
}) {
  const dims = SIZES[size];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-200",
        dims.track,
        // Keadaan mati butuh cincin: isian redup saja nyaris hilang di tema
        // terang, dan sakelar yang tak terlihat tidak bisa ditekan orang.
        checked
          ? "bg-accent"
          : "bg-line-soft shadow-[inset_0_0_0_1px_var(--color-line)]",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          /* Dipusatkan tegak lurus terhadap jalurnya, bukan diberi jarak dari
             atas: dengan begitu tinggi jalur boleh berubah tanpa ada offset
             yang harus ikut dihitung ulang. */
          "absolute top-1/2 left-0 -translate-y-1/2 rounded-full bg-white shadow-sm",
          "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          dims.knob,
          checked ? dims.on : dims.off,
        )}
      />
    </button>
  );
}
