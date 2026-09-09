import { useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { useDismiss } from "../hooks/useDismiss";
import { useT } from "../hooks/useLanguage";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import {
  emptyBoardFilter,
  isBoardFilterActive,
  type BoardFilterState,
  type DueFilter,
} from "../lib/boardFilter";
import type { Label, UserBrief } from "../../shared/types";

/** Corong — bentuk yang sudah biasa dibaca sebagai "saring". */
function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h16l-6 7.5V19l-4 2v-8.5L4 5Z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

/** Judul satu bagian di panel — ukuran dan bobotnya menyamai "Latar papan"/"Gambar" di `BoardBackgroundPicker`. */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold tracking-tight">{children}</p>;
}

interface Props {
  labels: Label[];
  people: UserBrief[];
  /** Siapa saja yang pernah membuat kartu di board ini — dipakai untuk kategori "Dibuat oleh". */
  creators: UserBrief[];
  filter: BoardFilterState;
  onChange: (filter: BoardFilterState) => void;
}

/**
 * Tombol filter di kepala papan, sejajar penanda latar dan penanda hadir.
 *
 * Isinya checklist, bukan modal terpisah — mengikuti pola `LiveIndicator` dan
 * `BoardBackgroundPicker`: tombol chip, panel `.sheet` yang mengambang di
 * bawahnya, tanpa portal karena kepala papan sendiri bukan pane ber-frost.
 * Ukuran tekstualnya sengaja menyamai panel `BoardBackgroundPicker` (judul
 * `text-xs font-semibold`, baris isi `text-[11px]`) — dua panel yang sama-sama
 * hidup di kepala papan seharusnya terbaca sebagai satu keluarga, bukan dua
 * skala huruf yang kebetulan bertetangga.
 */
export function BoardFilter({ labels, people, creators, filter, onChange }: Props) {
  const t = useT();
  const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
    { value: "overdue", label: t.boardFilter.dueOverdue },
    { value: "week", label: t.boardFilter.dueWeek },
    { value: "none", label: t.boardFilter.dueNone },
  ];
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useDismiss(open, () => setOpen(false), [ref, panelRef]);

  const active = isBoardFilterActive(filter);
  const count =
    filter.labelIds.size + filter.memberIds.size + filter.createdByIds.size + filter.due.size;

  const toggleLabel = (id: string) => {
    const labelIds = new Set(filter.labelIds);
    if (labelIds.has(id)) labelIds.delete(id);
    else labelIds.add(id);
    onChange({ ...filter, labelIds });
  };

  const toggleMember = (id: string) => {
    const memberIds = new Set(filter.memberIds);
    if (memberIds.has(id)) memberIds.delete(id);
    else memberIds.add(id);
    onChange({ ...filter, memberIds });
  };

  const toggleCreator = (id: string) => {
    const createdByIds = new Set(filter.createdByIds);
    if (createdByIds.has(id)) createdByIds.delete(id);
    else createdByIds.add(id);
    onChange({ ...filter, createdByIds });
  };

  const toggleDue = (value: DueFilter) => {
    const due = new Set(filter.due);
    if (due.has(value)) due.delete(value);
    else due.add(value);
    onChange({ ...filter, due });
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? t.boardFilter.filterActiveAria(count) : t.boardFilter.filterAria}
        title={t.boardFilter.filterTitle}
        className="chip cursor-pointer transition-colors hover:bg-line-soft"
      >
        <FilterIcon />
        <span className="hidden sm:inline">{t.boardFilter.filterButton}</span>
        {active && (
          <span className="grid size-4 place-items-center rounded-full bg-accent text-[0.625rem] leading-none font-semibold text-accent-on tabular-nums">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t.boardFilter.dialogLabel}
          className="sheet sheet-frost absolute top-full right-0 z-30 mt-2 w-72 rounded-2xl p-3"
        >
          <div className="flex max-h-[min(70vh,32rem)] flex-col gap-3 overflow-y-auto">
            {labels.length > 0 && (
              <div>
                <SectionTitle>{t.boardFilter.sectionLabel}</SectionTitle>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {labels.map((label) => {
                    const checked = filter.labelIds.has(label.id);
                    return (
                      <button
                        key={label.id}
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => toggleLabel(label.id)}
                        style={labelTint(label.color)}
                        className={cn(
                          "label-chip cursor-pointer",
                          checked && "outline-2 outline-offset-1 outline-accent",
                        )}
                      >
                        <span className="truncate">{label.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {people.length > 0 && (
              <div>
                <SectionTitle>{t.boardFilter.sectionPeople}</SectionTitle>
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {people.map((person) => {
                    const checked = filter.memberIds.has(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => toggleMember(person.id)}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-line-soft"
                      >
                        <Avatar person={person} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">{person.name}</span>
                        {checked && <CheckIcon />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {creators.length > 0 && (
              <div>
                <SectionTitle>{t.boardFilter.sectionCreatedBy}</SectionTitle>
                <div className="mt-1.5 flex flex-col gap-0.5">
                  {creators.map((person) => {
                    const checked = filter.createdByIds.has(person.id);
                    return (
                      <button
                        key={person.id}
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => toggleCreator(person.id)}
                        className="flex min-w-0 cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-line-soft"
                      >
                        <Avatar person={person} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-[11px]">{person.name}</span>
                        {checked && <CheckIcon />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div>
              <SectionTitle>{t.boardFilter.sectionDue}</SectionTitle>
              <div className="mt-1.5 flex flex-col gap-0.5">
                {DUE_OPTIONS.map((option) => {
                  const checked = filter.due.has(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      role="switch"
                      aria-checked={checked}
                      onClick={() => toggleDue(option.value)}
                      className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-line-soft"
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {checked && <CheckIcon />}
                    </button>
                  );
                })}
              </div>
            </div>

            {labels.length === 0 && people.length === 0 && (
              <p className="px-1 text-[11px] leading-relaxed text-muted">
                {t.boardFilter.noOptions}
              </p>
            )}
          </div>

          {active && (
            <button
              type="button"
              onClick={() => onChange(emptyBoardFilter())}
              className="mt-2 w-full cursor-pointer rounded-xl px-2 py-1.5 text-center text-xs text-muted transition-colors hover:bg-line-soft hover:text-accent-ink"
            >
              {t.boardFilter.clearFilters}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
