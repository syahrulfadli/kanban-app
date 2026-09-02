import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { insertAt, moveCardLocal, moveColumnLocal } from "../lib/reorder";
import { useBoardChannel } from "../lib/realtime";
import { useUndo } from "../components/UndoToasts";
import type { BoardDetail, CardSummary } from "../../shared/types";

/** Perubahan beruntun dari orang lain digabung jadi satu kali tarik data. */
const REMOTE_REFRESH_DEBOUNCE_MS = 200;

export function useBoard(boardId: string) {
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const undo = useUndo();

  /* Id yang sedang dalam jendela urung. Server belum tahu apa-apa tentang
     penghapusannya, jadi setiap tarikan data akan membawa mereka kembali —
     di sini mereka disaring supaya barang yang sudah hilang dari layar tidak
     berkedip muncul lagi setiap ada perubahan dari kolaborator. */
  const hidden = useRef(new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.getBoard(boardId);
      setBoard({
        ...fresh,
        columns: fresh.columns
          .filter((col) => !hidden.current.has(col.id))
          .map((col) => ({ ...col, cards: col.cards.filter((c) => !hidden.current.has(c.id)) })),
      });
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

    /* Hapus kartu: hilang dari layar sekarang, dikirim ke server setelah
       jendela urung habis — lihat UndoProvider. */
    deleteCard: (cardId: string) => {
      const source = board?.columns.find((col) => col.cards.some((c) => c.id === cardId));
      const index = source?.cards.findIndex((c) => c.id === cardId) ?? -1;
      const card = index >= 0 ? source!.cards[index] : null;
      if (!source || !card) return;

      const patchColumn = (b: BoardDetail, cards: (list: CardSummary[]) => CardSummary[]) => ({
        ...b,
        columns: b.columns.map((col) =>
          col.id === source.id ? { ...col, cards: cards(col.cards) } : col,
        ),
      });

      hidden.current.add(cardId);
      setBoard((b) => (b ? patchColumn(b, (cards) => cards.filter((c) => c.id !== cardId)) : b));

      undo({
        message: `Kartu “${card.title}” dihapus`,
        commit: async (options) => {
          await api.deleteCard(cardId, options);
          hidden.current.delete(cardId);
        },
        revert: () => {
          hidden.current.delete(cardId);
          setBoard((b) => (b ? patchColumn(b, (cards) => insertAt(cards, card, index)) : b));
        },
        onError: setError,
      });
    },

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

    deleteColumn: (columnId: string) => {
      const index = board?.columns.findIndex((col) => col.id === columnId) ?? -1;
      const column = index >= 0 ? board!.columns[index] : null;
      if (!column) return;

      hidden.current.add(columnId);
      setBoard((b) => (b ? { ...b, columns: b.columns.filter((col) => col.id !== columnId) } : b));

      undo({
        message: `Kolom “${column.title}” dihapus`,
        commit: async (options) => {
          await api.deleteColumn(columnId, options);
          hidden.current.delete(columnId);
        },
        revert: () => {
          hidden.current.delete(columnId);
          setBoard((b) => (b ? { ...b, columns: insertAt(b.columns, column, index) } : b));
        },
        onError: setError,
      });
    },
  };

  return { board, loading, error, refresh, actions, live };
}
