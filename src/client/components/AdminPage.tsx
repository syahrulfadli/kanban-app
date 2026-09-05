import { AdminBackgrounds } from "./AdminBackgrounds";
import { AdminUsers } from "./AdminUsers";
import { AppHeader } from "./AppHeader";
import { ListSkeleton } from "./Skeleton";
import { useAdminAccess } from "../hooks/useAdminAccess";
import { cn } from "../lib/cn";
import { navigate, paths, type AdminTab } from "../lib/route";

const TABS: { tab: AdminTab; label: string; path: string }[] = [
  { tab: "backgrounds", label: "Latar papan", path: paths.admin },
  { tab: "users", label: "Pengguna", path: paths.adminUsers },
];

/**
 * Panel admin aplikasi.
 *
 * Dua urusan, dua alamat — bukan dua state di satu alamat: keduanya adalah
 * halaman yang dibuka lama, dan alamat yang bisa disalin berarti "buka daftar
 * pengguna" bisa dikirim ke sesama admin.
 *
 * Yang menjaga isinya tetap server: setiap rute /api/admin menjawab 404 bagi
 * yang bukan admin. Penjagaan di sini urusan tampilan — supaya yang tersesat
 * ke alamat ini melihat kalimat, bukan deretan galat.
 */
export function AdminPage({ tab }: { tab: AdminTab }) {
  const { admin, checked } = useAdminAccess();

  return (
    <>
      <AppHeader>
        <span className="text-faint">/</span>
        <span className="truncate text-sm font-medium">Admin</span>
      </AppHeader>

      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Panel admin</h1>

        {/* Selagi jawabannya belum datang, yang tampil kerangka daftar —
            bukan kalimat penolakan. Menolak dulu lalu berubah pikiran
            sepersekian detik kemudian adalah tuduhan yang ditarik kembali. */}
        {!checked ? (
          <div className="mt-6">
            <ListSkeleton rows={3} label="Memeriksa akses admin" />
          </div>
        ) : !admin ? (
          <Denied />
        ) : (
          <>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              Yang diurus di sini berlaku untuk seluruh aplikasi, bukan untuk satu workspace.
            </p>

            {/* Kapsul dua tab. Bukan bilah bertepi: halaman ini bagian dari
                aplikasi yang sama, dan garis pemisah di bawah tab membelah
                halaman jadi dua bidang. */}
            <nav className="mt-4 flex w-fit items-center gap-1 rounded-full border border-line p-1">
              {TABS.map((item) => (
                <button
                  key={item.tab}
                  onClick={() => navigate(item.path)}
                  aria-current={tab === item.tab ? "page" : undefined}
                  className={cn(
                    "rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors",
                    tab === item.tab
                      ? "bg-accent-soft text-accent-ink"
                      : "text-muted hover:text-ink",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {tab === "backgrounds" ? <AdminBackgrounds /> : <AdminUsers />}
          </>
        )}
      </div>
    </>
  );
}

/* Jawaban untuk yang bukan admin. Sengaja tidak menjelaskan apa isi panelnya
   — bagi yang tersesat ke sini, deskripsi fitur yang tidak bisa ia buka cuma
   membuat halaman ini terasa seperti pintu yang dikunci di depan mukanya. */
function Denied() {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line px-5 py-8 text-center">
      <p className="text-sm text-muted">Halaman ini hanya untuk admin aplikasi.</p>
      <button onClick={() => navigate(paths.workspaces)} className="btn btn-glass mt-4">
        ← Kembali ke daftar workspace
      </button>
    </div>
  );
}
