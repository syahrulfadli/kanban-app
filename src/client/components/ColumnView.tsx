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
  onOpenCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
}

export function ColumnView({
  column,
  onAddCard,
  onRenameColumn,
  onDeleteColumn,
  onOpenCard,
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
        "glass glass-frost glass-column flex max-h-full w-72 shrink-0 flex-col",
        dragging && "opacity-40",
        cardOver && "outline-2 outline-offset-2 outline-accent/55",
      )}
    >
      {/* Penanda sisi drop kolom. Elemen sungguhan, bukan pseudo-element:
          ::before dan ::after milik kolom sudah dipakai cincin dan kilau kaca. */}
      {edge === "left" && <span aria-hidden className="drop-edge drop-edge-y -left-2" />}
      {edge === "right" && <span aria-hidden className="drop-edge drop-edge-y -right-2" />}

      <div
        ref={headerRef}
        className="flex cursor-grab items-center gap-2 px-3.5 pt-3 pb-2.5 active:cursor-grabbing"
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
            className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight"
            onDoubleClick={() => setEditing(true)}
            title="Klik dua kali untuk mengganti nama"
          >
            {column.title}
          </h2>
        )}

        <span className="chip tabular-nums">{column.cards.length}</span>

        <button
          type="button"
          aria-label={`Hapus kolom ${column.title}`}
          onClick={onDeleteColumn}
          className="grid size-6 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M6 6 18 18M18 6 6 18" />
          </svg>
        </button>
      </div>

      <ul className="flex min-h-14 flex-1 flex-col gap-2 overflow-y-auto px-3 pb-2">
        {column.cards.map((card) => (
          <CardItem
            key={card.id}
            card={card}
            onOpen={() => onOpenCard(card.id)}
            onDelete={() => onDeleteCard(card.id)}
          />
        ))}

        {column.cards.length === 0 && (
          <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-faint">
            Belum ada kartu
          </li>
        )}
      </ul>

      <div className="px-3 pb-3">
        <AddItemForm placeholder="Tambah kartu…" submitLabel="+ Kartu" onSubmit={onAddCard} />
      </div>
    </section>
  );
}
