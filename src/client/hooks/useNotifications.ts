import { useCallback, useEffect, useRef, useState } from "react";
import { api, type NotificationFilter } from "../lib/api";
import type { NotificationFeed, NotificationItem, NotificationScope } from "../../shared/types";

/**
 * Seberapa sering angka lencana ditanyakan ulang.
 *
 * Papan punya WebSocket-nya sendiri, tapi kotak masuk bukan milik satu papan —
 * ia mengikuti orangnya ke halaman mana pun. Membuka Durable Object kedua per
 * orang hanya demi satu angka tidak sepadan, jadi angkanya ditanyakan berkala:
 * satu query indeks, dan hanya selagi tabnya benar-benar dilihat.
 */
const POLL_MS = 60_000;

/** Penyaring yang sedang aktif. Kosong berarti seluruh kotak masuk. */
export interface InboxFilter {
  workspaceId?: string;
  boardId?: string;
}

const EMPTY_FEED: NotificationFeed = { items: [], unread: 0, scopes: [], nextCursor: null };

/**
 * @param enabled hanya sesi yang sudah login punya kotak masuk; sebelum itu
 *   tidak ada satu pun permintaan yang perlu berangkat.
 */
export function useNotifications(enabled: boolean) {
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [scopes, setScopes] = useState<NotificationScope[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<InboxFilter>({});
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const absorb = useCallback((feed: NotificationFeed) => {
    if (!alive.current) return;
    setItems(feed.items);
    setScopes(feed.scopes);
    setUnread(feed.unread);
    setCursor(feed.nextCursor);
  }, []);

  /** Tarik angka lencananya saja — inilah yang jalan di latar setiap menit. */
  const refreshCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const { unread: fresh } = await api.countUnreadNotifications();
      if (alive.current) setUnread(fresh);
    } catch {
      // Sekadar angka; kalau gagal, percobaan berikutnya sebentar lagi.
    }
  }, [enabled]);

  const load = useCallback(
    async (next: InboxFilter) => {
      if (!enabled) return;

      setLoading(true);
      setError(null);
      try {
        absorb(await api.getNotifications(next as NotificationFilter));
      } catch (e) {
        if (alive.current) {
          setError(e instanceof Error ? e.message : "Gagal memuat notifikasi");
          absorb(EMPTY_FEED);
        }
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [absorb, enabled],
  );

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;

    setLoadingMore(true);
    try {
      const feed = await api.getNotifications({ ...filter, cursor });
      if (!alive.current) return;
      // Halaman berikutnya disambung, bukan menggantikan — hanya daftarnya
      // yang bertambah; hitungan dan penyaringnya tetap milik tarikan pertama.
      setItems((prev) => [...prev, ...feed.items]);
      setCursor(feed.nextCursor);
      setUnread(feed.unread);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Gagal memuat notifikasi");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }, [cursor, filter, loadingMore]);

  const applyFilter = useCallback(
    (next: InboxFilter) => {
      setFilter(next);
      void load(next);
    },
    [load],
  );

  /** Muat ulang daftar dengan penyaring yang sedang berlaku. */
  const refresh = useCallback(() => load(filter), [filter, load]);

  const markRead = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;

    // Titik birunya padam seketika; kalau server menolak, hitungan berikutnya
    // yang membetulkan — bukan sesuatu yang layak dibatalkan di depan mata.
    const at = new Date().toISOString();
    setItems((prev) =>
      prev.map((item) => (ids.includes(item.id) && !item.readAt ? { ...item, readAt: at } : item)),
    );

    try {
      const { unread: fresh } = await api.markNotificationsRead(ids);
      if (alive.current) setUnread(fresh);
    } catch {
      // Diamkan: tanda baca bukan perubahan yang perlu diadukan ke pengguna.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const at = new Date().toISOString();
    setItems((prev) => prev.map((item) => (item.readAt ? item : { ...item, readAt: at })));
    setScopes((prev) =>
      prev.map((scope) => ({
        ...scope,
        unread: 0,
        boards: scope.boards.map((board) => ({ ...board, unread: 0 })),
      })),
    );

    try {
      const { unread: fresh } = await api.markAllNotificationsRead(filter as NotificationFilter);
      if (alive.current) setUnread(fresh);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Gagal menandai terbaca");
    }
  }, [filter]);

  /* Angka lencana: sekali saat dibuka, lalu berkala — dan segera saat tabnya
     kembali dilihat, karena selama tersembunyi jam berhenti berdetak. */
  useEffect(() => {
    if (!enabled) {
      setUnread(0);
      return;
    }

    void refreshCount();

    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void refreshCount();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);

    /* Service worker meneruskan setiap push yang mendarat, jadi bagi perangkat
       yang mengizinkan notifikasi lencananya bergerak seketika — tidak perlu
       menunggu detik ke-60. */
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type === "notification") void refreshCount();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [enabled, refreshCount]);

  return {
    unread,
    items,
    scopes,
    filter,
    loading,
    loadingMore,
    error,
    hasMore: cursor !== null,
    applyFilter,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  };
}
