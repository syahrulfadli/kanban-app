import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { api } from "../lib/api";
import type { MemberSummary, UserBrief } from "../../shared/types";

interface Props {
  /** Orang yang sudah diundang ke kartu ini, urut waktu diundang. */
  members: UserBrief[];
  /**
   * Workspace pemilik papan — dari sinilah daftar orang yang boleh diundang
   * ditarik. Yang bisa diundang cuma anggotanya: undangan kartu bukan pintu
   * masuk ke papan, ia cuma menunjuk siapa yang mengurus kartu ini.
   */
  workspaceId: string;
  onAdd: (person: UserBrief) => void;
  onRemove: (person: UserBrief) => void;
}

/** Ambang munculnya kolom cari — di bawah ini, matanya lebih cepat dari jarinya. */
const SEARCH_FROM = 7;

export function CardPeople({ members, workspaceId, onAdd, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<MemberSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const invited = new Set(members.map((m) => m.id));

  /* Daftar anggota ditarik saat pemilihnya dibuka, bukan saat kartunya —
     kebanyakan kartu dibuka untuk dibaca, dan daftar ini tidak akan pernah
     ditanyakan. Sekali tertarik ia menetap: pemilih yang sama dibuka-tutup
     beberapa kali dalam satu kartu. */
  useEffect(() => {
    if (!open || people) return;

    let alive = true;
    void (async () => {
      try {
        const rows = await api.listMembers(workspaceId);
        if (alive) setPeople(rows);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Gagal memuat anggota");
      }
    })();

    return () => {
      alive = false;
    };
  }, [open, people, workspaceId]);

  // Tutup saat ditekan di luar. `pointerdown`, bukan `click`, supaya pemilih
  // sudah menutup sebelum klik mendarat di bawahnya.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const needle = query.trim().toLowerCase();
  const shown = (people ?? []).filter(
    (person) =>
      !needle ||
      person.name.toLowerCase().includes(needle) ||
      person.email.toLowerCase().includes(needle),
  );

  const toggle = (person: MemberSummary) => {
    const brief: UserBrief = {
      id: person.userId,
      name: person.name,
      email: person.email,
      image: person.image,
    };

    if (invited.has(brief.id)) onRemove(brief);
    else onAdd(brief);
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="section-label">Orang</span>

      <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
        {members.map((person) => (
          /* Wajah, nama, dan satu silang — bukan sekadar avatar berderet:
             deret avatar cukup untuk "siapa yang di sini", tapi di sinilah
             undangan dicabut, dan sasaran silang yang menempel di keping
             selebar 20 piksel terlalu sempit untuk itu. */
          <span
            key={person.id}
            className="chip gap-1.5 py-0.5 pr-1 pl-1"
            title={`${person.name} · ${person.email}`}
          >
            <Avatar person={person} size="sm" title={person.name} />
            <span className="max-w-32 truncate">{person.name}</span>
            <button
              type="button"
              aria-label={`Keluarkan ${person.name} dari kartu`}
              onClick={() => onRemove(person)}
              className="grid size-4 shrink-0 place-items-center rounded-full text-faint transition-colors hover:text-danger"
            >
              <svg viewBox="0 0 24 24" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                <path d="M6 6 18 18M18 6 6 18" />
              </svg>
            </button>
          </span>
        ))}

        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="chip transition-colors hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          Orang
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Undang orang ke kartu"
            className="sheet absolute top-full left-0 z-20 mt-2 w-72 rounded-2xl p-2"
          >
            {(people?.length ?? 0) >= SEARCH_FROM && (
              <input
                autoFocus
                value={query}
                placeholder="Cari nama…"
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
                className="field mb-1.5"
              />
            )}

            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {error && <p className="px-2 py-3 text-center text-xs text-danger">{error}</p>}

              {!people && !error && (
                <p className="px-2 py-3 text-center text-xs text-faint">Memuat anggota…</p>
              )}

              {people && shown.length === 0 && !error && (
                <p className="px-2 py-3 text-center text-xs text-faint">
                  {needle ? "Tidak ada yang cocok." : "Workspace ini belum punya anggota lain."}
                </p>
              )}

              {shown.map((person) => (
                <button
                  key={person.userId}
                  type="button"
                  role="switch"
                  aria-checked={invited.has(person.userId)}
                  onClick={() => toggle(person)}
                  className="flex min-w-0 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-line-soft"
                >
                  <Avatar
                    person={{
                      id: person.userId,
                      name: person.name,
                      email: person.email,
                      image: person.image,
                    }}
                    title={person.name}
                  />

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{person.name}</span>
                    <span className="block truncate text-[0.6875rem] text-faint">
                      {person.email}
                    </span>
                  </span>

                  {invited.has(person.userId) && (
                    <svg
                      viewBox="0 0 24 24"
                      className="size-3.5 shrink-0 text-accent"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="m5 13 4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
