import { cn } from "../lib/cn";
import { AppHeader } from "./AppHeader";

/* Kerangka muat.
 *
 * Aturannya satu: kerangka harus menempati ruang yang sama dengan isi yang
 * akan menggantikannya. Bukan demi kemiripan, melainkan supaya halaman tidak
 * melompat begitu datanya mendarat — itulah bedanya dengan sekadar tulisan
 * "Memuat…" di tengah layar, yang selalu berukuran lain dari apa pun yang
 * menyusul.
 *
 * Karena itu setiap kerangka di berkas ini menyalin kelas tata letak dari
 * komponen aslinya (lebar kolom, padding pelat, jarak antarbaris), dan hanya
 * mengganti teks dengan blok. Kalau tata letak aslinya berubah, kerangkanya
 * ikut diubah di sini.
 */

/** Blok polos. Ukurannya selalu datang dari pemanggil. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton block", className)} />;
}

/** Sebaris teks. Tingginya sudah pas satu baris text-sm — lihat index.css. */
export function SkeletonLine({ className }: { className?: string }) {
  return <span aria-hidden className={cn("skeleton skeleton-line block", className)} />;
}

/**
 * Pembungkus kerangka.
 *
 * Blok-bloknya sendiri `aria-hidden`: bagi pembaca layar, selusin kotak
 * kosong bukan informasi. Yang dibacakan hanya satu kalimat dari sini, dan
 * `aria-busy` memberi tahu bahwa daerah ini sedang menunggu isi.
 */
