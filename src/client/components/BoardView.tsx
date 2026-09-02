import { useEffect, useRef } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { ColumnView } from "./ColumnView";
import { AddItemForm } from "./AddItemForm";
import { useBoard } from "../hooks/useBoard";
import { navigate, paths } from "../lib/route";
import { cn } from "../lib/cn";
import type { ChannelStatus } from "../lib/realtime";
import { AppHeader } from "./AppHeader";

function LiveIndicator({ status, viewers }: { status: ChannelStatus; viewers: number }) {
  const label =
    status === "live"
      ? viewers > 1
        ? `${viewers} orang di board ini`
        : "Terhubung"
      : status === "connecting"
        ? "Menyambungkan…"
        : "Terputus — mencoba lagi";

  return (
    <span className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500" title={label}>
      <span
        className={cn(
          "size-2 rounded-full",
          status === "live" && "bg-green-500",
          status === "connecting" && "bg-amber-500",
          status === "offline" && "bg-red-500",
        )}
      />
      <span className="hidden sm:inline">{label}</span>
    </span>
  );
}

export function BoardView({ boardId }: { boardId: string }) {
  const { board, loading, error, actions, live } = useBoard(boardId);

  // Monitor DnD didaftarkan sekali; state terbaru dibaca lewat ref agar
  // listener tidak perlu dipasang ulang setiap render.
  const latest = useRef({ board, actions });
  latest.current = { board, actions };

  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const { board, actions } = latest.current;
        const target = location.current.dropTargets[0];
        if (!board || !target) return;

        if (source.data.type === "card") {
          const cardId = source.data.cardId as string;
          const fromColumnId = source.data.columnId as string;

          const destColumnId =
            target.data.type === "card" || target.data.type === "column"
              ? (target.data.columnId as string)
              : null;
          if (!destColumnId) return;

          const rest = (board.columns.find((c) => c.id === destColumnId)?.cards ?? []).filter(
            (c) => c.id !== cardId,
          );

          let index: number;
          if (target.data.type === "card") {
            const at = rest.findIndex((c) => c.id === target.data.cardId);
            if (at === -1) return;
            index = extractClosestEdge(target.data) === "bottom" ? at + 1 : at;
          } else {
            index = rest.length;
          }

          const currentIndex = board.columns
            .find((c) => c.id === fromColumnId)
            ?.cards.findIndex((c) => c.id === cardId);
          if (destColumnId === fromColumnId && index === currentIndex) return;

          void actions.moveCard(cardId, destColumnId, index);
          return;
        }

        if (source.data.type === "column" && target.data.type === "column") {
          const columnId = source.data.columnId as string;
          const rest = board.columns.filter((c) => c.id !== columnId);

          const at = rest.findIndex((c) => c.id === target.data.columnId);
          if (at === -1) return;

          const index = extractClosestEdge(target.data) === "right" ? at + 1 : at;
          const currentIndex = board.columns.findIndex((c) => c.id === columnId);
          if (index === currentIndex) return;

          void actions.moveColumn(columnId, index);
        }
      },
    });
  }, []);

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Memuat board…</p>;
  }

  if (!board) {
    return (
      <div className="p-8">
        <p className="text-sm text-red-500">{error ?? "Board tidak ditemukan."}</p>
        <button
          onClick={() => navigate(paths.workspaces)}
          className="mt-3 text-sm text-blue-600 hover:underline"
        >
          ← Kembali ke daftar workspace
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader>
        <span className="text-slate-400">/</span>
        <button
          onClick={() => navigate(paths.workspace(board.workspaceId))}
          className="text-sm text-slate-500 hover:underline"
        >
          Board
        </button>
        <span className="text-slate-400">/</span>
        <h1 className="min-w-0 truncate text-sm font-medium">{board.title}</h1>

        <LiveIndicator status={live.status} viewers={live.viewers} />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </AppHeader>

      <main className="flex flex-1 items-start gap-4 overflow-x-auto p-4">
        {board.columns.map((column) => (
          <ColumnView
            key={column.id}
            column={column}
            onAddCard={(title) => actions.addCard(column.id, title)}
            onRenameColumn={(title) => actions.renameColumn(column.id, title)}
            onDeleteColumn={() => actions.deleteColumn(column.id)}
            onRenameCard={actions.renameCard}
            onDeleteCard={actions.deleteCard}
          />
        ))}

        <div className="w-72 shrink-0">
          <AddItemForm
            placeholder="Nama kolom…"
            submitLabel="+ Tambah kolom"
            onSubmit={actions.addColumn}
          />
        </div>
      </main>
    </div>
  );
}
