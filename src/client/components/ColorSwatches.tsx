import { labelTint } from "../lib/people";
import { LABEL_COLORS, type LabelColor } from "../../shared/types";

interface Props {
  value: LabelColor | null;
  onChange: (color: LabelColor | null) => void;
  /* Pilihan "tanpa warna", untuk pemakai yang warnanya boleh kosong (kolom).
     Label selalu punya warna, jadi di sana pilihan ini tidak ada sama sekali —
     bukan ada tapi dinonaktifkan. */
  clearable?: boolean;
  clearLabel?: string;
}

/**
 * Deretan pilihan warna. Titik, bukan kotak: warnanya yang dipilih, bukan
 * bentuknya.
 *
 * Dipakai pemilih label dan pemilih warna kolom. Keduanya memang harus satu
 * bentuk — palet yang sama yang digambar dua kali cepat atau lambat akan
 * menyimpang di salah satunya.
 */
export function ColorSwatches({ value, onChange, clearable, clearLabel = "Tanpa warna" }: Props) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {clearable && (
        <button
          type="button"
          aria-label={clearLabel}
          aria-pressed={value === null}
          title={clearLabel}
          onClick={() => onChange(null)}
          className="grid size-6 place-items-center rounded-full transition-transform hover:scale-110"
        >
          {/* Titik kosong bergaris, bukan titik abu: "tanpa warna" harus
              terbaca sebagai ketiadaan pilihan, bukan sebagai warna kesepuluh. */}
          <span className="label-dot label-dot-none size-4" data-selected={value === null} />
        </button>
      )}

      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Warna ${color}`}
          aria-pressed={color === value}
          onClick={() => onChange(color)}
          style={labelTint(color)}
          className="grid size-6 place-items-center rounded-full transition-transform hover:scale-110"
        >
          <span className="label-dot size-4" data-selected={color === value} />
        </button>
      ))}
    </div>
  );
}
