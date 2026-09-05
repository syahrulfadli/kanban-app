import { useCallback, useEffect, useRef, useState } from "react";
import { api, type NotificationFilter } from "../lib/api";
import { isSoundEnabled, playNotificationSound } from "./useSound";
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

  /**
   * Satu-satunya pintu masuk angka lencana — dan karena itu satu-satunya tempat
   * yang tahu angkanya baru saja naik. Naik berarti ada kabar yang belum pernah
   * dilihat orangnya, dan itulah yang dibunyikan.
   *
   * Angka pertama tidak pernah membunyikan apa pun: saat aplikasinya baru
   * dibuka, tumpukan kabar kemarin bukan sesuatu yang baru datang.
   */
  const seen = useRef<number | null>(null);

  /* Sekali pakai: menahan nada untuk satu pembaruan angka berikutnya. Dipasang
     saat kabarnya datang lewat push, yang sudah dibunyikan sistem operasi. */
  const silence = useRef(false);

  const noteUnread = useCallback((next: number) => {
    if (!alive.current) return;

    const before = seen.current;
    const quiet = silence.current;
    seen.current = next;
    silence.current = false;
    setUnread(next);

    if (!quiet && before !== null && next > before) playNotificationSound();
  }, []);

  const absorb = useCallback(
    (feed: NotificationFeed) => {
      if (!alive.current) return;
      setItems(feed.items);
      setScopes(feed.scopes);
      noteUnread(feed.unread);
      setCursor(feed.nextCursor);
    },
    [noteUnread],
  );

  /** Tarik angka lencananya saja — inilah yang jalan di latar setiap menit. */
  const refreshCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const { unread: fresh } = await api.countUnreadNotifications();
      noteUnread(fresh);
    } catch {
      // Sekadar angka; kalau gagal, percobaan berikutnya sebentar lagi.
    }
  }, [enabled, noteUnread]);

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
          /* Nol di sini bukan kabar yang habis dibaca, melainkan daftar yang
             gagal dimuat. Kalau ia dibiarkan jadi pembanding, tarikan berikutnya
             yang mengembalikan angka aslinya akan terbaca sebagai kabar baru dan
             berbunyi tanpa ada yang datang. */
          seen.current = null;
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
      noteUnread(feed.unread);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Gagal memuat notifikasi");
    } finally {
      if (alive.current) setLoadingMore(false);
    }
  }, [cursor, filter, loadingMore, noteUnread]);

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
      noteUnread(fresh);
    } catch {
      // Diamkan: tanda baca bukan perubahan yang perlu diadukan ke pengguna.
    }
  }, [noteUnread]);

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
      noteUnread(fresh);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Gagal menandai terbaca");
    }
  }, [filter, noteUnread]);

  /* Angka lencana: sekali saat dibuka, lalu berkala — dan segera saat tabnya
     kembali dilihat, karena tab yang tersembunyi bisa saja ketinggalan. */
  useEffect(() => {
    if (!enabled) {
      // Sesi berikutnya mulai dari nol lagi: angka milik orang sebelumnya tidak
      // boleh jadi pembanding yang membunyikan lonceng palsu.
      seen.current = null;
      setUnread(0);
      return;
    }

    void refreshCount();

    const tick = setInterval(() => {
      /* Selagi tabnya dilihat, yang ditanyakan adalah angka untuk lencananya.
         Selagi tersembunyi, lencananya tidak dilihat siapa pun — satu-satunya
         alasan tetap bertanya adalah nada yang harus berbunyi saat kabarnya
         datang, dan justru saat itulah nada paling dibutuhkan: orangnya sedang
         di tab lain. Kalau nadanya dimatikan, tab tersembunyi kembali diam dan
         tidak meminta apa pun sampai orangnya kembali. */
      if (document.visibilityState === "visible" || isSoundEnabled()) void refreshCount();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);

    /* Service worker meneruskan setiap push yang mendarat, jadi bagi perangkat
       yang mengizinkan notifikasi lencananya bergerak seketika — tidak perlu
       menunggu detik ke-60. */
    const onMessage = (event: MessageEvent) => {
      if ((event.data as { type?: string } | null)?.type !== "notification") return;

      /* Kabar yang datang lewat push sudah muncul sebagai notifikasi perangkat,
         lengkap dengan bunyinya sendiri. Menambah nada di dalam aplikasi
         membuat satu kabar yang sama berbunyi dua kali. */
      silence.current = true;
      void refreshCount();
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
