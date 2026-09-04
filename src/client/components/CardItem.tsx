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
import { EyeIcon } from "./WatchToggle";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import type { CardSummary } from "../../shared/types";

/* Sisanya diringkas jadi "+n". Batasnya dihitung untuk bentuk terlipat —
   sepotong warna selebar 1.375rem — dan tidak berubah saat baris dibuka:
   chip yang muncul dan hilang tiap kali baris dilipat akan membuat toggle-nya
   terbaca sebagai perubahan isi kartu, bukan cuma perubahan cara membacanya. */
const VISIBLE_LABELS = 6;

interface Props {
  card: CardSummary;
  /** Milik papan, bukan kartu ini — lihat catatan di BoardView. */
  labelsOpen: boolean;
  onToggleLabels: () => void;
  onOpen: () => void;
  onDelete: () => void;
}

export function CardItem({ card, labelsOpen, onToggleLabels, onOpen, onDelete }: Props) {
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

  /* Penjaga yang sama: chip ikut terseret bersama kartunya, jadi menjatuhkan
     kartu dengan menggenggam salah satu labelnya tidak boleh sekalian
     membuka baris labelnya. */
  const toggleLabels = () => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    onToggleLabels();
  };

  const { checklist, labels, participants, commentCount, watching } = card;
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
        "has-[.stretch:focus-visible]:outline-2 has-[.stretch:focus-visible]:outline-offset-2 has-[.stretch:focus-visible]:outline-accent",
        dragging && "opacity-40",
      )}
    >
      {edge === "top" && <span aria-hidden className="drop-edge drop-edge-x -top-1.5" />}
      {edge === "bottom" && <span aria-hidden className="drop-edge drop-edge-x -bottom-1.5" />}

      {labels.length > 0 && (
        <div className="label-row mb-2 flex flex-wrap items-center gap-1 pr-5" data-open={labelsOpen}>
          {shownLabels.map((label) => (
            /* Tiap chip adalah tombolnya sendiri, dan semuanya membuka
               seluruh papan — sasaran klik jadi selebar setiap deretan warna
               di layar, bukan satu tombol tambahan yang harus dicari dulu.

               `relative z-10` menaikkannya di atas ::after milik .stretch,
               kalau tidak klik ini mendarat di sasaran judul dan yang terbuka
               justru kartunya. `title` menutup sisanya: nama label tetap
               terbaca saat melayang, tanpa perlu dibuka. */
            <button
              key={label.id}
              type="button"
              onClick={toggleLabels}
              aria-expanded={labelsOpen}
              aria-label={`Label ${label.name}`}
              title={label.name}
              className={cn(
                "label-chip relative z-10 cursor-[inherit]",
                "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              )}
              style={labelTint(label.color)}
            >
              <span className="label-text truncate">{label.name}</span>
            </button>
          ))}
          {hiddenLabels > 0 && (
            <span
              className="text-[0.6875rem] font-semibold text-faint"
              title={labels
                .slice(shownLabels.length)
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

      {/* Baris kaki: siapa yang terlibat di kiri, dan di kanan semua yang
          bisa dihitung tentang kartu ini — checklist, deskripsi, followup.
          Progress checklist dulu berdiri sendiri selebar kartu; dipindah ke
          sini ia berhenti bersaing dengan judul dan bergabung dengan angka
          lain yang sejenis. Urutannya dari yang paling banyak berubah:
          checklist bergerak tiap centang, followup hanya saat ada yang
          menulis. */}
      {(participants.length > 0 ||
        commentCount > 0 ||
        card.description ||
        checklist.total > 0 ||
        watching) && (
        <div className="mt-2.5 flex items-center gap-2">
          {/* Avatar di sudut kiri bawah: siapa yang menyentuh kartu ini. */}
          <AvatarStack people={participants} />

          <span className="ml-auto flex items-center gap-2 text-faint">
            {/* Progress checklist terbaca tanpa membuka kartu — itu
                satu-satunya alasan angkanya ikut diangkut di payload board. */}
            {checklist.total > 0 && (
              <span
                className="flex items-center gap-1.5"
                title={`Checklist ${checklist.done} dari ${checklist.total}`}
              >
                <span
                  className="progress card-progress"
                  role="progressbar"
                  aria-valuenow={percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Checklist ${checklist.done} dari ${checklist.total}`}
                >
                  <span
                    className="progress-bar"
                    data-complete={complete}
                    style={{ width: `${percent}%` }}
                  />
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[0.6875rem] font-semibold tabular-nums",
                    complete ? "text-ok" : "text-faint",
                  )}
                >
                  {checklist.done}/{checklist.total}
                </span>
              </span>
            )}

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

            {/* Di muka kartu mata cuma sebuah keterangan, bukan tombol —
                menyalakan dan mematikannya ada di dalam dialog kartu. Ia ikut
                berat yang sama dengan angka checklist dan followup di
                sebelahnya, karena bagi orang yang menggarap papannya sendiri
                mata ini akan tampak di hampir setiap kartu; sebagai penanda
                mencolok ia akan berhenti berarti apa-apa. */}
            {watching && (
              <span title="Kartu ini Anda awasi" className="flex">
                <EyeIcon watching className="size-3.5" label="Kartu ini Anda awasi" />
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
