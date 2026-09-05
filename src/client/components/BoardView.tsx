import { useEffect, useMemo, useRef, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { CardModal } from "./CardModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveDialog, type MoveSubject } from "./MoveDialog";
import { ColumnView } from "./ColumnView";
import { AddItemForm } from "./AddItemForm";
import { useBoard } from "../hooks/useBoard";
import { useCollapsedColumns } from "../hooks/useCollapsedColumns";
import { playDropSound } from "../hooks/useSound";
import { useSession } from "../lib/auth-client";
import { navigate, paths } from "../lib/route";
import { cn } from "../lib/cn";
import type { ChannelStatus } from "../lib/realtime";
import type { UserBrief } from "../../shared/types";
import { Avatar } from "./Avatar";
import { AppHeader } from "./AppHeader";
import { BoardSkeleton } from "./Skeleton";

/**
 * Penanda kanal realtime, di ujung kanan kepala papan.
 *
 * Sendirian ia cuma keterangan: satu titik dan satu kata tentang koneksi.
 * Begitu ada orang lain di papan yang sama, keterangan itu punya isi yang
 * bisa ditanyakan — siapa — jadi ia berubah jadi tombol yang membuka
 * daftarnya. Tidak ada tombol tambahan yang muncul di kepala papan untuk itu:
 * yang menjawab "siapa yang di sini" adalah penanda yang sudah mengatakan
 * "ada yang di sini".
 */
function LiveIndicator({
  status,
  viewers,
  meId,
}: {
  status: ChannelStatus;
  viewers: UserBrief[];
  meId?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const people = viewers.length;
  /* Sendirian, tidak ada daftar yang layak dibuka — "siapa saja di papan ini"
     yang jawabannya cuma diri sendiri bukan pertanyaan. */
  const shared = status === "live" && people > 1;

  const label =
    status === "live"
      ? people > 1
        ? `${people} orang di board ini`
        : "Terhubung"
      : status === "connecting"
        ? "Menyambungkan…"
        : "Terputus — mencoba lagi";

  // Orang terakhir pergi selagi daftarnya terbuka: daftarnya ikut tutup,
  // bukan menggantung berisi satu nama.
  useEffect(() => {
    if (!shared) setOpen(false);
  }, [shared]);

  /* Pola yang sama dengan menu kolom dan menu profil: `pointerdown`, bukan
     `click`, supaya daftarnya sudah tertutup sebelum kliknya mendarat. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const dot = (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "live" && "bg-ok",
        status === "connecting" && "animate-pulse bg-warn",
        status === "offline" && "bg-danger",
      )}
    />
  );

  if (!shared) {
    return (
      <span className="chip shrink-0" title={label}>
        {dot}
        <span className="hidden sm:inline">{label}</span>
      </span>
    );
  }

  return (
    <div ref={ref} className="relative shrink-0">
      {/* Di layar sempit kalimatnya tidak muat, dan sebuah titik sendirian
          tidak terbaca sebagai sesuatu yang bisa diketuk — jadi yang tersisa
          di sana angkanya, bukan tidak ada apa-apa. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${label} — lihat siapa saja`}
        title={label}
        className="chip cursor-pointer transition-colors hover:bg-line-soft"
      >
        {dot}
        <span className="hidden sm:inline">{label}</span>
        <span className="tabular-nums sm:hidden">{people}</span>
      </button>

      {open && (
        <div className="sheet absolute top-full right-0 z-30 mt-2 w-56 rounded-2xl p-1.5">
          <p className="px-2.5 py-1.5 text-xs text-muted">Sedang membuka papan ini</p>

          <ul className="flex flex-col">
            {viewers.map((viewer) => (
              <li key={viewer.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5">
                <Avatar person={viewer} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{viewer.name}</span>
                {viewer.id === meId && <span className="shrink-0 text-xs text-faint">Anda</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Apa yang sedang ditanyakan dialog penegasan — sekaligus isi kalimatnya. */
type Pending =
  | { kind: "column"; id: string; title: string; cards: number }
  | { kind: "card"; id: string; title: string };

interface BoardProps {
  boardId: string;
  /** Kartu yang disebut alamat — dialog yang terbuka selalu berasal dari sini. */
  openCardId?: string;
}

export function BoardView({ boardId, openCardId }: BoardProps) {
  const { board, loading, error, refresh, actions, live } = useBoard(boardId);
  const { data: session } = useSession();

  /* Kolom mana yang disusutkan hanya urusan layar ini — simpanannya di
     peramban, bukan di papan. */
  const columnIds = useMemo(() => (board?.columns ?? []).map((c) => c.id), [board]);
  const { collapsed, toggle: toggleCollapse } = useCollapsedColumns(boardId, columnIds);

  /* Kartu yang terbuka tinggal di alamat, bukan di state: satu-satunya cara
     membuka dialog adalah pindah ke alamat kartunya. Harganya satu langkah
     riwayat per kartu — dan itu justru yang diinginkan, karena alamatnya jadi
     bisa disalin, dibagikan, dan ditutup dengan tombol kembali.

     Langkah yang dibuat sendiri itu dimakan kembali saat dialognya ditutup;
     kalau alamat kartunya datang dari luar — tautan yang dibagikan, notifikasi
     yang diketuk — tidak ada langkah yang boleh dimakan, jadi alamat papan
     menggantikannya di tempat. */
  const pushedCardId = useRef<string | null>(null);

  const openCard = (cardId: string) => {
    pushedCardId.current = cardId;
    navigate(paths.card(boardId, cardId));
  };

  const leaveCard = () => {
    const pushed = pushedCardId.current;
    pushedCardId.current = null;

    if (pushed && pushed === openCardId) history.back();
    else navigate(paths.board(boardId), { replace: true });
  };

  /* Tombol kembali juga menutup dialog — dan langkah yang tadi dibuat sudah
     habis terpakai, jadi catatannya ikut dibuang. */
  useEffect(() => {
    if (!openCardId) pushedCardId.current = null;
  }, [openCardId]);

  /* Satu dialog untuk seluruh papan, bukan satu per kartu: yang bisa ditanya
     hanya satu pada satu waktu. */
  const [pending, setPending] = useState<Pending | null>(null);

  /* Begitu juga pemilih papan tujuan — dan ia tinggal di sini, bukan di kolom
     atau di dialog kartu, karena yang berubah setelahnya adalah papan ini:
     yang dipindahkan lenyap dari layar. */
  const [moving, setMoving] = useState<MoveSubject | null>(null);

  /* Nama label dibuka sepapan sekaligus, bukan per kartu.

     Nama label baru berguna kalau bisa dibandingkan — "mana saja yang
     Mendesak" adalah pertanyaan tentang papan, bukan tentang satu kartu — dan
     satu kartu yang mekar sendirian di antara kartu-kartu berpotongan warna
     justru terbaca sebagai kartu yang sedang disorot, bukan sebagai nama yang
     sedang dibaca.

     Tinggal di sini, bukan di modul: papan yang ditinggalkan sebaiknya
     kembali ke keadaan istirahatnya, dan BoardView memang sudah dipasang
     ulang tiap ganti board. */
  const [labelsOpen, setLabelsOpen] = useState(false);

  const askDeleteCard = (cardId: string) => {
    const card = board?.columns.flatMap((col) => col.cards).find((c) => c.id === cardId);
    if (card) setPending({ kind: "card", id: card.id, title: card.title });
  };

  const askMoveCard = (cardId: string) => {
    const card = board?.columns.flatMap((col) => col.cards).find((c) => c.id === cardId);
    if (card) setMoving({ kind: "card", id: card.id, title: card.title });
  };

  const confirmMove = async (target: { boardId: string; columnId: string | null }) => {
    if (!moving) return;

    if (moving.kind === "column") await actions.transferColumn(moving.id, target.boardId);
    else await actions.transferCard(moving.id, target.columnId!);

    /* Dialognya baru ditutup setelah servernya menjawab — kalau ia menolak,
       kegagalannya harus terbaca di tempat pilihannya dibuat, bukan sebagai
       kalimat merah di kepala papan setelah dialognya lenyap. */
    setMoving(null);
  };

  const confirmDelete = () => {
    if (!pending) return;
    if (pending.kind === "card") actions.deleteCard(pending.id);
    else actions.deleteColumn(pending.id);
    setPending(null);
  };

  // Kartu yang sedang dibuka dicari ulang dari board setiap render: kalau
  // kolaborator lain menghapusnya, dialognya ikut tertutup dengan sendirinya.
  const open = useMemo(() => {
    if (!openCardId || !board) return null;

    for (const column of board.columns) {
      if (column.cards.some((card) => card.id === openCardId)) {
        return { cardId: openCardId, columnTitle: column.title };
      }
    }
    return null;
  }, [board, openCardId]);

  useEffect(() => {
    if (openCardId && board && !open) {
      pushedCardId.current = null;
      navigate(paths.board(boardId), { replace: true });
    }
  }, [board, boardId, open, openCardId]);

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

        /* Klik pendek begitu benda yang digenggam mendarat — jawaban atas
           gerakan tangan, bukan atas apa yang berubah di papan. Karena itu ia
           berbunyi juga saat kartunya dikembalikan ke tempatnya semula, dan
           tidak berbunyi sama sekali saat seretnya dibatalkan di luar papan:
           yang dijawab pertanyaan "sudah lepas?", bukan "jadi pindah?" —
           dan diam setelah melepas kartu terbaca sebagai aplikasi yang tidak
           menangkap gerakannya. */
        playDropSound();

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

  // Kerangkanya membawa breadcrumb-nya sendiri, jadi kepala halaman tidak
  // muncul belakangan dan mendorong papan ke bawah.
  if (loading) return <BoardSkeleton />;

  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="glass glass-frost rounded-2xl p-6 text-center">
          <p className="text-sm text-danger">{error ?? "Board tidak ditemukan."}</p>
          <button
            onClick={() => navigate(paths.workspaces)}
            className="btn btn-glass mt-4"
          >
            ← Kembali ke daftar workspace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <AppHeader>
        <span className="text-faint">/</span>
        <button
          onClick={() => navigate(paths.workspace(board.workspaceId))}
          className="text-sm text-muted hover:text-ink"
        >
          Board
        </button>
        <span className="text-faint">/</span>
        <h1 className="min-w-0 truncate text-sm font-medium">{board.title}</h1>

        {/* Berlabuh di ujung kanan kepala papan, bukan menempel di belakang
            judul: tempatnya jadi tetap — tidak bergeser mengikuti panjang nama
            papan — dan sudut itu memang sudut keterangan, bukan sudut isi. */}
        <span className="ml-auto flex min-w-0 items-center gap-2">
          {error && <span className="min-w-0 truncate text-xs text-danger">{error}</span>}
          <LiveIndicator
            status={live.status}
            viewers={live.viewers}
            meId={session?.user.id}
          />
        </span>
      </AppHeader>

      {/* items-start: kolom setinggi isinya. Merentangkannya dulu punya alasan —
          cairan di dasar gelas harus berdiri di dasar papan — dan alasan itu
          sudah hilang bersama efeknya. `max-h-full` di kolom yang menahan
          kolom panjang supaya menggulir di dalam dirinya sendiri. */}
      <main className="flex flex-1 items-start gap-4 overflow-x-auto px-5 pt-1 pb-24">
        {board.columns.map((column, i) => (
          <ColumnView
            key={column.id}
            column={column}
            prevColumnId={board.columns[i - 1]?.id ?? null}
            nextColumnId={board.columns[i + 1]?.id ?? null}
            collapsed={collapsed.has(column.id)}
            onToggleCollapse={() => toggleCollapse(column.id)}
            onAddCard={(title) => actions.addCard(column.id, title)}
            onRenameColumn={(title) => actions.renameColumn(column.id, title)}
            onRecolorColumn={(color) => actions.recolorColumn(column.id, color)}
            onWatchColumn={(watching) => void actions.watchColumn(column.id, watching)}
            onMoveColumn={() =>
              setMoving({
                kind: "column",
                id: column.id,
                title: column.title,
                cards: column.cards.length,
              })
            }
            onDeleteColumn={() =>
              setPending({
                kind: "column",
                id: column.id,
                title: column.title,
                cards: column.cards.length,
              })
            }
            onOpenCard={openCard}
            onDeleteCard={askDeleteCard}
            labelsOpen={labelsOpen}
            onToggleLabels={() => setLabelsOpen((v) => !v)}
          />
        ))}

        {/* Gelas kosong: hanya garis, menunggu diisi. */}
        <div className="glass-column h-fit w-72 shrink-0 border border-dashed border-line p-2">
          <AddItemForm
            placeholder="Nama kolom…"
            submitLabel="Tambah kolom"
            onSubmit={actions.addColumn}
          />
        </div>
      </main>

      {pending && (
        <ConfirmDialog
          title={pending.kind === "card" ? "Hapus kartu?" : "Hapus kolom?"}
          body={
            pending.kind === "card" ? (
              <>
                “{pending.title}” akan dihapus bersama checklist, label, dan followup-nya.
              </>
            ) : (
              <>
                “{pending.title}” akan dihapus
                {pending.cards > 0 && <> bersama {pending.cards} kartu di dalamnya</>}. Kolom yang
                terhapus tidak bisa dipulihkan setelah jendela urung tutup.
              </>
            )
          }
          confirmLabel={pending.kind === "card" ? "Hapus kartu" : "Hapus kolom"}
          onConfirm={confirmDelete}
          onCancel={() => setPending(null)}
        />
      )}

      {open && session && (
        <CardModal
          key={open.cardId}
          cardId={open.cardId}
          boardLabels={board.labels}
          columnTitle={open.columnTitle}
          shareUrl={`${location.origin}${location.pathname}${paths.card(boardId, open.cardId)}`}
          currentUser={{ ...session.user, image: session.user.image ?? null }}
          onClose={leaveCard}
          onMove={() => askMoveCard(open.cardId)}
          onBoardChange={() => void refresh()}
        />
      )}

      {moving && (
        <MoveDialog
          subject={moving}
          boardId={boardId}
          onCancel={() => setMoving(null)}
          onMove={confirmMove}
        />
      )}
    </div>
  );
}
