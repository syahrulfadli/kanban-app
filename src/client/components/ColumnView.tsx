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
import { CardItem, GHOST_FALLBACK } from "./CardItem";
import { AddItemForm } from "./AddItemForm";
import { ColorSwatches } from "./ColorSwatches";
import { EyeIcon } from "./WatchToggle";
import { cn } from "../lib/cn";
import { columnTint, labelTint } from "../lib/people";
import type { BoardDetail, ColumnColor } from "../../shared/types";

type ColumnWithCards = BoardDetail["columns"][number];

/* Jarak antarkolom di papan (gap-4) — pasangan CARD_GAP di CardItem, dengan
   alasan yang sama: lubangnya selebar kolomnya ditambah jarak ini. */
const COLUMN_GAP = 16;

/* Lebar lubang kalau kolom yang diseret entah kenapa tidak membawa ukurannya:
   selebar kolom terbentang (w-72). */
const COLUMN_FALLBACK = 288;

/**
 * Garis tepi dengan anak panah yang menuju atau menjauhinya — ikon lipat panel
 * yang sama dengan yang dipakai bilah samping di mana-mana.
 *
 * Sepasang panah saling hadap sempat dicoba dan dibatalkan: pada ukuran kepala
 * kolom ia berakhir sebagai coretan menyilang, persis seperti tanda hapus yang
 * berdiri tiga tombol di sebelahnya.
 */
function CollapseIcon({ expand, className }: { expand: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 5v14" />
      {expand ? <path d="M11 8l4 4-4 4" /> : <path d="M17 8l-4 4 4 4" />}
    </svg>
  );
}

/**
 * Satu butir di menu kolom. Bentuknya sengaja sama persis dengan butir menu
 * profil; yang berbeda cuma ikonnya diterima utuh, bukan sebagai isi sebuah
 * `<svg>` yang sudah ditentukan di sini — mata Awasi punya dua rupa dan
 * ketebalan garisnya sendiri.
 */
function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-ink-soft transition-colors",
        danger ? "hover:bg-danger/10 hover:text-danger" : "hover:bg-accent-soft hover:text-accent-ink",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

/** Tong sampah — di menu berlabel, tanda silang terbaca sebagai "tutup". */
function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

/**
 * Anak panah yang keluar dari sebuah bidang — pindah ke papan lain.
 *
 * Bukan panah dua arah dan bukan tanda pindah-urutan: yang diceritakan ikon
 * ini adalah keluar dari sini, bukan bergeser di dalam sini.
 */
function MoveOutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="m16 8 4 4-4 4M20 12H10" />
    </svg>
  );
}

/** Tiga titik mendatar — satu-satunya kenop yang tersisa di kepala kolom. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

interface Props {
  column: ColumnWithCards;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAddCard: (title: string) => Promise<void>;
  onRenameColumn: (title: string) => void;
  onRecolorColumn: (color: ColumnColor | null) => void;
  onWatchColumn: (watching: boolean) => void;
  onMoveColumn: () => void;
  onDeleteColumn: () => void;
  onOpenCard: (cardId: string) => void;
  onDeleteCard: (cardId: string) => void;
  /** Diteruskan apa adanya ke kartu — papan yang memilikinya, bukan kolom. */
  labelsOpen: boolean;
  onToggleLabels: () => void;
}

