import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";
import { useDismiss } from "../hooks/useDismiss";
import { useNotifications } from "../hooks/useNotifications";
import { useSession } from "../lib/auth-client";
import { formatDateTime, formatRelative } from "../lib/format";
import { cn } from "../lib/cn";
import { navigate, paths } from "../lib/route";
import type { NotificationItem } from "../../shared/types";
import { InboxSkeleton } from "./Skeleton";

/* Lonceng garis untuk keadaan diam, lonceng padat saat panelnya terbuka.
   Bentuknya sama persis, hanya isinya yang berubah — jadi perpindahannya
   terbaca sebagai lampu yang menyala, bukan sebagai ikon yang berganti. */
const BELL_OUTLINE = (
  <path
    strokeLinecap="round"
    strokeLinejoin="round"
    d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
  />
);

const BELL_SOLID = (
  <path
    fillRule="evenodd"
    clipRule="evenodd"
    fill="currentColor"
    stroke="none"
    d="M5.25 9a6.75 6.75 0 0 1 13.5 0v.75c0 2.123.8 4.057 2.118 5.52a.75.75 0 0 1-.297 1.206c-1.544.57-3.16.99-4.831 1.243a3.75 3.75 0 1 1-7.48 0 24.585 24.585 0 0 1-4.831-1.244.75.75 0 0 1-.298-1.205A8.217 8.217 0 0 0 5.25 9.75V9Zm4.502 8.9a2.25 2.25 0 1 0 4.496 0 25.057 25.057 0 0 1-4.496 0Z"
  />
);

/** Lebih dari seratus tidak lagi bisa dibaca sebagai jumlah — cukup "99+". */
const badgeLabel = (unread: number) => (unread > 99 ? "99+" : String(unread));

/**
 * Satu baris kabar: pelakunya, kalimatnya, lalu asal dan umurnya.
 *
 * Kalimatnya berdiri sendiri — ia sudah menyebut kartu yang dibicarakan — jadi
 * tidak ada baris judul terpisah di atasnya. Nama papan tersimpan di `title`
 * untuk baris pertama notifikasi perangkat, dan di sini muncul sekali saja,
 * di baris jejak paling bawah.
 */