export function SkeletonScreen({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/* Lebar baris dibuat tidak seragam supaya kerangkanya terbaca sebagai teks,
   bukan sebagai tabel. Nilainya tetap, bukan acak: nilai acak akan berubah
   setiap render dan membuat kerangka berkedip-kedip sendiri. */
const TITLE_WIDTHS = ["w-32", "w-40", "w-24", "w-36", "w-28"];
const CARD_WIDTHS = ["w-4/5", "w-3/5", "w-11/12", "w-2/3", "w-3/4"];

/* ────────────────────────────────────────────────────────────────
   Papan kanban
   ──────────────────────────────────────────────────────────────── */

/** Satu kartu di dalam kolom — cerminan CardItem. */
function CardSkeleton({ index }: { index: number }) {
  // Sebagian kartu punya label dan sebagian tidak, persis seperti papan
  // sungguhan; kerangka yang semua barisnya sama justru terlihat palsu.
  const withLabels = index % 3 === 0;

  return (
    <li className="glass board-card rounded-xl p-3">
      {withLabels && (
        <div className="mb-2 flex items-center gap-1">
          <Skeleton className="h-4 w-12 rounded-full" />
          <Skeleton className="h-4 w-9 rounded-full" />
        </div>
      )}

      <SkeletonLine className={CARD_WIDTHS[index % CARD_WIDTHS.length]} />
      {index % 2 === 0 && <SkeletonLine className="w-1/2" />}

      <div className="mt-2.5 flex items-center gap-2">
        <Skeleton className="skeleton-round size-5" />
        <Skeleton className="skeleton-round size-5" />
        <Skeleton className="ml-auto h-3 w-10 rounded-full" />
      </div>
    </li>
  );
}

/** Satu kolom — cerminan ColumnView. */
function ColumnSkeleton({ cards, index }: { cards: number; index: number }) {
  return (
    <section className="glass glass-frost glass-column flex w-72 shrink-0 flex-col">
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-2.5">
        {/* Pembungkusnya yang melar, bukan barisnya: `flex-1` di blok itu
            sendiri akan menghapus lebar yang justru membuat kerangka terbaca
            sebagai judul dengan panjang berbeda-beda. */}
        <div className="min-w-0 flex-1">
          <SkeletonLine className={TITLE_WIDTHS[index % TITLE_WIDTHS.length]} />
        </div>
        <Skeleton className="h-5 w-7 rounded-full" />
      </div>

      <ul className="flex flex-col gap-2 px-3 pb-2">
        {Array.from({ length: cards }, (_, i) => (
          <CardSkeleton key={i} index={i + index} />
        ))}
      </ul>

      <div className="px-3 pb-3">
        <Skeleton className="h-8 w-full rounded-xl" />
      </div>
    </section>
  );
}

/* Kolom pertama biasanya yang terpanjang. Jumlahnya tetap tiga: lebih dari
   itu tidak muat di layar ponsel dan cuma menambah blok yang tak terlihat. */
const BOARD_SHAPE = [3, 2, 4];

/**
 * Papan kanban lengkap dengan breadcrumb-nya.
 *
 * Dipakai dua kali: oleh BoardView selagi papannya ditarik, dan oleh App
 * selagi sesinya diperiksa — di kedua saat itu yang akan muncul adalah papan.
 */
export function BoardSkeleton() {
  return (
    <SkeletonScreen label="Memuat papan…" className="flex min-h-0 flex-1 flex-col">
      <AppHeader>
        <span className="text-faint">/</span>
        <SkeletonLine className="w-14" />
        <span className="text-faint">/</span>
        <SkeletonLine className="w-28" />
        <Skeleton className="h-5 w-24 rounded-full" />
      </AppHeader>

      <div className="flex flex-1 items-start gap-4 overflow-hidden px-5 pt-1 pb-24">
        {BOARD_SHAPE.map((cards, i) => (
          <ColumnSkeleton key={i} cards={cards} index={i} />
        ))}
      </div>
    </SkeletonScreen>
  );
}

/* ────────────────────────────────────────────────────────────────
   Halaman daftar
   ──────────────────────────────────────────────────────────────── */

/**
 * Baris daftar berbentuk pelat kaca — dipakai daftar workspace dan daftar
 * board, yang bentuknya memang sama: satu nama, satu keping di ujung.
 */
export function ListSkeleton({ rows = 3, label }: { rows?: number; label: string }) {
  return (
    <SkeletonScreen label={label} className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="glass glass-plate flex items-center gap-3 rounded-2xl px-4 py-3.5"
        >
          <div className="min-w-0 flex-1">
            <SkeletonLine className={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </SkeletonScreen>
  );
}

/** Anggota workspace: nama di atas, email di bawah, peran di ujung. */
export function MembersSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonScreen label="Memuat anggota…" className="flex flex-col gap-2">
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="glass glass-plate flex items-center gap-3 rounded-2xl px-4 py-3.5"
        >
          <div className="min-w-0 flex-1">
            <SkeletonLine className={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
            {/* Barisnya text-xs, jadi marginnya dirapatkan dari bawaan. */}
            <SkeletonLine className="my-1 w-44" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </SkeletonScreen>
  );
}

/**
 * Kerangka halaman daftar utuh — breadcrumb, judul, lalu barisnya.
 *
 * Ini yang dipakai App selagi sesinya belum pasti: halamannya sendiri belum
 * dirender, jadi kepala halamannya pun harus datang dari sini.
 */
export function ListPageSkeleton({
  crumb = false,
  rows = 3,
}: {
  crumb?: boolean;
  rows?: number;
}) {
  return (
    <>
      <AppHeader>
        {crumb && (
          <>
            <span className="text-faint">/</span>
            <SkeletonLine className="w-24" />
          </>
        )}
      </AppHeader>

      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <Skeleton className="h-7 w-40 rounded-lg" />
        <SkeletonLine className="mt-3 w-full max-w-md" />

        <div className="mt-6">
          <ListSkeleton rows={rows} label="Memuat halaman…" />
        </div>
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
   Pengaturan
   ──────────────────────────────────────────────────────────────── */

/** Satu formulir: label kecil di atas, kolom isian di bawahnya. */
export function FormSkeleton({ fields = 2, label }: { fields?: number; label: string }) {
  return (
    <SkeletonScreen label={label} className="flex flex-col gap-3">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <SkeletonLine className="my-1 w-28" />
          <Skeleton className="h-9 w-full rounded-xl" />
        </div>
      ))}

      <div className="flex justify-end">
        <Skeleton className="h-8 w-36 rounded-full" />
      </div>
    </SkeletonScreen>
  );
}

/** Baris sakelar: judul dan penjelasannya di kiri, sakelarnya di kanan. */
export function ToggleListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <SkeletonScreen label="Memuat pengaturan notifikasi…" className="flex flex-col gap-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <SkeletonLine className={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
            <SkeletonLine className="my-1 w-full max-w-xs" />
          </div>
          <Skeleton className="h-6 w-11 shrink-0 rounded-full" />
        </div>
      ))}
    </SkeletonScreen>
  );
}

