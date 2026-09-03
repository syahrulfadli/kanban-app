import { navigate, paths } from "../lib/route";

/* Halaman pengantar untuk orang yang belum masuk.

   Isinya menjawab dua pertanyaan, berurutan: apa itu kanban, lalu apa yang
   dikerjakan aplikasi ini. Bukan etalase fitur — orang yang baru mendengar
   kata "kanban" tidak bisa menilai daftar fitur sebelum tahu papan itu
   sendiri untuk apa.

   Semua permukaannya kaca yang sudah ada di sistem: pane terluar ber-frost,
   isinya memakai .glass-plate. Tidak ada material baru yang diperkenalkan
   hanya untuk satu halaman. */

/** Ikon garis, seragam dengan yang dipakai kapsul navigasi. */
function Icon({ path }: { path: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );
}

const ICONS = {
  realtime: (
    <>
      <path d="M12 3a9 9 0 1 0 9 9" />
      <path d="M12 7a5 5 0 1 0 5 5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 9h6M7 13h10M7 17h4" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 4-1.5 5.5-2 6h16c-.5-.5-2-2-2-6" />
      <path d="M10.5 18a1.8 1.8 0 0 0 3 0" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3.2 3.2 0 0 1 0 6M17.5 14.2A5.5 5.5 0 0 1 20.5 19" />
    </>
  ),
  install: (
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 7v7M9 11.5l3 3 3-3" />
    </>
  ),
  free: (
    <>
      <path d="M4 8.5A4.5 4.5 0 0 1 12 6a4.5 4.5 0 0 1 8 2.5" />
      <rect x="3" y="8.5" width="18" height="11" rx="2.5" />
      <path d="M12 6v13.5" />
    </>
  ),
} as const;

/** Satu petak fitur: ikon, judul, satu kalimat. */
function Feature({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-plate flex gap-3 rounded-2xl p-4">
      <span className="text-accent">
        <Icon path={icon} />
      </span>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </div>
  );
}

/** Langkah bernomor pada bagian "cara kerjanya". */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3.5">
      <span className="glass-plate flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-accent-ink">
        {n}
      </span>
      <div className="min-w-0 pt-0.5">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">{children}</p>
      </div>
    </li>
  );
}

/* Papan mini. Bukan tangkapan layar: kolom dan kartunya dibangun dari
   permukaan yang sama dengan papan sungguhan, jadi ia ikut berubah bersama
   tema dan tidak pernah basi. Sepenuhnya hiasan — pembaca layar melewatinya,
   karena kalimat di sebelahnya sudah mengatakan hal yang sama. */
const PREVIEW: { title: string; cards: { text: string; tint: string; done?: boolean }[] }[] = [
  {
    title: "Rencana",
    cards: [
      { text: "Susun materi rapat", tint: "var(--label-sky)" },
      { text: "Kumpulkan umpan balik", tint: "var(--label-violet)" },
    ],
  },
  {
    title: "Dikerjakan",
    cards: [{ text: "Rapikan halaman depan", tint: "var(--label-amber)" }],
  },
  {
    title: "Selesai",
    cards: [{ text: "Rilis versi 1.0", tint: "var(--label-green)", done: true }],
  },
];

