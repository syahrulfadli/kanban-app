import { useEffect, useMemo, useRef, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { CardModal } from "./CardModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { ColumnView } from "./ColumnView";
import { AddItemForm } from "./AddItemForm";
import { useBoard } from "../hooks/useBoard";
import { useSession } from "../lib/auth-client";
import { navigate, paths } from "../lib/route";
import { cn } from "../lib/cn";
import type { ChannelStatus } from "../lib/realtime";
import { AppHeader } from "./AppHeader";
import { BoardSkeleton } from "./Skeleton";

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
    <span className="chip shrink-0" title={label}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "live" && "bg-ok",
          status === "connecting" && "animate-pulse bg-warn",
          status === "offline" && "bg-danger",
        )}
      />
      <span className="hidden sm:inline">{label}</span>
    </span>
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

  const askDeleteCard = (cardId: string) => {
    const card = board?.columns.flatMap((col) => col.cards).find((c) => c.id === cardId);
    if (card) setPending({ kind: "card", id: card.id, title: card.title });
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

        <LiveIndicator status={live.status} viewers={live.viewers} />
        {error && <span className="text-xs text-danger">{error}</span>}
      </AppHeader>

      {/* items-start: kolom setinggi isinya. Merentangkannya dulu punya alasan —
          cairan di dasar gelas harus berdiri di dasar papan — dan alasan itu
          sudah hilang bersama efeknya. `max-h-full` di kolom yang menahan
          kolom panjang supaya menggulir di dalam dirinya sendiri. */}
      <main className="flex flex-1 items-start gap-4 overflow-x-auto px-5 pt-1 pb-24">
        {board.columns.map((column) => (
          <ColumnView
            key={column.id}
            column={column}
            onAddCard={(title) => actions.addCard(column.id, title)}
            onRenameColumn={(title) => actions.renameColumn(column.id, title)}
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
          />
        ))}

        {/* Gelas kosong: hanya garis, menunggu diisi. */}
        <div className="glass-column h-fit w-72 shrink-0 border border-dashed border-line p-2">
          <AddItemForm
            placeholder="Nama kolom…"
            submitLabel="+ Tambah kolom"
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
          onBoardChange={() => void refresh()}
        />
      )}
    </div>
  );
}