/** Halaman pengaturan utuh — dipakai App sebelum sesinya pasti. */
export function SettingsPageSkeleton() {
  return (
    <>
      <AppHeader>
        <span className="text-faint">/</span>
        <SkeletonLine className="w-20" />
      </AppHeader>

      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <Skeleton className="h-7 w-40 rounded-lg" />

        {[3, 2, 3].map((fields, i) => (
          <section key={i} className="glass glass-plate mt-4 rounded-2xl p-5">
            <SkeletonLine className="w-24" />
            <SkeletonLine className="my-1 w-full max-w-sm" />
            <div className="mt-4">
              <FormSkeleton fields={fields} label="Memuat pengaturan…" />
            </div>
          </section>
        ))}
      </div>
    </>
  );
}

/* ────────────────────────────────────────────────────────────────
   Kotak masuk notifikasi
   ──────────────────────────────────────────────────────────────── */

/** Baris kabar di panel lonceng — cerminan Row di NotificationBell. */
export function InboxSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonScreen label="Memuat notifikasi…" className="flex flex-col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex gap-2.5 px-2 py-2">
          <Skeleton className="skeleton-round size-6 shrink-0" />

          <div className="min-w-0 flex-1">
            <SkeletonLine className={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
            <SkeletonLine className="my-1 w-full" />
            <SkeletonLine className="my-1 w-24" />
          </div>
        </div>
      ))}
    </SkeletonScreen>
  );
}

/* ────────────────────────────────────────────────────────────────
   Isi dialog kartu
   ──────────────────────────────────────────────────────────────── */

/**
 * Badan dialog kartu. Kepala dan kakinya sudah dirender CardModal sendiri —
 * yang belum ada hanya isinya, jadi kerangka ini menempati dua pilar yang
 * sama: label, deskripsi, dan checklist di kiri; lini masa di kanan.
 */
export function CardDetailSkeleton() {
  return (
    <SkeletonScreen label="Memuat kartu…" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex flex-col gap-5 px-5 pb-5 md:min-h-0 md:flex-1">
          <div className="flex flex-col gap-2">
            <SkeletonLine className="my-1 w-16" />
            <div className="flex gap-1.5">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <SkeletonLine className="my-1 w-20" />
            <SkeletonLine className="w-full" />
            <SkeletonLine className="w-11/12" />
            <SkeletonLine className="w-2/3" />
          </div>

          <div className="flex flex-col gap-2">
            <SkeletonLine className="my-1 w-24" />
            <Skeleton className="h-1.5 w-full rounded-full" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <Skeleton className="size-4 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <SkeletonLine className={CARD_WIDTHS[i % CARD_WIDTHS.length]} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-line-soft px-5 py-5 md:min-h-0 md:w-80 md:shrink-0 md:border-t-0 md:border-l">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-2.5">
              <Skeleton className="skeleton-round size-6 shrink-0" />
              <div className="min-w-0 flex-1">
                <SkeletonLine className={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
                <SkeletonLine className="my-1 w-full" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Kakinya ikut dipasang: tanpa itu tinggi dialog berubah begitu kartu
          datang, dan yang bergerak bukan cuma isinya melainkan seluruh
          dialognya di tengah layar. */}
      <div className="flex items-center gap-x-4 border-t border-line-soft px-5 py-3">
        <div className="avatar-stack flex items-center">
          <Skeleton className="skeleton-round size-7" />
          <Skeleton className="skeleton-round size-7" />
        </div>
        <SkeletonLine className="ml-auto w-40" />
      </div>
    </SkeletonScreen>
  );
}

/* ────────────────────────────────────────────────────────────────
   Undangan
   ──────────────────────────────────────────────────────────────── */

/** Kartu undangan yang sedang diperiksa ke server. */
export function InviteSkeleton() {
  return (
    <SkeletonScreen
      label="Memuat undangan…"
      className="flex flex-1 items-center justify-center p-6"
    >
      <div className="glass glass-frost w-full max-w-sm rounded-3xl p-7">
        <Skeleton className="mx-auto h-6 w-48 rounded-lg" />
        <SkeletonLine className="mx-auto mt-3 w-full" />
        <SkeletonLine className="mx-auto w-3/4" />
        <Skeleton className="mt-6 h-10 w-full rounded-full" />
      </div>
    </SkeletonScreen>
  );
}
