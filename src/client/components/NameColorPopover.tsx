import { useRef, useState, type RefObject } from "react";
import { ColorSwatches } from "./ColorSwatches";
import { useDismiss } from "../hooks/useDismiss";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import type { LabelColor } from "../../shared/types";

interface Props {
  /** Kata yang menyebut bendanya: "workspace" atau "board". */
  subject: string;
  name: string;
  color: LabelColor | null;
  /** Dipanggil sekali dengan keduanya — nama dan warna disunting bersama. */
  onSubmit: (patch: { name: string; color: LabelColor | null }) => void;
  onClose: () => void;
  /**
   * Tombol yang memunculkan popover ini. Ikut dihitung sebagai "di dalam",
   * kalau tidak ketukan pada tombolnya sendiri terbaca sebagai ketukan di
   * luar: popover ditutup oleh `pointerdown`, lalu `click` tombolnya
   * membukanya lagi seketika — dan menekan tombol yang sama dua kali
   * terlihat seperti tidak terjadi apa-apa.
   */
  anchorRef: RefObject<HTMLElement | null>;
}

/**
 * Pengubah nama dan warna satu baris daftar — dipakai baris workspace dan
 * baris board, yang memang menyunting hal yang sama persis dengan dua kata
 * berbeda untuk bendanya.
 *
 * Popover berlabuh di barisnya, bukan dialog terpusat: yang disunting di sini
 * dua isian kecil, dan menutup seluruh layar untuk itu membuat perubahan nama
 * terasa lebih berat daripada menghapusnya.
 *
 * Warnanya ikut tombol Simpan, tidak tersimpan seketika seperti warna kolom.
 * Di sini ia bertetangga dengan kolom isian yang memang butuh ditutup dengan
 * Simpan, dan satu panel yang setengah isinya menyimpan sendiri sementara
 * setengah lagi menunggu tombol tidak bisa ditebak dari melihatnya.
 */
export function NameColorPopover({
  subject,
  name,
  color,
  onSubmit,
  onClose,
  anchorRef,
}: Props) {
  const [draft, setDraft] = useState(name);
  const [tint, setTint] = useState<LabelColor | null>(color);
  const ref = useRef<HTMLDivElement>(null);

  useDismiss(true, onClose, [ref, anchorRef]);

  const commit = () => {
    const trimmed = draft.trim();
    /* Nama kosong bukan penolakan yang perlu diberi pesan: kolomnya masih
       terbuka di depan orangnya, dan yang dibutuhkannya cuma tetap di situ. */
    if (!trimmed) return;

    if (trimmed !== name || tint !== color) onSubmit({ name: trimmed, color: tint });
    onClose();
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Ubah ${subject}`}
      /* Berlabuh ke kanan barisnya — tombol pemicunya duduk di ujung kanan,
         dan panel yang tumbuh ke kiri dari situ tidak akan terpotong tepi
         layar di lebar mana pun. */
      className="sheet absolute top-full right-0 z-30 mt-1.5 w-64 rounded-2xl p-3 text-left"
    >
      <label className="block text-xs font-semibold tracking-tight">Nama {subject}</label>
      <input
        autoFocus
        value={draft}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
          /* Escape ditutup di sini sendiri, tidak diserahkan ke `useDismiss`.
             `stopPropagation` pada peristiwa sintetis React ikut menghentikan
             peristiwa aslinya di wadah akar — jadi pendengar `keydown` milik
             `useDismiss`, yang duduk di `document`, tidak akan pernah
             kebagian. Menahannya tetap perlu (supaya Escape tidak menembus ke
             apa pun di belakang popover ini), jadi penutupannya harus
             dikerjakan di tempat yang sama — pola yang sama dengan popover
             tenggat di `CardDue`. */
          if (e.key === "Escape") {
            e.stopPropagation();
            onClose();
          }
        }}
        className="field mt-1.5"
      />

      <p className="mt-3 mb-2 flex items-center gap-1.5 text-xs text-muted">
        {/* Titik yang sama dengan yang akan tampil di barisnya nanti — pratinjau
            sekaligus penunjuk warna mana yang sedang dipakai. */}
        <span
          className={cn("label-dot size-3", tint === null && "label-dot-none")}
          style={tint ? labelTint(tint) : undefined}
        />
        Warna penanda
      </p>
      <ColorSwatches clearable value={tint} onChange={setTint} />

      <div className="mt-3 flex items-center gap-1.5">
        <button type="button" onClick={commit} disabled={!draft.trim()} className="btn btn-primary">
          Simpan
        </button>
        <button type="button" onClick={onClose} className="btn btn-ghost">
          Batal
        </button>
      </div>
    </div>
  );
}