function BoardPreview() {
  return (
    <div className="mt-7 grid grid-cols-3 gap-2.5" aria-hidden>
      {PREVIEW.map((column) => (
        <div key={column.title} className="glass-plate flex flex-col gap-2 rounded-2xl p-2.5">
          <p className="px-0.5 text-[0.6875rem] font-semibold tracking-wide text-faint uppercase">
            {column.title}
          </p>

          {column.cards.map((card) => (
            <div
              key={card.text}
              className="rounded-xl bg-[var(--card-fill)] p-2 shadow-[0_1px_2px_rgb(15_23_42_/_0.06)]"
            >
              <span
                className="block h-1 w-7 rounded-full"
                style={{ backgroundColor: card.tint }}
              />
              <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-soft">{card.text}</p>
              {card.done && (
                <span className="mt-1.5 block h-1 w-full rounded-full bg-[var(--label-green)]" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function LandingPage() {
  const daftar = () => navigate(paths.daftar);
  const masuk = () => navigate(paths.masuk);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      {/* ── Pembuka ── */}
      <section className="glass glass-frost rounded-3xl p-7 sm:p-10">
        <p className="section-label">Papan kanban kolaboratif</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          Lihat pekerjaan Anda bergerak.
        </h1>

        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
          Tulis tiap pekerjaan sebagai satu kartu, letakkan di kolom yang sesuai, lalu geser
          saat kartunya maju. Semua orang di papan melihat perubahan yang sama, saat itu juga.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={daftar} className="btn btn-primary px-5 py-2.5">
            Mulai sekarang
          </button>
          <button type="button" onClick={masuk} className="btn btn-glass px-5 py-2.5">
            Sudah punya akun
          </button>
        </div>

        <BoardPreview />
      </section>

      {/* ── Apa itu kanban ── */}
      <section className="glass glass-frost rounded-3xl p-7 sm:p-9">
        <h2 className="text-xl font-semibold tracking-tight">Apa itu kanban?</h2>

        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
          <span className="text-ink-soft">Kanban</span> — “papan penanda” dalam bahasa Jepang —
          berasal dari lini produksi Toyota: sebuah kartu ikut berjalan bersama pekerjaan, supaya siapa pun bisa
          melihat apa yang sedang dikerjakan tanpa perlu bertanya. Prinsipnya tidak berubah saat
          papannya pindah ke layar.
        </p>

        <ul className="mt-6 flex flex-col gap-3">
          <Step n={1} title="Pekerjaan dibuat terlihat">
            Satu kartu untuk satu pekerjaan, semuanya di satu papan. Yang tidak tertulis di papan
            tidak sedang dikerjakan.
          </Step>
          <Step n={2} title="Kolom adalah tahapnya">
            Beri nama kolom sesuai alur kerja Anda — rencana, dikerjakan, selesai — lalu biarkan
            kartunya bergerak dari kiri ke kanan.
          </Step>
          <Step n={3} title="Batasi yang berjalan">
            Kolom “dikerjakan” yang menumpuk adalah tanda untuk menyelesaikan, bukan untuk
            menambah. Menyelesaikan lebih berguna daripada memulai.
          </Step>
        </ul>
      </section>

      {/* ── Fungsi aplikasi ── */}
      <section className="glass glass-frost rounded-3xl p-7 sm:p-9">
        <h2 className="text-xl font-semibold tracking-tight">Yang dikerjakan aplikasi ini</h2>

        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
          Papan kanban untuk tim kecil: satu tempat bersama untuk pekerjaan, dengan kabar yang
          menyusul ke perangkat Anda saat ada yang berubah.
        </p>

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          <Feature icon={ICONS.realtime} title="Berubah di semua layar">
            Kartu yang digeser seseorang langsung pindah di layar rekan-rekannya. Tidak ada
            tombol segarkan.
          </Feature>
          <Feature icon={ICONS.card} title="Kartu yang cukup dalam">
            Label berwarna, checklist dengan progres, thread followup, dan jejak siapa membuat
            serta mengubahnya.
          </Feature>
          <Feature icon={ICONS.bell} title="Kabar yang menyusul">
            Peserta sebuah kartu dikabari lewat notifikasi meski aplikasinya tertutup. Kabar yang
            sama menumpuk di kotak masuk di dalam aplikasi.
          </Feature>
          <Feature icon={ICONS.people} title="Workspace dan anggota">
            Kelompokkan papan per workspace, undang rekan lewat tautan, dan atur siapa boleh
            mengubah apa.
          </Feature>
          <Feature icon={ICONS.install} title="Bisa dipasang">
            Pasang sebagai aplikasi di ponsel atau komputer, lengkap dengan ikon sendiri dan
            tema terang/gelap.
          </Feature>
          <Feature icon={ICONS.free} title="Gratis, sungguhan">
            Berjalan penuh di free tier Cloudflare — tidak ada server yang perlu dibayari, tidak
            ada masa coba yang habis.
          </Feature>
        </div>
      </section>

      {/* ── Penutup ── */}
      <section className="glass glass-frost flex flex-col items-start gap-4 rounded-3xl p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Buat papan pertama Anda</h2>
          <p className="mt-1 text-sm text-muted">
            Cukup email dan kata sandi — papan kosong siap dalam satu menit.
          </p>
        </div>

        <button type="button" onClick={daftar} className="btn btn-primary shrink-0 px-5 py-2.5">
          Mulai sekarang
        </button>
      </section>
    </div>
  );
}
