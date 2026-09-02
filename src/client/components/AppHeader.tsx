import { navigate, paths } from "../lib/route";

/* Breadcrumb. Tidak lagi berupa pane kaca: bilah bertepi sendiri membelah
   halaman jadi dua bidang, sedangkan jalur navigasi ini bagian dari isi
   halaman. Jadi latarnya dibiarkan tembus dan hanya tinggal jaraknya.

   Identitas dan tombol keluar pindah ke menu profil di kapsul bawah. */
export function AppHeader({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex shrink-0 items-center gap-2 px-5 pt-5 pb-3">
      <button
        onClick={() => navigate(paths.workspaces)}
        className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-tight"
      >
        {/* Tiga kolom kecil — lambang papan kanban. */}
        <svg viewBox="0 0 24 24" className="size-4 text-accent" aria-hidden>
          <rect x="2.5" y="4" width="5" height="16" rx="1.5" fill="currentColor" opacity="0.9" />
          <rect x="9.5" y="4" width="5" height="11" rx="1.5" fill="currentColor" opacity="0.6" />
          <rect x="16.5" y="4" width="5" height="7" rx="1.5" fill="currentColor" opacity="0.35" />
        </svg>
        Kanban
      </button>

      {children}
    </header>
  );
}
