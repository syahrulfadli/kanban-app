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
import { AvatarStack } from "./Avatar";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import type { CardSummary } from "../../shared/types";

/** Sisanya diringkas jadi "+n" — judul kartu tetap yang paling dulu terbaca. */
const VISIBLE_LABELS = 3;

interface Props {
  card: CardSummary;
  onOpen: () => void;
  onDelete: () => void;
}

export function CardItem({ card, onOpen, onDelete }: Props) {
  const ref = useRef<HTMLLIElement>(null);
  const [dragging, setDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  // Kartu dibuka dengan klik, dan kartu yang sama juga diseret. Penanda ini
  // menelan klik yang menyusul sebuah drag, supaya menjatuhkan kartu di kolom
  // lain tidak sekalian membuka dialognya.
  const dragged = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const data = { type: "card", cardId: card.id, columnId: card.columnId };

    return combine(
      draggable({
        element: el,
        getInitialData: () => data,
        onDragStart: () => {
          dragged.current = true;
          setDragging(true);
        },
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

  const open = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onOpen();
  };

  const { checklist, labels, participants, commentCount } = card;
  const percent = checklist.total ? Math.round((checklist.done / checklist.total) * 100) : 0;
  const complete = checklist.total > 0 && checklist.done === checklist.total;
  const shownLabels = labels.slice(0, VISIBLE_LABELS);
  const hiddenLabels = labels.length - shownLabels.length;

  return (
    <li
      ref={ref}
      /* Kartu adalah benda DI DALAM gelas, bukan jendela: pelat translusen
         dengan cincin cahayanya sendiri, tanpa backdrop-filter. Kaca di dalam
         kaca tidak akan menghasilkan apa-apa — lihat catatan .glass-frost. */
      className={cn(
        "glass board-card board-card-hover group rounded-xl p-3 transition-[background-color,transform]",
        "cursor-grab text-left active:cursor-grabbing",
        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent",
        dragging && "opacity-40",
      )}
    >
      {edge === "top" && <span aria-hidden className="drop-edge drop-edge-x -top-1.5" />}
      {edge === "bottom" && <span aria-hidden className="drop-edge drop-edge-x -bottom-1.5" />}

      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1 pr-5">
          {shownLabels.map((label) => (
            <span key={label.id} className="label-chip" style={labelTint(label.color)}>
              <span className="truncate">{label.name}</span>
            </span>
          ))}
          {hiddenLabels > 0 && (
            <span
              className="text-[0.6875rem] font-semibold text-faint"
              title={labels
                .slice(VISIBLE_LABELS)
                .map((l) => l.name)
                .join(", ")}
            >
              +{hiddenLabels}
            </span>
          )}
        </div>
      )}

      {/* Judul adalah tombolnya, tapi sasaran kliknya direntangkan ke seluruh
          pelat lewat .stretch — jadi kartu bisa diklik di mana saja tanpa
          menyarangkan tombol hapus di dalam elemen yang juga sebuah tombol. */}
      <button
        type="button"
        onClick={open}
        aria-label={`Buka kartu ${card.title}`}
        className="stretch block w-full cursor-[inherit] pr-5 text-left text-sm leading-snug wrap-break-word whitespace-pre-wrap text-ink-soft outline-none"
      >
        {card.title}
      </button>

      {/* Progress checklist terbaca tanpa membuka kartu — itu satu-satunya
          alasan angkanya ikut diangkut di payload board. */}
      {checklist.total > 0 && (
        <div className="mt-2.5 flex items-center gap-2">
          <div
            className="progress flex-1"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Checklist ${checklist.done} dari ${checklist.total}`}
          >
            <div
              className="progress-bar"
              data-complete={complete}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span
            className={cn(
              "shrink-0 text-[0.6875rem] font-semibold tabular-nums",
              complete ? "text-ok" : "text-faint",
            )}
          >
            {checklist.done}/{checklist.total}
          </span>
        </div>
      )}

      {(participants.length > 0 || commentCount > 0 || card.description) && (
        <div className="mt-2.5 flex items-center gap-2">
          {/* Avatar di sudut kiri bawah: siapa yang menyentuh kartu ini. */}
          <AvatarStack people={participants} />

          <span className="ml-auto flex items-center gap-2 text-faint">
            {card.description && (
              <svg
                viewBox="0 0 24 24"
                className="size-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-label="Punya deskripsi"
                role="img"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            )}

            {commentCount > 0 && (
              <span
                className="flex items-center gap-1 text-[0.6875rem] font-semibold tabular-nums"
                title={`${commentCount} followup`}
              >
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
                  <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.4A8 8 0 1 1 21 12z" />
                </svg>
                {commentCount}
              </span>
            )}
          </span>
        </div>
      )}

      <button
        type="button"
        aria-label={`Hapus kartu ${card.title}`}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-2 right-2 z-10 hidden size-5 place-items-center rounded-full text-faint transition-colors group-hover:grid hover:bg-danger/10 hover:text-danger"
      >
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M6 6 18 18M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}
