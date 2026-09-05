import { cn } from "../lib/cn";

/* Logo React — atom dengan tiga orbit. Digambar inline supaya tidak ada
   permintaan jaringan tambahan; warnanya mengikuti `currentColor`. */
function ReactMark() {
  return (
    <svg viewBox="-11.5 -10.23 23 20.46" className="credit-mark size-3.5 shrink-0" aria-hidden>
      <circle r="2.05" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
}

/** Tinggi laci kredit saat terbuka penuh, dalam px — termasuk jarak ke kapsul. */
const DRAWER = 32;

/* Kredit pembuat. Bukan lagi penumpang di kapsul navigasi: di sana ia
   memakan ruang yang dibutuhkan tombol, dan hilang sama sekali di papan
   kanban. Sekarang ia berdiri sendiri di bawah kapsul, di tengah, dan
   berlaku untuk semua halaman.

   Laci luarnya yang mengatur tinggi; karena kapsul duduk tepat di atasnya
   dalam satu tumpukan yang berlabuh di dasar layar, kapsul ikut naik dengan
   sendirinya saat kredit keluar — tanpa ada yang perlu menghitung offset.

   `open` datang berkelanjutan dari useCreditReveal, jadi kreditnya mengikuti
   tarikan: naik, menjernih, dan menetap di ujung tarikan. */
export function CreditFooter({ open }: { open: number }) {
  const hidden = open < 0.01;

  return (
    <div
      className="relative w-full transition-[height] duration-300 ease-[var(--ease-spring)] motion-reduce:transition-none"
      style={{ height: `${open * DRAWER}px` }}
      // Selagi tersembunyi ia bukan cuma tak terlihat: pembaca layar dan
      // Tab pun tidak boleh menemukannya di balik laci yang tertutup.
      aria-hidden={hidden}
      inert={hidden}
    >
      {/* Berlabuh ke bibir bawah laci, bukan mengalir di dalamnya: bibir itu
          selalu di tempat yang sama, jadi kredit tidak pernah tampil
          terpotong separuh selagi ditarik — yang bergerak cuma kapsul di
          atasnya, dan kreditnya sendiri menjernih sambil naik sedikit. */}
      <div
        className="absolute inset-x-0 bottom-0 flex justify-center transition-[opacity,transform] duration-300 ease-[var(--ease-spring)] motion-reduce:transition-none"
        style={{ opacity: open, transform: `translateY(${(1 - open) * 12}px)` }}
      >
        {/* `on-photo-bottom` hanya berarti di papan yang latarnya foto tanpa
            kabut — di halaman lain atributnya tidak ada di <html> dan kelas ini
            tidak menimpa apa pun. */}
        <p
          className={cn(
            "credit on-photo on-photo-bottom",
            hidden ? "pointer-events-none" : "pointer-events-auto",
          )}
        >
          <span className="text-accent">
            <ReactMark />
          </span>
          <span>
            Dibuat oleh <span className="credit-name">Syahrul</span> dengan React
          </span>
        </p>
      </div>
    </div>
  );
}
