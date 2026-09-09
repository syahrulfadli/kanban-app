import { AvatarStack } from "./Avatar";
import { useT } from "../hooks/useLanguage";
import type { Translations } from "../i18n/id";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import { navigate, paths } from "../lib/route";
import type { LabelColor, UserBrief } from "../../shared/types";

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

/* Papan mini di kepala halaman.

   Bukan tangkapan layar dan bukan tiruan yang digambar ulang: kolom, kartu,
   chip label, batang progres, dan avatarnya memakai kelas dan komponen yang
   sama persis dengan papan sungguhan — termasuk label yang di muka kartu
   memang terlipat jadi sepotong warna. Jadi ilustrasinya ikut berubah bersama
   tema, dan tidak bisa diam-diam basi terhadap aplikasi yang ia gambarkan.

   Satu hal yang sengaja berbeda: kolomnya memakai .glass-plate, bukan pane
   ber-frost seperti kolom sungguhan. Pane hero di belakangnya sudah ber-frost,
   dan kaca di dalam kaca tidak menghasilkan apa-apa — lihat catatan
   .glass-frost.

   Sepenuhnya hiasan: pembaca layar melewatinya, karena kalimat di sebelahnya
   sudah mengatakan hal yang sama. */

/** Orang contoh. Namanya saja yang terpakai — inisial dan ronanya lahir dari situ. */
const person = (name: string): UserBrief => ({
  id: name,
  name,
  email: `${name.toLowerCase()}@contoh.id`,
  image: null,
});

interface PreviewCard {
  text: string;
  labels: { name: string; color: LabelColor }[];
  people?: UserBrief[];
  checklist?: { done: number; total: number };
  comments?: number;
}

/* Data papan contoh datang dari kamus bahasa aktif — supaya ilustrasinya ikut
   berganti bahasa bersama sisa halaman, bukan cuma teks di sekelilingnya. */
function buildPreview(t: Translations): { title: string; cards: PreviewCard[] }[] {
  const { previewColumns: col, previewCards: card, previewLabels: label } = t.landing;

  return [
    {
      title: col.plan,
      cards: [
        {
          text: card.meetingNotes,
          labels: [{ name: label.research, color: "sky" }],
          people: [person("Rina")],
        },
        {
          text: card.gatherFeedback,
          labels: [
            { name: label.research, color: "violet" },
            { name: label.later, color: "slate" },
          ],
          comments: 3,
        },
      ],
    },
    {
      title: col.doing,
      cards: [
        {
          text: card.homepage,
          labels: [{ name: label.design, color: "amber" }],
          people: [person("Adi"), person("Sari")],
          checklist: { done: 2, total: 5 },
        },
      ],
    },
    {
      title: col.done,
      cards: [
        {
          text: card.release,
          labels: [{ name: label.release, color: "green" }],
          checklist: { done: 4, total: 4 },
        },
      ],
    },
  ];
}

