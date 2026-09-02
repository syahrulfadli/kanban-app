import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { moveCardLocal, moveColumnLocal } from "../lib/reorder";
import { useBoardChannel } from "../lib/realtime";
import type { BoardDetail } from "../../shared/types";

/** Perubahan beruntun dari orang lain digabung jadi satu kali tarik data. */
const REMOTE_REFRESH_DEBOUNCE_MS = 200;

export function useBoard(boardId: string) {
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setBoard(await api.getBoard(boardId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat board");
    } finally {
      setLoading(false);
    }
  }, [boardId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const pendingRefresh = useRef<ReturnType<typeof setTimeout>>(undefined);

  const scheduleRefresh = useCallback(() => {
    clearTimeout(pendingRefresh.current);
    pendingRefresh.current = setTimeout(() => void refresh(), REMOTE_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => () => clearTimeout(pendingRefresh.current), []);

  const live = useBoardChannel(boardId, scheduleRefresh);

  /** Terapkan perubahan lokal dulu; kalau server menolak, tarik ulang state asli. */
  const optimistic = useCallback(
    async (next: (b: BoardDetail) => BoardDetail, commit: () => Promise<unknown>) => {
      setBoard((prev) => (prev ? next(prev) : prev));
      try {
        await commit();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Perubahan gagal disimpan");
        await refresh();
      }
    },
    [refresh],
  );

  const actions = {
    moveCard: (cardId: string, toColumnId: string, toIndex: number) =>
      optimistic(
        (b) => moveCardLocal(b, cardId, toColumnId, toIndex),
        () => api.moveCard(cardId, toColumnId, toIndex),
      ),

    moveColumn: (columnId: string, toIndex: number) =>
      optimistic(
        (b) => moveColumnLocal(b, columnId, toIndex),
        () => api.moveColumn(columnId, toIndex),
      ),

    addCard: async (columnId: string, title: string) => {
      const card = await api.createCard(columnId, title);
      setBoard((prev) =>
        prev
          ? {
              ...prev,
              columns: prev.columns.map((col) =>
                col.id === columnId ? { ...col, cards: [...col.cards, card] } : col,
              ),
            }
          : prev,
      );
    },

    renameCard: (cardId: string, title: string) =>
      optimistic(
        (b) => ({
          ...b,
          columns: b.columns.map((col) => ({
            ...col,
            cards: col.cards.map((card) => (card.id === cardId ? { ...card, title } : card)),
          })),
        }),
        () => api.updateCard(cardId, { title }),
      ),

    deleteCard: (cardId: string) =>
      optimistic(
        (b) => ({
          ...b,
          columns: b.columns.map((col) => ({
            ...col,
            cards: col.cards.filter((card) => card.id !== cardId),
          })),
        }),
        () => api.deleteCard(cardId),
      ),

    addColumn: async (title: string) => {
      const column = await api.createColumn(boardId, title);
      setBoard((prev) =>
        prev ? { ...prev, columns: [...prev.columns, { ...column, cards: [] }] } : prev,
      );
    },

    renameColumn: (columnId: string, title: string) =>
      optimistic(
        (b) => ({
          ...b,
          columns: b.columns.map((col) => (col.id === columnId ? { ...col, title } : col)),
        }),
        () => api.renameColumn(columnId, title),
      ),

    deleteColumn: (columnId: string) =>
      optimistic(
        (b) => ({ ...b, columns: b.columns.filter((col) => col.id !== columnId) }),
        () => api.deleteColumn(columnId),
      ),
  };

  return { board, loading, error, refresh, actions, live };
}
