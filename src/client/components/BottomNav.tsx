import { ProfileMenu } from "./ProfileMenu";
import { ThemeSwitch } from "./ThemeSwitch";

/* Logo React — atom dengan tiga orbit. Digambar inline supaya tidak ada
   permintaan jaringan tambahan; warnanya mengikuti `currentColor`. */
function ReactMark() {
  return (
    <svg viewBox="-11.5 -10.23 23 20.46" className="size-3.5 shrink-0" aria-hidden>
      <circle r="2.05" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1" fill="none">
        <ellipse rx="11" ry="4.2" />
        <ellipse rx="11" ry="4.2" transform="rotate(60)" />
        <ellipse rx="11" ry="4.2" transform="rotate(120)" />
      </g>
    </svg>
  );
}

/* Kapsul navigasi. Mengambang: tidak menyentuh sisi mana pun, jadi latar
   halaman lewat di keempat tepinya dan kapsul terbaca sebagai benda di atas
   halaman, bukan potongan dari halaman.

   `credit` disembunyikan di papan kanban — di sana ruang horizontal milik
   kolom, dan kapsul harus setipis mungkin. */
export function BottomNav({ credit = true }: { credit?: boolean }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-4">
      <nav className="glass glass-frost pointer-events-auto flex items-center gap-2 rounded-full p-1.5">
        {credit && (
          <>
            <p className="flex items-center gap-1.5 pl-2 text-xs text-muted">
              <span className="text-accent">
                <ReactMark />
              </span>
              <span className="hidden sm:inline">
                Dibuat oleh <span className="font-semibold text-ink">syahrulfadli</span> dengan
                ReactJS
              </span>
            </p>
            <span className="h-5 w-px bg-line-soft" />
          </>
        )}

        <ProfileMenu />
        <ThemeSwitch />
      </nav>
    </div>
  );
}
