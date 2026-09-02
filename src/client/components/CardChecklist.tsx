import { useState } from "react";
import { cn } from "../lib/cn";
import type { ChecklistItem } from "../../shared/types";

interface Props {
  items: ChecklistItem[];
  onToggle: (item: ChecklistItem, done: boolean) => void;
  onRename: (item: ChecklistItem, text: string) => void;
  onDelete: (item: ChecklistItem) => void;
  onAdd: (text: string) => void;
}

/** Kotak centang dengan dua baris — bentuk yang sudah dikenal sebagai checklist. */
function ChecklistIcon() {
  return (
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
      <path d="m3 6 2 2 3.5-3.5M3 16l2 2 3.5-3.5M13 7h8M13 17h8" />
    </svg>
  );
}

export function CardChecklist({ items, onToggle, onRename, onDelete, onAdd }: Props) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  /* Kolom isian disembunyikan sampai diminta: sebagian besar waktu orang
     membuka kartu untuk membaca daftarnya, bukan untuk menambahinya. */
  const [adding, setAdding] = useState(false);

  const done = items.filter((item) => item.done).length;
  const percent = items.length ? Math.round((done / items.length) * 100) : 0;
  const complete = items.length > 0 && done === items.length;

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    onAdd(text);
    setDraft("");
  };

  const closeAdd = () => {
    setDraft("");
    setAdding(false);
  };

  const commitRename = (item: ChecklistItem, value: string) => {
    const text = value.trim();
    setEditing(null);
    if (text && text !== item.text) onRename(item, text);
  };

  return (
    <section className="flex flex-col gap-2.5">
      <div className="section-label">
        <span>Checklist</span>
        {items.length > 0 && (
          <span
            className={cn("tabular-nums normal-case", complete ? "text-ok" : "text-muted")}
          >
            {done}/{items.length} · {percent}%
          </span>
        )}
      </div>

      {items.length > 0 && (
        <div
          className="progress"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progress checklist"
        >
          <div className="progress-bar" data-complete={complete} style={{ width: `${percent}%` }} />
        </div>
      )}

      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.id} className="group flex items-start gap-2.5 rounded-lg py-1.5">
            <input
              type="checkbox"
              checked={item.done}
              onChange={(e) => onToggle(item, e.target.checked)}
              aria-label={item.text}
              className="checkbox mt-0.5"
            />

            {editing === item.id ? (
              <input
                autoFocus
                defaultValue={item.text}
                onBlur={(e) => commitRename(item, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(item, e.currentTarget.value);
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
                className="field flex-1 py-1"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditing(item.id)}
                /* Yang sudah dicentang dicoret dan diredupkan: daftar tetap
                   utuh sebagai catatan, tapi mata langsung jatuh ke sisanya. */
                className={cn(
                  "flex-1 text-left text-sm leading-snug wrap-break-word transition-colors",
                  item.done ? "text-faint line-through" : "text-ink-soft",
                )}
              >
                {item.text}
              </button>
            )}

            <button
              type="button"
              aria-label={`Hapus butir ${item.text}`}
              onClick={() => onDelete(item)}
              className="grid size-6 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-[opacity,color] group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100"
            >
              <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
                <path d="M6 6 18 18M18 6 6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex items-center gap-2"
        >
          <input
            autoFocus
            value={draft}
            placeholder="Tulis butir baru…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                closeAdd();
              }
            }}
            className="field flex-1"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="btn btn-primary disabled:opacity-50"
          >
            Tambah
          </button>
          <button type="button" onClick={closeAdd} className="btn btn-ghost">
            Batal
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="btn btn-glass self-start px-3 py-1.5 text-muted hover:text-ink"
        >
          <ChecklistIcon />
          Tambah check list
        </button>
      )}
    </section>
  );
}
