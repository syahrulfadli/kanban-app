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
import { cn } from "../lib/cn";
import type { Card } from "../../shared/types";

interface Props {
  card: Card;
  onRename: (title: string) => void;
  onDelete: () => void;
}

export function CardItem({ card, onRename, onDelete }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const data = { type: "card", cardId: card.id, columnId: card.columnId };

    return combine(
      draggable({
        element: el,
        getInitialData: () => data,
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        canDrop: ({ source }) => source.data.type === "card",
        getData: ({ input }) =>
          attachClosestEdge(data, { element: el, input, allowedEdges: ["top", "bottom"] }),
        onDrag: ({ self, source }) =>
          setEdge(source.data.cardId === card.id ? null : extractClosestEdge(self)),
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [card.id, card.columnId]);

  const commit = (value: string) => {
    const title = value.trim();
    setEditing(false);
    if (title && title !== card.title) onRename(title);
  };

  return (
    <li
      ref={ref}
      className={cn(
        "group relative rounded-lg border border-border-subtle bg-surface-raised p-3 shadow-sm",
        "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
        edge === "top" && "before:absolute before:-top-1 before:inset-x-0 before:h-0.5 before:rounded-full before:bg-blue-500",
        edge === "bottom" && "after:absolute after:-bottom-1 after:inset-x-0 after:h-0.5 after:rounded-full after:bg-blue-500",
      )}
    >
      {editing ? (
        <textarea
          autoFocus
          defaultValue={card.title}
          rows={2}
          className="w-full resize-none rounded bg-transparent text-sm outline-none"
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit(e.currentTarget.value);
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <p
          className="pr-6 text-sm whitespace-pre-wrap break-words"
          onDoubleClick={() => setEditing(true)}
        >
          {card.title}
        </p>
      )}

      <button
        type="button"
        aria-label={`Hapus kartu ${card.title}`}
        onClick={onDelete}
        className="absolute top-2 right-2 hidden size-5 rounded text-slate-400 hover:bg-slate-500/10 hover:text-red-500 group-hover:block"
      >
        ×
      </button>
    </li>
  );
}
