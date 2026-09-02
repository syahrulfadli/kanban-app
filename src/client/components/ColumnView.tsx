import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { CardItem } from "./CardItem";
import { AddItemForm } from "./AddItemForm";
import { cn } from "../lib/cn";
import type { BoardDetail } from "../../shared/types";

type ColumnWithCards = BoardDetail["columns"][number];

interface Props {
  column: ColumnWithCards;
  onAddCard: (title: string) => Promise<void>;
  onRenameColumn: (title: string) => void;
  onDeleteColumn: () => void;
  onRenameCard: (cardId: string, title: string) => void;
  onDeleteCard: (cardId: string) => void;
}

export function ColumnView({
  column,
  onAddCard,
  onRenameColumn,
  onDeleteColumn,
  onRenameCard,
  onDeleteCard,
}: Props) {
  const ref = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [cardOver, setCardOver] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    const header = headerRef.current;
    if (!el || !header) return;

    const data = { type: "column", columnId: column.id };

    return combine(
      // Kolom hanya bisa ditarik dari header-nya, supaya tidak bentrok dengan drag kartu.
      draggable({
        element: el,
        dragHandle: header,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        getData: ({ input, source }) =>
          source.data.type === "column"
            ? attachClosestEdge(data, { element: el, input, allowedEdges: ["left", "right"] })
            : data,
        onDrag: ({ self, source }) => {
          if (source.data.type === "column") {
            setEdge(source.data.columnId === column.id ? null : extractClosestEdge(self));
          } else {
            setCardOver(true);
          }
        },
        onDragLeave: () => {
          setEdge(null);
          setCardOver(false);
        },
        onDrop: () => {
          setEdge(null);
          setCardOver(false);
        },
      }),
    );
  }, [column.id]);

  const commitTitle = (value: string) => {
    const title = value.trim();
    setEditing(false);
    if (title && title !== column.title) onRenameColumn(title);
  };

  return (
    <section
      ref={ref}
      className={cn(
        "relative flex max-h-full w-72 shrink-0 flex-col rounded-xl border border-border-subtle bg-surface-raised/60",
        dragging && "opacity-40",
        cardOver && "ring-2 ring-blue-500/40",
        edge === "left" && "before:absolute before:-left-2 before:inset-y-0 before:w-0.5 before:rounded-full before:bg-blue-500",
        edge === "right" && "after:absolute after:-right-2 after:inset-y-0 after:w-0.5 after:rounded-full after:bg-blue-500",
      )}
    >
      <div
        ref={headerRef}
        className="flex cursor-grab items-center gap-2 px-3 py-2.5 active:cursor-grabbing"
      >
        {editing ? (
          <input
            autoFocus
            defaultValue={column.title}
            className="min-w-0 flex-1 rounded bg-transparent text-sm font-semibold outline-none"
            onBlur={(e) => commitTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle(e.currentTarget.value);
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <h2
            className="min-w-0 flex-1 truncate text-sm font-semibold"
            onDoubleClick={() => setEditing(true)}
          >
            {column.title}
          </h2>
        )}

        <span className="text-xs tabular-nums text-slate-400">{column.cards.length}</span>

        <button
          type="button"
          aria-label={`Hapus kolom ${column.title}`}
          onClick={onDeleteColumn}
          className="size-5 rounded text-slate-400 hover:bg-slate-500/10 hover:text-red-500"
        >
          ×
        </button>
      </div>

      <ul className="flex min-h-2 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-2">
        {column.cards.map((card) => (
          <CardItem
            key={card.id}
            card={card}
            onRename={(title) => onRenameCard(card.id, title)}
            onDelete={() => onDeleteCard(card.id)}
          />
        ))}
      </ul>

      <div className="px-3 pb-3">
        <AddItemForm placeholder="Tambah kartu…" submitLabel="+ Kartu" onSubmit={onAddCard} />
      </div>
    </section>
  );
}
