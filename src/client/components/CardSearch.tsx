import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { useCardSearch } from "../hooks/useCardSearch";
import { useSession } from "../lib/auth-client";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import { navigate, paths } from "../lib/route";
import { MIN_QUERY_LENGTH, splitByQuery } from "../../shared/search";
import type { CardSearchHit } from "../../shared/types";

/** Berapa wajah yang muat di satu baris hasil sebelum diringkas jadi "+n". */
const VISIBLE_PEOPLE = 4;

/**
 * Teks dengan potongan yang cocok ditandai.
 *
 * Penandanya `<mark>` — elemen yang memang berarti "bagian ini disorot karena
 * relevan dengan yang sedang dicari", dan yang ikut terbaca pembaca layar.
 * Warnanya diambil dari nada aksen, bukan kuning bawaan peramban.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  return (
    <>
      {splitByQuery(text, query).map((part, i) =>
        part.hit ? (
          <mark key={i} className="rounded-[0.25rem] bg-accent-soft px-0.5 text-accent-ink">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

/**
 * Satu kartu di hasil pencarian.
 *
 * Urutan barisnya mengikuti urutan orang membaca hasil: judulnya dulu, lalu
 * kalimat tempat kata itu benar-benar muncul, lalu label dan orang-orangnya,
 * dan paling bawah — paling kecil — di mana kartu itu berada.
 */
function Hit({
  hit,
  query,
  active,
  onOpen,
}: {
  hit: CardSearchHit;
  query: string;
  active: boolean;
  onOpen: () => void;
}) {
  const matchedLabels = new Set(hit.matchedLabelIds);
  const matchedPeople = new Set(hit.matchedUserIds);

  /* Yang namanya ikut dicari berdiri di depan. Di deret yang diringkas jadi
     empat wajah, orang yang justru jadi alasan kartu ini muncul tidak boleh
     yang pertama terpotong. */
  const people = [
    ...hit.participants.filter((p) => matchedPeople.has(p.id)),
    ...hit.participants.filter((p) => !matchedPeople.has(p.id)),
  ];
  const shown = people.slice(0, VISIBLE_PEOPLE);

  return (
    <button
      type="button"
      onClick={onOpen}
      data-active={active}
      className={cn(
        "flex w-full flex-col gap-1.5 rounded-xl px-2.5 py-2 text-left transition-colors",
        active ? "bg-accent-soft/70" : "hover:bg-line-soft",
      )}
    >
      <span className="line-clamp-2 text-sm leading-snug text-ink">
        <Highlight text={hit.title} query={query} />
      </span>

      {hit.snippet && (
        <span className="line-clamp-2 text-xs leading-relaxed text-muted">
          <Highlight text={hit.snippet} query={query} />
        </span>
      )}

      {(hit.labels.length > 0 || people.length > 0) && (
        <span className="flex w-full flex-wrap items-center gap-1.5">
          {hit.labels.map((label) => (
            /* Label yang namanya cocok diberi cincin tipis — itulah yang
               menjelaskan kenapa kartu ini muncul padahal judulnya tidak
               menyebut apa-apa. Cincin, bukan warna lain: rona chip sudah
               milik labelnya sendiri. */
            <span
              key={label.id}
              style={labelTint(label.color)}
              className={cn(
                "label-chip",
                matchedLabels.has(label.id) && "outline-2 outline-offset-1 outline-accent",
              )}
            >
              <span className="truncate">{label.name}</span>
            </span>
          ))}

          {people.length > 0 && (
            <span className="ml-auto flex items-center gap-1">
              {shown.map((person) => (
                <Avatar
                  key={person.id}
                  person={person}
                  size="sm"
                  className={cn(
                    matchedPeople.has(person.id) && "outline-2 outline-offset-1 outline-accent",
                  )}
                />
              ))}
              {people.length > shown.length && (
                <span className="text-[0.6875rem] font-semibold text-faint">
                  +{people.length - shown.length}
                </span>
              )}
            </span>
          )}
        </span>
      )}

      <span
        className="w-full truncate text-[0.6875rem] text-faint"
        title={`${hit.workspaceName} · ${hit.boardTitle} · ${hit.columnTitle}`}
      >
        {hit.boardTitle} · {hit.columnTitle}
      </span>
    </button>
  );
}

/**
 * Pencarian kartu di kapsul navigasi.
 *
 * Hasilnya hidup mengikuti ketikan, dan mencakup seluruh papan yang boleh
 * dibuka orang ini — bukan hanya papan yang sedang terbuka. Justru itu gunanya
 * ia berdiri di kapsul, bukan di kepala papan: yang dicari orang paling sering
 * kartu yang ia tidak ingat ada di papan mana.
 */
export function CardSearch() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const { hits, loading, error, ready, term } = useCardSearch(open ? query : "");

  // Tutup kalau ditekan di luar panel atau saat Escape — pola yang sama dengan
  // lonceng notifikasi: `pointerdown`, bukan `click`.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Daftar yang berganti selalu mulai dari baris pertama; tanpa ini penanda
  // tertinggal di baris ketiga milik pencarian sebelumnya.
  useEffect(() => setActive(0), [hits]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!session) return null;

  const openHit = (hit: CardSearchHit) => {
    setOpen(false);
    navigate(paths.card(hit.boardId, hit.id));
  };

  /* Panah dan Enter menjalankan daftarnya tanpa tangan meninggalkan papan
     ketik — pencarian yang mengharuskan pindah ke tetikus untuk memilih hasil
     memakan kembali waktu yang barusan dihematnya. */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (hits.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[active];
      if (hit) openHit(hit);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Cari kartu"
        title="Cari kartu"
        className={cn(
          "grid size-7 place-items-center rounded-full transition-colors",
          open ? "text-accent-ink" : "text-muted hover:text-ink-soft",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
      </button>

      {open && (
        /* Berlabuh ke layar, bukan ke tombolnya. Kapsulnya mengambang di
           tengah dasar layar, jadi panel selebar ini yang digantungkan pada
           tombolnya sendiri akan menjulur keluar tepi di layar sempit. */
        <div
          role="dialog"
          aria-label="Cari kartu"
          className="sheet fixed bottom-24 left-1/2 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl p-1.5"
        >
          <div className="p-1.5">
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Cari judul, deskripsi, label, atau orang…"
              aria-label="Kata kunci pencarian kartu"
              className="field"
            />
          </div>

          {/* Hasil lama bertahan selama pencarian berikutnya berjalan — daftar
              yang dikosongkan di setiap huruf berkedip lebih sering daripada
              terbaca. Yang menandai bahwa isinya sudah basi cuma redupnya. */}
          <div
            ref={listRef}
            className={cn(
              "max-h-[min(24rem,55vh)] overflow-y-auto px-1.5 pb-1.5 transition-opacity",
              loading && "opacity-60",
            )}
          >
            {!ready ? (
              <p className="px-1 py-2 text-xs text-faint">
                Ketik minimal {MIN_QUERY_LENGTH} huruf.
              </p>
            ) : error ? (
              <p className="px-1 py-2 text-xs text-danger">{error}</p>
            ) : hits.length > 0 ? (
              <div className="flex flex-col">
                {hits.map((hit, i) => (
                  <Hit
                    key={hit.id}
                    hit={hit}
                    query={term}
                    active={i === active}
                    onOpen={() => openHit(hit)}
                  />
                ))}
              </div>
            ) : (
              <p className="px-1 py-2 text-xs text-faint">
                {loading ? "Mencari…" : `Tidak ada kartu yang cocok dengan “${term}”.`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
