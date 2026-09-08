import { useEffect, useRef, useState } from "react";
import { cn } from "../lib/cn";
import { dueState, formatDateTime, formatRelative } from "../lib/format";

interface Props {
  /** ISO dari server, atau Date dari state optimistik; null berarti tanpa tenggat. */
  dueAt: Date | string | null;
  /** Kapan tenggatnya dinyatakan selesai; null berarti masih menagih. */
  dueDoneAt: Date | string | null;
  onChange: (dueAt: string | null) => void;
  onDoneChange: (done: boolean) => void;
}

/** Jam bawaan sebuah tenggat: sore, saat orang menutup pekerjaan harinya. */
const DEFAULT_HOUR = 17;

const pad = (value: number) => String(value).padStart(2, "0");

/**
 * Bentuk yang dimengerti `<input type="datetime-local">`: waktu lokal tanpa
 * zona. Sengaja dirakit tangan — `toISOString` menggeser jamnya ke UTC, dan
 * tenggat pukul tujuh malam akan muncul di kolom isian sebagai pukul dua siang.
 */
function toInput(value: Date): string {
  return (
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}` +
    `T${pad(value.getHours())}:${pad(value.getMinutes())}`
  );
}

/** Tanggal beberapa hari dari sekarang, dipatok ke jam bawaan. */
function preset(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(DEFAULT_HOUR, 0, 0, 0);
  return toInput(date);
}

/* Awalan isian saat kartunya belum bertenggat: sore ini, atau sore besok kalau
   sore ini sudah lewat. Tenggat yang sudah kedaluwarsa sejak detik ia dipasang
   bukan tawaran yang masuk akal. */
const firstGuess = () => (new Date().getHours() < DEFAULT_HOUR ? preset(0) : preset(1));

export function CardDue({ dueAt, dueDoneAt, onChange, onDoneChange }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const start = () => {
    setDraft(dueAt ? toInput(new Date(dueAt)) : firstGuess());
    setOpen(true);
  };

  const commit = () => {
    setOpen(false);
    if (!draft) return;

    /* Isian membaca waktu lokal, jadi `new Date` juga menafsirkannya begitu —
       dan yang dikirim ke server ISO beserta zonanya. Yang berpindah tangan
       selalu titik waktu, tidak pernah tulisan di jam dinding. */
    const parsed = new Date(draft);
    if (!Number.isNaN(parsed.getTime())) onChange(parsed.toISOString());
  };

  const clear = () => {
    setOpen(false);
    onChange(null);
  };

  const state = dueAt ? dueState(dueAt, dueDoneAt) : null;
  const done = state === "done";

  return (
    <div className="flex flex-col gap-2">
      <span className="section-label">Tenggat</span>

      <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : start())}
          title={dueAt ? "Ubah tenggat" : "Pasang tenggat"}
          className={cn(
            "chip transition-colors hover:text-ink",
            /* Rona hanya dipakai saat waktunya benar-benar menuntut sesuatu.
               Tenggat yang masih jauh tetap berhuruf biasa: kalau setiap
               tanggal berwarna, yang lewat tenggat berhenti menonjol.

               Hijau adalah pengecualiannya, dan sengaja: ia satu-satunya rona
               yang menjawab, bukan menuntut. Tanpa itu tenggat yang sudah
               diselesaikan tidak bisa dibedakan dari yang belum disentuh
               siapa-siapa. */
            state === "done" && "text-ok",
            state === "overdue" && "text-danger",
            state === "soon" && "text-warn",
          )}
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M8 3v3M16 3v3M4 9h16" />
            <rect x="4" y="5" width="16" height="16" rx="2.5" />
          </svg>
          {dueAt ? formatDateTime(dueAt) : "Tenggat"}
        </button>

        {/* Silangnya menempel pada chip tanggal karena ia milik tanggal itu —
            menghapusnya, bukan menyelesaikannya. Sakelar Selesai tinggal di
            sesudahnya supaya keduanya tidak pernah terbaca sebagai sepasang
            aksi atas hal yang sama. */}
        {dueAt && (
          <button
            type="button"
            aria-label="Hapus tenggat"
            onClick={clear}
            className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-line-soft hover:text-danger"
          >
            <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        )}

        {/* Selesai berdiri sebagai sakelar sendiri di sebelah tanggalnya, bukan
            di dalam popover pengatur waktu: menyelesaikan tenggat itu kabar
            harian yang diketuk sambil lalu, sedangkan popover itu tempat
            memilih tanggal — dua hal yang jarang dikerjakan bersamaan.
            Bunyinya meniru chip "Diarsipkan · <waktu>" di kepala dialog: satu
            butir yang sekaligus mengatakan keadaannya dan sejak kapan. */}
        {dueAt && (
          <button
            type="button"
            aria-pressed={done}
            onClick={() => onDoneChange(!done)}
            title={
              done && dueDoneAt
                ? `Ditandai selesai ${formatDateTime(dueDoneAt)} — klik untuk membukanya lagi`
                : "Tandai tenggat ini selesai — waktunya berhenti menagih"
            }
            className={cn(
              "chip cursor-pointer transition-colors",
              done ? "text-ok" : "hover:text-ink",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              {/* Lingkarannya utuh cuma saat sudah selesai; selagi belum, ia
                  garis putus — bentuk yang sama, tapi belum tertutup. */}
              <circle cx="12" cy="12" r="9" strokeDasharray={done ? undefined : "3 3"} />
              <path d="m8.5 12.2 2.4 2.4 4.6-4.9" />
            </svg>
            {done && dueDoneAt ? `Selesai · ${formatRelative(dueDoneAt)}` : "Tandai selesai"}
          </button>
        )}

        {state === "overdue" && (
          <span className="text-[0.6875rem] font-semibold text-danger">Lewat tenggat</span>
        )}

        {open && (
          <div
            role="dialog"
            aria-label="Atur tenggat"
            className="sheet absolute top-full left-0 z-20 mt-2 w-72 rounded-2xl p-3"
          >
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[
                ["Hari ini", 0],
                ["Besok", 1],
                ["Pekan depan", 7],
              ].map(([label, days]) => (
                /* Pintasan mengisi kolomnya, tidak langsung menyimpan: jam
                   bawaannya cuma tebakan, dan orang yang menekan "besok"
                   sering justru ingin mengubah jamnya setelah itu. */
                <button
                  key={label as string}
                  type="button"
                  onClick={() => setDraft(preset(days as number))}
                  className="chip transition-colors hover:text-ink"
                >
                  {label}
                </button>
              ))}
            </div>

            <input
              autoFocus
              type="datetime-local"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commit();
                }
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setOpen(false);
                }
              }}
              className="field"
            />

            <div className="mt-2 flex items-center gap-1.5">
              <button type="button" onClick={commit} disabled={!draft} className="btn btn-primary">
                Simpan
              </button>
              <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
                Batal
              </button>
              {dueAt && (
                <button
                  type="button"
                  onClick={clear}
                  className="btn btn-ghost ml-auto text-danger hover:bg-danger/10 hover:text-danger"
                >
                  Hapus
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