function PreviewCard({ card }: { card: PreviewCard }) {
  const { checklist } = card;
  const percent = checklist ? Math.round((checklist.done / checklist.total) * 100) : 0;
  const complete = checklist ? checklist.done === checklist.total : false;
  const footer = card.people || checklist || card.comments;

  return (
    <div className="glass board-card rounded-xl p-2">
      {/* `data-open="false"`: keadaan istirahat kartu di papan sungguhan —
          nama labelnya terlipat dan yang tersisa potongan warnanya. */}
      <div className="label-row flex flex-wrap items-center gap-1" data-open="false">
        {card.labels.map((label) => (
          <span key={label.name} className="label-chip" style={labelTint(label.color)}>
            <span className="label-text truncate">{label.name}</span>
          </span>
        ))}
      </div>

      <p className="mt-1.5 text-[0.6875rem] leading-snug text-ink-soft">{card.text}</p>

      {footer && (
        <div className="mt-2 flex items-center gap-2">
          {card.people && <AvatarStack people={card.people} />}

          {/* Di kolom selebar sepertiga layar ponsel, angka-angka ini tidak
              lagi punya ruang — dan yang harus terbaca lebih dulu di sana
              bentuk kartunya, bukan isi baris kakinya. */}
          <span className="ml-auto hidden items-center gap-2 text-faint sm:flex">
            {checklist && (
              <span className="flex items-center gap-1.5">
                <span className="progress card-progress">
                  <span
                    className="progress-bar"
                    data-complete={complete}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[0.6875rem] font-semibold tabular-nums",
                    complete ? "text-ok" : "text-faint",
                  )}
                >
                  {checklist.done}/{checklist.total}
                </span>
              </span>
            )}

            {!!card.comments && (
              <span className="flex items-center gap-1 text-[0.6875rem] font-semibold tabular-nums">
                <svg
                  viewBox="0 0 24 24"
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
                </svg>
                {card.comments}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function BoardPreview({ columns }: { columns: { title: string; cards: PreviewCard[] }[] }) {
  return (
    <div className="mt-7 grid grid-cols-3 items-start gap-2.5" aria-hidden>
      {columns.map((column) => (
        <div key={column.title} className="glass-plate flex flex-col gap-2 rounded-2xl p-2">
          {/* Kepala kolom yang sama dengan di papan: nama di kiri, jumlah
              kartunya sebagai chip di kanan. */}
          <div className="flex items-center gap-1.5 px-1 pt-0.5">
            <p className="min-w-0 flex-1 truncate text-xs font-semibold tracking-tight">
              {column.title}
            </p>
            <span className="chip hidden shrink-0 tabular-nums sm:inline-flex">
              {column.cards.length}
            </span>
          </div>

          {column.cards.map((card) => (
            <PreviewCard key={card.text} card={card} />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * `signedIn` hanya mengubah ajakannya, bukan isinya: penjelasan kanban tetap
 * penjelasan kanban bagi siapa pun yang membukanya. Yang sudah punya akun
 * tidak ditawari mendaftar — ia ditawari jalan kembali ke papannya.
 */
export function LandingPage({ signedIn = false }: { signedIn?: boolean }) {
  const t = useT();
  const l = t.landing;
  const daftar = () => navigate(paths.daftar);
  const masuk = () => navigate(paths.masuk);
  const buka = () => navigate(paths.workspaces);
  const preview = buildPreview(t);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 sm:p-6">
      {/* ── Pembuka ── */}
      <section className="glass glass-frost rounded-3xl p-7 sm:p-10">
        <p className="section-label">{l.kicker}</p>

        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
          {l.heroTitle}
        </h1>

        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">{l.heroBody}</p>

        <div className="mt-6 flex flex-wrap items-center gap-2.5">
          {signedIn ? (
            <button type="button" onClick={buka} className="btn btn-primary px-5 py-2.5">
              {l.openMyWorkspace}
            </button>
          ) : (
            <>
              <button type="button" onClick={daftar} className="btn btn-primary px-5 py-2.5">
                {l.getStarted}
              </button>
              <button type="button" onClick={masuk} className="btn btn-glass px-5 py-2.5">
                {l.alreadyHaveAccount}
              </button>
            </>
          )}
        </div>

        <BoardPreview columns={preview} />
      </section>

      {/* ── Apa itu kanban ── */}
      <section className="glass glass-frost rounded-3xl p-7 sm:p-9">
        <h2 className="text-xl font-semibold tracking-tight">{l.whatIsKanbanTitle}</h2>

        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
          <span className="text-ink-soft">Kanban</span> {l.whatIsKanbanBody}
        </p>

        <ul className="mt-6 flex flex-col gap-3">
          <Step n={1} title={l.step1Title}>
            {l.step1Body}
          </Step>
          <Step n={2} title={l.step2Title}>
            {l.step2Body}
          </Step>
          <Step n={3} title={l.step3Title}>
            {l.step3Body}
          </Step>
        </ul>
      </section>

      {/* ── Fungsi aplikasi ── */}
      <section className="glass glass-frost rounded-3xl p-7 sm:p-9">
        <h2 className="text-xl font-semibold tracking-tight">{l.whatThisAppDoesTitle}</h2>

        <p className="mt-3 max-w-xl text-[0.9375rem] leading-relaxed text-muted">
          {l.whatThisAppDoesBody}
        </p>

        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          <Feature icon={ICONS.realtime} title={l.featureRealtimeTitle}>
            {l.featureRealtimeBody}
          </Feature>
          <Feature icon={ICONS.card} title={l.featureCardTitle}>
            {l.featureCardBody}
          </Feature>
          <Feature icon={ICONS.bell} title={l.featureBellTitle}>
            {l.featureBellBody}
          </Feature>
          <Feature icon={ICONS.people} title={l.featurePeopleTitle}>
            {l.featurePeopleBody}
          </Feature>
          <Feature icon={ICONS.install} title={l.featureInstallTitle}>
            {l.featureInstallBody}
          </Feature>
          <Feature icon={ICONS.free} title={l.featureFreeTitle}>
            {l.featureFreeBody}
          </Feature>
        </div>
      </section>

      {/* ── Penutup ── */}
      <section className="glass glass-frost flex flex-col items-start gap-4 rounded-3xl p-7 sm:flex-row sm:items-center sm:justify-between sm:p-9">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">
            {signedIn ? l.closingSignedInTitle : l.closingSignedOutTitle}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {signedIn ? l.closingSignedInBody : l.closingSignedOutBody}
          </p>
        </div>

        <button
          type="button"
          onClick={signedIn ? buka : daftar}
          className="btn btn-primary shrink-0 px-5 py-2.5"
        >
          {signedIn ? l.openWorkspace : l.getStarted}
        </button>
      </section>
    </div>
  );
}
