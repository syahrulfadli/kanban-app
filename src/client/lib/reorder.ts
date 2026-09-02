import type { BoardDetail, Card } from "../../shared/types";

/**
 * `index` selalu dihitung pada daftar yang SUDAH mengeluarkan item yang dipindah.
 * Konvensi yang sama dipakai server, jadi hasil optimistik dan hasil final cocok.
 */

export function moveCardLocal(
  board: BoardDetail,
  cardId: string,
  toColumnId: string,
  toIndex: number,
): BoardDetail {
  let moved: Card | undefined;

  const without = board.columns.map((col) => {
    const found = col.cards.find((card) => card.id === cardId);
    if (!found) return col;
    moved = found;
    return { ...col, cards: col.cards.filter((card) => card.id !== cardId) };
  });

  if (!moved) return board;
  const card = moved;

  return {
    ...board,
    columns: without.map((col) =>
      col.id === toColumnId
        ? { ...col, cards: col.cards.toSpliced(toIndex, 0, { ...card, columnId: toColumnId }) }
        : col,
    ),
  };
}

export function moveColumnLocal(
  board: BoardDetail,
  columnId: string,
  toIndex: number,
): BoardDetail {
  const moved = board.columns.find((col) => col.id === columnId);
  if (!moved) return board;

  const without = board.columns.filter((col) => col.id !== columnId);
  return { ...board, columns: without.toSpliced(toIndex, 0, moved) };
}
