import { useEffect, useRef, useState } from "react";
import { labelTint } from "../lib/people";
import { LABEL_COLORS, type Label, type LabelColor } from "../../shared/types";

interface Props {
  /** Palet board — label apa saja yang tersedia untuk dipasang di sini. */
  boardLabels: Label[];
  cardLabels: Label[];
  onToggle: (label: Label, attach: boolean) => void;
  onCreate: (name: string, color: LabelColor) => void;
  onRename: (id: string, patch: { name?: string; color?: LabelColor }) => void;
  onDelete: (id: string) => void;
}

/** Deretan pilihan warna. Titik, bukan kotak: warnanya yang dipilih, bukan bentuknya. */
function ColorSwatches({
  value,
  onChange,
}: {
  value: LabelColor;
  onChange: (color: LabelColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {LABEL_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Warna ${color}`}
          aria-pressed={color === value}
          onClick={() => onChange(color)}
          style={labelTint(color)}
          className="grid size-6 place-items-center rounded-full transition-transform hover:scale-110"
        >
          <span className="label-dot size-4" data-selected={color === value} />
        </button>
      ))}
    </div>
  );
}

export function CardLabels({
  boardLabels,
  cardLabels,
  onToggle,
  onCreate,
  onRename,
  onDelete,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftColor, setDraftColor] = useState<LabelColor>("sky");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<LabelColor>("sky");
  const ref = useRef<HTMLDivElement>(null);

  const attached = new Set(cardLabels.map((l) => l.id));

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

  const startEdit = (label: Label) => {
    setEditing(label.id);
    setDraftName(label.name);
    setDraftColor(label.color);
  };

  const commitEdit = () => {
    const name = draftName.trim();
    if (editing && name) onRename(editing, { name, color: draftColor });
    setEditing(null);
  };

  const commitCreate = () => {
    const name = newName.trim();
    if (!name) return;
    onCreate(name, newColor);
    setNewName("");
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="section-label">Label</span>

      <div ref={ref} className="relative flex flex-wrap items-center gap-1.5">
        {cardLabels.map((label) => (
          <span key={label.id} className="label-chip" style={labelTint(label.color)}>
            <span className="truncate">{label.name}</span>
            <button
              type="button"
              aria-label={`Lepas label ${label.name}`}
              onClick={() => onToggle(label, false)}
              className="-mr-1 grid size-4 shrink-0 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100"
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
          Label
        </button>

        {open && (
          <div
            role="dialog"
            aria-label="Pilih label"
            className="sheet absolute top-full left-0 z-20 mt-2 w-72 rounded-2xl p-2"
          >
            <div className="flex max-h-56 flex-col gap-0.5 overflow-y-auto">
              {boardLabels.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-faint">
                  Board ini belum punya label.
                </p>
              )}

              {boardLabels.map((label) =>
                editing === label.id ? (
                  <div key={label.id} className="flex flex-col gap-2 rounded-xl bg-line-soft p-2">
                    <input
                      autoFocus
                      value={draftName}
                      onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEdit();
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditing(null);
                        }
                      }}
                      className="field"
                    />
                    <ColorSwatches value={draftColor} onChange={setDraftColor} />
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={commitEdit} className="btn btn-primary">
                        Simpan
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(null)}
                        className="btn btn-ghost"
                      >
                        Batal
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(null);
                          onDelete(label.id);
                        }}
                        className="btn btn-ghost ml-auto text-danger hover:bg-danger/10 hover:text-danger"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={label.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={attached.has(label.id)}
                      onClick={() => onToggle(label, !attached.has(label.id))}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-line-soft"
                    >
                      <span
                        className="label-dot size-3 shrink-0"
                        style={labelTint(label.color)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{label.name}</span>
                      {attached.has(label.id) && (
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

                    <button
                      type="button"
                      aria-label={`Ubah label ${label.name}`}
                      onClick={() => startEdit(label)}
                      className="grid size-7 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-line-soft hover:text-ink"
                    >
                      <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                      </svg>
                    </button>
                  </div>
                ),
              )}
            </div>

            <span className="my-1.5 block h-px bg-line-soft" />

            <div className="flex flex-col gap-2 p-1">
              <input
                value={newName}
                placeholder="Nama label baru…"
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitCreate();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setOpen(false);
                  }
                }}
                className="field"
              />
              <ColorSwatches value={newColor} onChange={setNewColor} />
              <button
                type="button"
                onClick={commitCreate}
                disabled={!newName.trim()}
                className="btn btn-primary disabled:opacity-50"
              >
                Buat label
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