export function ColumnView({
  column,
  collapsed,
  onToggleCollapse,
  onAddCard,
  onRenameColumn,
  onRecolorColumn,
  onWatchColumn,
  onMoveColumn,
  onDeleteColumn,
  onOpenCard,
  onDeleteCard,
  labelsOpen,
  onToggleLabels,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  /* Lubang selebar kolom yang sedang melayang, di sisi kiri atau kanan kolom
     ini — kembaran mendatar dari lubang kartu di CardItem. */
  const [columnSlot, setColumnSlot] = useState<{ edge: Edge; width: number } | null>(null);

  const [cardOver, setCardOver] = useState(false);

  /* Lubang di kaki daftar kartu: tinggi kartu yang akan mendarat sebagai kartu
     terakhir kolom ini. Terpisah dari `cardOver` karena keduanya menjawab
     pertanyaan berbeda — `cardOver` cuma "ada kartu melayang di atas kolom
     ini", sedangkan yang ini "dan tempat jatuhnya di kaki daftar". */
  const [cardSlot, setCardSlot] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    const plate = plateRef.current;
    const header = headerRef.current;
    if (!el || !plate || !header) return;

    const data = { type: "column", columnId: column.id };

    const clear = () => {
      setColumnSlot(null);
      setCardOver(false);
      setCardSlot(null);
    };

    return combine(
      // Kolom hanya bisa ditarik dari header-nya, supaya tidak bentrok dengan drag kartu.
      draggable({
        /* Pelatnya, bukan pembungkusnya: pratinjau seretnya harus kolom itu
           sendiri, dan lebarnya dititipkan supaya kolom yang disinggahi tahu
           seberapa lebar lubang yang harus dibuka — kolom susut jauh lebih
           sempit daripada kolom terbentang. */
        element: plate,
        dragHandle: header,
        getInitialData: () => ({ ...data, width: plate.getBoundingClientRect().width }),
        onDragStart: () => setDragging(true),
        onDrop: () => setDragging(false),
      }),
      dropTargetForElements({
        element: el,
        getData: ({ input, source }) =>
          source.data.type === "column"
            ? attachClosestEdge(data, { element: el, input, allowedEdges: ["left", "right"] })
            : data,
        onDrag: ({ self, source, location }) => {
          if (source.data.type === "column") {
            // `self.data`, bukan `self` — lihat catatan di CardItem.
            const next = source.data.columnId === column.id ? null : extractClosestEdge(self.data);
            const width =
              typeof source.data.width === "number" ? source.data.width : COLUMN_FALLBACK;

            setColumnSlot((prev) => {
              if (!next) return null;
              if (prev && prev.edge === next && prev.width === width) return prev;
              return { edge: next, width };
            });
            return;
          }

          setCardOver(true);

          /* Lubang di kaki daftar hanya kalau kolom inilah sasaran terdalam.
             Selagi kursornya di atas sebuah kartu, kartu itu yang membuka
             lubangnya sendiri — dua lubang sekaligus akan menjanjikan dua
             tempat jatuh untuk satu kartu. */
          const innermost = location.current.dropTargets[0];
          const height =
            typeof source.data.height === "number" ? source.data.height : GHOST_FALLBACK;

          setCardSlot(innermost?.element === el ? height : null);
        },
        onDragLeave: clear,
        onDrop: clear,
      }),
    );
  }, [column.id]);

  /* Pola yang sama dengan pemilih label: `pointerdown`, bukan `click`, supaya
     pemilih sudah menutup sebelum kliknya mendarat di bawahnya. */
  useEffect(() => {
    if (!menuOpen) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const commitTitle = (value: string) => {
    const title = value.trim();
    setEditing(false);
    if (title && title !== column.title) onRenameColumn(title);
  };

  /* Kolom yang disusutkan.

     Yang tersisa cuma dua: tombol untuk membentangkannya kembali dan nama
     kolomnya, dibaca dari atas ke bawah. Tinggi kolomnya menyusul panjang
     namanya — kolom susut yang tetap setinggi papan hanya memindahkan
     kotak kosong, bukan menyingkirkannya.

     Ref-nya tetap terpasang seperti kolom yang terbentang, jadi kolom susut
     masih bisa digeser urutannya dan masih bisa menerima kartu yang dijatuhkan
     ke atasnya. */
  if (collapsed) {
    return (
    <div
      ref={ref}
      className="relative flex max-h-full shrink-0"
      style={
        columnSlot
          ? columnSlot.edge === "left"
            ? { paddingLeft: columnSlot.width + COLUMN_GAP }
            : { paddingRight: columnSlot.width + COLUMN_GAP }
          : undefined
      }
    >
      {/* Lubang tempat kolom ini akan bergeser memberi jalan. Ruangnya dibuka
          oleh padding pembungkusnya sendiri, bukan oleh elemen di antara dua
          kolom — alasannya sama persis dengan lubang kartu, dan tertulis di
          catatan .drop-ghost. */}
      {columnSlot && (
        <span
          aria-hidden
          className="drop-ghost drop-ghost-column"
          style={{
            width: columnSlot.width,
            ...(columnSlot.edge === "left" ? { left: 0 } : { right: 0 }),
          }}
        />
      )}

      <section
        ref={plateRef}
        style={columnTint(column.color)}
        data-tinted={column.color !== null}
        className={cn(
          "glass glass-frost glass-column flex min-h-0 shrink-0 flex-col",
          dragging && "opacity-40",
          cardOver && "outline-2 outline-offset-2 outline-accent/55",
        )}
      >
          {/* `column-chrome` di sini, bukan di section-nya: aturan yang
              membelokkan tinta di kolom berwarna adalah selector keturunan, jadi
              dipasang di elemen yang sama dengan `data-tinted` ia tidak pernah
              kena — dan judul kolom susut akan berbeda warna dari judul yang
              sama saat kolomnya terbentang.

              Atas dan bawahnya kembali sama tebal begitu chip hitung berdiri di
              kaki kolom: bobot yang dulu ditiru oleh padding sekarang ada
              benda sungguhannya, satu di atas teks dan satu di bawahnya. */}
          <div
            ref={headerRef}
            className="column-chrome flex min-h-0 cursor-grab flex-col items-center gap-2 px-2 pt-2.5 pb-2.5 active:cursor-grabbing"
          >
            <button
              type="button"
              aria-expanded={false}
              aria-label={`Bentangkan kolom ${column.title}`}
              title="Bentangkan kolom"
              onClick={onToggleCollapse}
              className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-line-soft hover:text-ink"
            >
              <CollapseIcon expand className="size-5" />
            </button>

            <h2
              className="column-title-vertical min-h-0 truncate text-sm font-semibold tracking-tight"
              title={`${column.title} — ${column.cards.length} kartu`}
            >
              {column.title}
            </h2>

            {/* Satu-satunya isi kolom yang masih terbaca saat disusutkan.
                Berapa banyak kartu yang ada di dalamnya adalah hal yang paling
                sering ditanyakan ke kolom yang sedang tidak dilihat isinya —
                tanpa ini kolom susut cuma nama, dan orang harus membentangkannya
                hanya untuk tahu bahwa isinya kosong.

                Padding mendatarnya dipersempit dari chip biasa supaya lebar
                kolom tetap ditentukan tombol bentang selebar 28px, bukan oleh
                chip yang melar saat jumlah kartunya dua digit. */}
            <span className="chip chip-plain shrink-0 px-2.5 py-0.5 font-normal tabular-nums">
              {column.cards.length}
            </span>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="relative flex max-h-full shrink-0"
      style={
        columnSlot
          ? columnSlot.edge === "left"
            ? { paddingLeft: columnSlot.width + COLUMN_GAP }
            : { paddingRight: columnSlot.width + COLUMN_GAP }
          : undefined
      }
    >
      {/* Lubang tempat kolom ini akan bergeser memberi jalan. Ruangnya dibuka
          oleh padding pembungkusnya sendiri, bukan oleh elemen di antara dua
          kolom — alasannya sama persis dengan lubang kartu, dan tertulis di
          catatan .drop-ghost. */}
      {columnSlot && (
        <span
          aria-hidden
          className="drop-ghost drop-ghost-column"
          style={{
            width: columnSlot.width,
            ...(columnSlot.edge === "left" ? { left: 0 } : { right: 0 }),
          }}
        />
      )}

      <section
        ref={plateRef}
        style={columnTint(column.color)}
        data-tinted={column.color !== null}
        className={cn(
          "glass glass-frost glass-column flex min-h-0 w-72 shrink-0 flex-col",
          dragging && "opacity-40",
          cardOver && "outline-2 outline-offset-2 outline-accent/55",
        )}
      >
        <div
          ref={headerRef}
          className="column-chrome flex cursor-grab items-center gap-2 px-3.5 pt-3 pb-2.5 active:cursor-grabbing"
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

          {/* Angka kartu dan mata dirapatkan jadi satu keterangan tentang isi
              kolom, dipisahkan dari deret kenop di kanannya. Mata hanya muncul
              saat kolomnya diawasi, dan ia cuma penanda: tidak bisa ditekan.
              Keadaan mati tidak perlu menempati kepala kolom — ia sudah terbaca
              dari tidak adanya mata — dan menyalakan maupun mematikannya
              sama-sama di dalam menu, supaya satu ketukan nyasar di kepala kolom
              tidak diam-diam memutus kabar dari sini. */}
          <div className="flex shrink-0 items-center gap-1.5">
            {column.watching && (
              <span title="Kolom ini Anda awasi" className="flex text-faint">
                <EyeIcon watching className="size-4" label="Kolom ini Anda awasi" />
              </span>
            )}
            <span className="chip chip-plain font-normal tabular-nums">{column.cards.length}</span>
          </div>

          {/* Deret tombol dirapatkan sendiri: dengan lingkaran singgung selebar
              24px, jarak sebesar jarak antar-bagian kepala kolom cuma memakan
              ruang judul. */}
          <div className="flex shrink-0 items-center gap-1">
            {/* Susutkan kolom. Berdiri paling kiri di deret tombol karena ia yang
                paling ringan: tidak mengubah apa pun di papan, cuma menyingkirkan
                kolom ini dari pandangan orang yang menekannya. */}
            <button
              type="button"
              aria-expanded
              aria-label={`Susutkan kolom ${column.title}`}
              title="Susutkan kolom"
              onClick={onToggleCollapse}
              className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-line-soft hover:text-ink"
            >
              <CollapseIcon expand={false} className="size-5" />
            </button>

            {/* Warna dan hapus turun ke menu bersama Awasi. Ketiganya jarang
                dipakai — sekali saat kolomnya dibentuk, lalu nyaris tidak pernah
                lagi — dan tiga kenop yang menganggur di setiap kepala kolom
                memakan ruang yang setiap hari dibutuhkan judulnya. */}
            <div ref={menuRef} className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label={`Menu kolom ${column.title}`}
                title="Menu kolom"
                onClick={() => setMenuOpen((v) => !v)}
                className="grid size-6 cursor-pointer place-items-center rounded-full text-faint transition-colors hover:bg-line-soft hover:text-ink"
              >
                <MoreIcon />
              </button>

              {menuOpen && (
                <div
                  role="menu"
                  aria-label={`Menu kolom ${column.title}`}
                  /* Lebarnya dipatok supaya sepuluh titik warna melipat jadi dua
                     baris. Selebar isinya, deretan itu lebih lebar daripada
                     kolomnya sendiri dan menjulur keluar papan. */
                  className="sheet absolute top-full right-0 z-30 mt-2 w-52 rounded-2xl p-1.5"
                >
                  <MenuItem
                    icon={<EyeIcon watching={column.watching} className="size-5 shrink-0" />}
                    label={column.watching ? "Berhenti mengawasi" : "Awasi kolom"}
                    onClick={() => {
                      onWatchColumn(!column.watching);
                      setMenuOpen(false);
                    }}
                  />

                  <span className="my-1 block h-px bg-line-soft" />

                  {/* Judulnya menyebut warna yang sedang dipakai, karena di dalam
                      menu tidak ada lagi kenop berwarna yang menunjukkannya. */}
                  <div className="px-2.5 pt-0.5 pb-1.5">
                    <p className="mb-2 flex items-center gap-1.5 text-xs text-muted">
                      {/* `labelTint`, bukan `columnTint`: yang menggambar titik
                          ini adalah .label-dot, dan ia membaca `--label`.
                          `columnTint` menyetel `--col` — nama yang sengaja
                          berbeda supaya rona kolom tidak menetes ke chip label
                          di dalamnya — jadi dipasang di sini titiknya berakhir
                          tanpa isi. */}
                      <span
                        className={cn("label-dot size-3", column.color === null && "label-dot-none")}
                        style={column.color ? labelTint(column.color) : undefined}
                      />
                      Warna kolom
                    </p>

                    <ColorSwatches
                      clearable
                      value={column.color}
                      onChange={(color) => {
                        onRecolorColumn(color);
                        setMenuOpen(false);
                      }}
                    />
                  </div>

                  <span className="my-1 block h-px bg-line-soft" />

                  {/* Bertetangga dengan Hapus karena keduanya sama-sama
                      mengeluarkan kolom ini dari papan — tapi di atasnya, dan
                      tanpa warna bahaya: yang satu memindahkan, yang satu
                      mengakhiri. */}
                  <MenuItem
                    icon={<MoveOutIcon />}
                    label="Pindah ke papan lain…"
                    onClick={() => {
                      setMenuOpen(false);
                      onMoveColumn();
                    }}
                  />

                  <MenuItem
                    icon={<TrashIcon />}
                    label="Hapus kolom"
                    danger
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteColumn();
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <ul className="flex min-h-14 flex-1 flex-col gap-2 overflow-y-auto p-2">
          {column.cards.map((card) => (
            <CardItem
              key={card.id}
              card={card}
              labelsOpen={labelsOpen}
              onToggleLabels={onToggleLabels}
              onOpen={() => onOpenCard(card.id)}
              onDelete={() => onDeleteCard(card.id)}
            />
          ))}

          {/* Kartu yang dijatuhkan di ruang kosong kolom mendarat di kaki
              daftar, jadi lubangnya juga berdiri di kaki daftar. Ia elemen
              sungguhan di dalam aliran — di sini tidak ada sasaran yang bisa
              tergeser menjauh dari kursor, karena yang membuka lubangnya
              kolomnya sendiri dan kolom itu tidak ke mana-mana. */}
          {cardSlot !== null && (
            <li aria-hidden className="drop-ghost shrink-0" style={{ height: cardSlot }} />
          )}

          {/* Kolom kosong sudah punya bentuk penantiannya sendiri; selagi ada
              kartu yang melayang di atasnya, lubangnyalah yang menggantikan
              kalimat ini — dua kotak putus-putus bertumpuk cuma akan bertanya
              yang mana yang benar. */}
          {column.cards.length === 0 && cardSlot === null && (
            <li className="column-chrome rounded-xl border-2 border-dashed border-line px-3 py-6 text-center text-xs text-faint">
              Belum ada kartu
            </li>
          )}
        </ul>

        <div className="column-chrome px-3 pb-3">
          <AddItemForm placeholder="Tambah kartu…" submitLabel="Tambah Kartu" onSubmit={onAddCard} />
        </div>
      </section>
    </div>
  );
}