function Row({
  item,
  onOpen,
}: {
  item: NotificationItem;
  onOpen: (item: NotificationItem) => void;
}) {
  const unread = item.readAt === null;

  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className={cn(
        "flex w-full gap-2.5 rounded-xl px-2 py-2 text-left transition-colors",
        unread ? "bg-accent-soft/60 hover:bg-accent-soft" : "hover:bg-line-soft",
      )}
    >
      {item.actor ? (
        <Avatar person={item.actor} size="sm" />
      ) : (
        /* Pelakunya sudah keluar dari tim; kabarnya tetap berdiri. */
        <span className="avatar avatar-sm shrink-0" aria-hidden>
          ·
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-1.5">
          <span
            className={cn(
              "line-clamp-3 min-w-0 flex-1 text-sm leading-snug",
              unread ? "text-ink" : "text-ink-soft",
            )}
          >
            {item.body}
          </span>
          {unread && (
            <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
          )}
        </span>

        <span className="mt-1 block truncate text-[0.6875rem] text-faint">
          {item.boardTitle} ·{" "}
          <span title={formatDateTime(item.createdAt)}>{formatRelative(item.createdAt)}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * Lonceng di kapsul navigasi, beserta kotak masuknya.
 *
 * Panelnya mengambang di tengah dasar layar, sejajar dan sepersis panel
 * pencarian di sebelahnya. Yang menjelaskan asalnya bukan letaknya, melainkan
 * loncengnya sendiri: ikonnya memadat selama panel terbuka.
 */
export function NotificationBell() {
  const { data: session } = useSession();
  const inbox = useNotifications(Boolean(session));
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Isinya baru ditarik saat panelnya dibuka — di luar itu yang berjalan cuma
  // penghitung lencana, yang jauh lebih murah.
  const { refresh } = inbox;
  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  useDismiss(open, () => setOpen(false), [ref, panelRef]);

  // Pengunjung yang belum masuk tidak punya kotak masuk; loncengnya pun tidak.
  if (!session) return null;

  const openItem = (item: NotificationItem) => {
    void inbox.markRead([item.id]);
    setOpen(false);
    // Kartunya boleh sudah dihapus — kabarnya tetap membawa ke papannya.
    navigate(item.cardId ? paths.card(item.boardId, item.cardId) : paths.board(item.boardId));
  };

  const { filter, scopes } = inbox;
  const activeWorkspace = scopes.find((scope) => scope.workspaceId === filter.workspaceId);
  const boardOptions = activeWorkspace ? [activeWorkspace] : scopes;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={inbox.unread > 0 ? `Notifikasi, ${inbox.unread} belum dibaca` : "Notifikasi"}
        className={cn(
          "relative grid size-7 place-items-center rounded-full transition-colors",
          open ? "text-accent-ink" : "text-muted hover:text-ink-soft",
        )}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
        >
          {open ? BELL_SOLID : BELL_OUTLINE}
        </svg>

        {inbox.unread > 0 && (
          <span
            className="absolute -top-0.5 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[0.625rem] leading-none font-semibold text-accent-on tabular-nums"
            aria-hidden
          >
            {badgeLabel(inbox.unread)}
          </span>
        )}
      </button>

      {open &&
        /* Berlabuh ke layar dan selebar panel pencarian — bukan digantungkan
           pada loncengnya sendiri. Keduanya terbit dari kapsul yang sama dan
           berisi daftar yang sama panjangnya; panel yang satu sempit dan
           menempel ke kanan sementara yang lain lebar dan di tengah membuat
           kapsul itu terbaca seperti dua benda berbeda.

           Dipasang di <body> supaya keluar dari kapsul ber-frost: di dalamnya
           backdrop-filter tidak menghitung apa pun (lihat .sheet-frost). */
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Kotak masuk notifikasi"
            className="sheet sheet-frost fixed bottom-24 left-1/2 z-45 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl"
          >
            <div className="flex items-center gap-2 px-3 pt-3 pb-2">
              <h2 className="text-sm font-semibold tracking-tight">Notifikasi</h2>
              {inbox.unread > 0 && (
                <button
                  type="button"
                  onClick={() => void inbox.markAllRead()}
                  className="ml-auto text-xs text-muted transition-colors hover:text-accent-ink"
                >
                  Tandai terbaca
                </button>
              )}
            </div>

            {/* Penyaring. Papan mengikuti workspace yang dipilih; selama belum
                ada yang dipilih, semuanya tampil berkelompok per workspace. */}
            {scopes.length > 0 && (
              <div className="flex gap-2 px-3 pb-2">
                <select
                  aria-label="Saring menurut workspace"
                  value={filter.workspaceId ?? ""}
                  onChange={(e) =>
                    inbox.applyFilter(e.target.value ? { workspaceId: e.target.value } : {})
                  }
                  className="field min-w-0 flex-1 py-1.5 text-xs"
                >
                  <option value="">Semua workspace</option>
                  {scopes.map((scope) => (
                    <option key={scope.workspaceId} value={scope.workspaceId}>
                      {scope.workspaceName}
                      {scope.unread > 0 ? ` (${scope.unread})` : ""}
                    </option>
                  ))}
                </select>

                <select
                  aria-label="Saring menurut papan"
                  value={filter.boardId ?? ""}
                  onChange={(e) => {
                    const boardId = e.target.value;
                    if (!boardId) {
                      inbox.applyFilter(
                        filter.workspaceId ? { workspaceId: filter.workspaceId } : {},
                      );
                      return;
                    }
                    // Memilih papan ikut menetapkan workspace-nya, supaya kedua
                    // penyaring tidak pernah bercerita berbeda.
                    const owner = scopes.find((scope) =>
                      scope.boards.some((board) => board.id === boardId),
                    );
                    inbox.applyFilter({ workspaceId: owner?.workspaceId, boardId });
                  }}
                  className="field min-w-0 flex-1 py-1.5 text-xs"
                >
                  <option value="">Semua papan</option>
                  {boardOptions.map((scope) => (
                    <optgroup key={scope.workspaceId} label={scope.workspaceName}>
                      {scope.boards.map((board) => (
                        <option key={board.id} value={board.id}>
                          {board.title}
                          {board.unread > 0 ? ` (${board.unread})` : ""}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            )}

            <div className="max-h-[min(60vh,26rem)] overflow-y-auto px-1.5 pb-1.5 space-y-1">
              {inbox.loading && inbox.items.length === 0 ? (
                /* Hanya saat kotaknya benar-benar kosong. Kalau kabar lama masih
                   terpampang, penyegaran berjalan diam-diam di belakangnya —
                   mengganti yang sudah terbaca dengan kerangka justru membuat
                   panel berkedip setiap kali dibuka. */
                <InboxSkeleton />
              ) : inbox.error ? (
                <p className="px-2 py-6 text-center text-xs text-danger">{inbox.error}</p>
              ) : inbox.items.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs leading-relaxed text-muted">
                  {filter.workspaceId || filter.boardId
                    ? "Tidak ada notifikasi di penyaring ini."
                    : "Belum ada notifikasi. Kabar dari kartu yang Anda ikuti akan muncul di sini."}
                </p>
              ) : (
                <>
                  {inbox.items.map((item) => (
                    <Row key={item.id} item={item} onOpen={openItem} />
                  ))}

                  {/* Halaman berikutnya pun mendapat tempatnya lebih dulu, di
                      ujung daftar — persis di mana kabar-kabar itu akan berdiri.
                      Tombolnya tinggal padam; kalimatnya tidak perlu berubah
                      karena kerangkanya sudah mengatakan hal yang sama. */}
                  {inbox.loadingMore && <InboxSkeleton rows={2} />}

                  {inbox.hasMore && (
                    <button
                      type="button"
                      onClick={() => void inbox.loadMore()}
                      disabled={inbox.loadingMore}
                      className="mt-1 w-full rounded-xl px-2 py-2 text-xs text-muted transition-colors hover:bg-line-soft hover:text-ink-soft disabled:opacity-50"
                    >
                      Muat lebih banyak
                    </button>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
