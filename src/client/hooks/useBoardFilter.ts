import { useCallback, useEffect, useState } from "react";
import {
  emptyBoardFilter,
  isBoardFilterActive,
  type BoardFilterState,
  type DueFilter,
} from "../lib/boardFilter";

/* Satu kunci per papan — sama alasannya dengan kolom yang disusutkan
   (useCollapsedColumns): filter papan yang satu tidak boleh ikut menyaring
   papan yang lain. */
const keyFor = (boardId: string) => `kanban:filter:${boardId}`;

const DUE_VALUES = new Set<DueFilter>(["overdue", "week", "none"]);
const isDueFilter = (value: unknown): value is DueFilter =>
  typeof value === "string" && DUE_VALUES.has(value as DueFilter);

const toIdSet = (value: unknown): Set<string> =>
  new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);

function read(boardId: string): BoardFilterState {
  try {
    const stored = localStorage.getItem(keyFor(boardId));
    if (!stored) return emptyBoardFilter();

    const parsed: unknown = JSON.parse(stored);
    if (!parsed || typeof parsed !== "object") return emptyBoardFilter();
    const raw = parsed as Record<string, unknown>;

    return {
      labelIds: toIdSet(raw.labelIds),
      memberIds: toIdSet(raw.memberIds),
      createdByIds: toIdSet(raw.createdByIds),
      due: new Set(Array.isArray(raw.due) ? raw.due.filter(isDueFilter) : []),
    };
  } catch {
    // Mode privat, atau isian yang rusak. Papan terbuka tanpa filter saja.
    return emptyBoardFilter();
  }
}

function write(boardId: string, filter: BoardFilterState) {
  try {
    if (!isBoardFilterActive(filter)) {
      localStorage.removeItem(keyFor(boardId));
      return;
    }

    localStorage.setItem(
      keyFor(boardId),
      JSON.stringify({
        labelIds: [...filter.labelIds],
        memberIds: [...filter.memberIds],
        createdByIds: [...filter.createdByIds],
        due: [...filter.due],
      }),
    );
  } catch {
    // Tidak persisten, tapi sesi ini tetap berjalan.
  }
}

/**
 * Filter board, disimpan di peramban per papan.
 *
 * Lokal per perangkat, bukan disinkronkan lewat server — sama seperti kolom
 * yang disusutkan: apa yang sedang difokuskan satu orang di satu layar tidak
 * seharusnya ikut menyaring papan kolaboratornya.
 */
export function useBoardFilter(boardId: string) {
  const [filter, setFilterState] = useState<BoardFilterState>(() => read(boardId));

  useEffect(() => {
    setFilterState(read(boardId));
  }, [boardId]);

  const setFilter = useCallback(
    (next: BoardFilterState) => {
      setFilterState(next);
      write(boardId, next);
    },
    [boardId],
  );

  return { filter, setFilter };
}
