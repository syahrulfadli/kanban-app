import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "../lib/api";
import type { MoveTargetWorkspace } from "../../shared/types";

/** Apa yang sedang dipindahkan — sekaligus isi kalimat dialognya. */
export type MoveSubject =
  | { kind: "column"; id: string; title: string; cards: number }
  | { kind: "card"; id: string; title: string };

interface Props {
  subject: MoveSubject;
  /** Papan yang sedang dibuka. Ia sendiri bukan tujuan yang masuk akal. */
  boardId: string;
  onCancel: () => void;
  /** `columnId` null berarti yang pindah adalah kolom: papan saja sudah cukup. */
  onMove: (target: { boardId: string; columnId: string | null }) => Promise<void>;
}

/**
 * Pemilih tujuan untuk kolom atau kartu yang pindah papan.
 *
 * Dua `<select>`, bukan daftar yang bisa diklik: tujuannya dipilih sekali lalu
 * dialognya tutup, dan orang yang punya belasan papan lebih cepat menemukan
 * miliknya di daftar yang mengelompokkan dirinya sendiri per workspace
 * daripada di kolom panjang yang harus digulir.
 *
 * Kartu memilih dua kali — papan, lalu kolomnya — karena kartu tidak bisa
 * berdiri di papan tanpa kolom. Kolom cukup sekali: ia mendarat di ujung
 * kanan papan tujuan.
 */
export function MoveDialog({ subject, boardId, onCancel, onMove }: Props) {
  const [spaces, setSpaces] = useState<MoveTargetWorkspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState("");
  const [columnId, setColumnId] = useState("");

  const boardField = useId();
  const columnField = useId();
  const labelId = useId();
  const firstRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    let alive = true;

    void api
      .listMoveTargets()
      .then((all) => {
        if (!alive) return;
        // Papan yang sedang dibuka dibuang di sini, bukan di server: yang
        // membuat ia bukan tujuan adalah dari mana dialog ini dipanggil.
        setSpaces(
          all
            .map((space) => ({
              ...space,
              boards: space.boards.filter((board) => board.id !== boardId),
            }))
            .filter((space) => space.boards.length > 0),
        );
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof Error ? e.message : "Gagal memuat daftar papan");
      });

    return () => {
      alive = false;
    };
  }, [boardId]);

  useEffect(() => {
    firstRef.current?.focus();
  }, [spaces]);

  const boards = useMemo(
    () => (spaces ?? []).flatMap((space) => space.boards),
    [spaces],
  );

  const chosen = boards.find((board) => board.id === target) ?? null;
  const needsColumn = subject.kind === "card";
  const ready = chosen !== null && (!needsColumn || columnId !== "");

  const submit = async () => {
    if (!chosen || busy) return;

    setBusy(true);
    setError(null);
    try {
      await onMove({ boardId: chosen.id, columnId: needsColumn ? columnId : null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Perpindahan gagal");
      setBusy(false);
    }
  };

  const empty = spaces !== null && spaces.length === 0;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center overflow-hidden p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onCancel();
      }}
    >
      {/* Saudara, bukan induk — lihat catatan .glass-frost. */}
      <div className="scrim" onClick={onCancel} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="glass glass-lens card-dialog relative w-full max-w-sm p-5 outline-none"
      >
        <h2 id={labelId} className="text-base font-semibold tracking-tight">
          {subject.kind === "column" ? "Pindahkan kolom" : "Pindahkan kartu"}
        </h2>

        <p className="mt-2 text-sm leading-relaxed text-muted">
          {subject.kind === "column" ? (
            <>
              “{subject.title}”
              {subject.cards > 0 && <> beserta {subject.cards} kartu di dalamnya</>} pindah ke
              ujung papan tujuan.
            </>
          ) : (
            <>“{subject.title}” pindah ke dasar kolom yang Anda pilih.</>
          )}{" "}
          {/* Yang paling mungkin mengejutkan disebut lebih dulu daripada
              ditemukan sendiri: label milik papan, jadi ia harus ikut
              berpindah — lihat catatan di worker/transfer.ts. */}
          Labelnya ikut, dan yang belum ada di papan tujuan dibuatkan di sana.
        </p>

        {empty ? (
          <p className="mt-4 rounded-lg bg-line-soft px-3 py-2 text-sm text-muted">
            Belum ada papan lain yang bisa jadi tujuan.
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor={boardField} className="section-label">
                Papan tujuan
              </label>

              <select
                ref={firstRef}
                id={boardField}
                className="field"
                disabled={spaces === null || busy}
                value={target}
                onChange={(e) => {
                  setTarget(e.target.value);
                  /* Kolom yang tadi dipilih milik papan yang tadi — ia harus
                     ikut lepas, kalau tidak tombolnya menyala untuk pasangan
                     yang tidak pernah ada. */
                  setColumnId("");
                }}
              >
                <option value="">{spaces === null ? "Memuat papan…" : "Pilih papan…"}</option>

                {(spaces ?? []).map((space) => (
                  <optgroup key={space.id} label={space.name}>
                    {space.boards.map((board) => (
                      <option
                        key={board.id}
                        value={board.id}
                        // Kartu butuh kolom untuk berdiri; papan kosong tetap
                        // ditampilkan supaya tidak terbaca sebagai papan yang
                        // hilang, tapi tidak bisa dipilih.
                        disabled={needsColumn && board.columns.length === 0}
                      >
                        {board.title}
                        {needsColumn && board.columns.length === 0 && " — belum ada kolom"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            {needsColumn && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={columnField} className="section-label">
                  Kolom tujuan
                </label>

                <select
                  id={columnField}
                  className="field"
                  disabled={!chosen || busy}
                  value={columnId}
                  onChange={(e) => setColumnId(e.target.value)}
                >
                  <option value="">{chosen ? "Pilih kolom…" : "Pilih papan dulu…"}</option>
                  {chosen?.columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.title}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">{error}</p>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn btn-glass">
            {empty ? "Tutup" : "Batal"}
          </button>

          {!empty && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!ready || busy}
              className="btn btn-primary"
            >
              {busy ? "Memindahkan…" : "Pindahkan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
