import { useEffect, useRef, useState } from "react";
import type { UserBrief } from "../../shared/types";

/**
 * Id koneksi tab ini. Dikirim di header pada setiap request yang mengubah data,
 * lalu ikut disiarkan balik — sehingga tab asal bisa mengabaikan gema
 * perubahannya sendiri dan tidak menimpa state optimistiknya.
 */
export const CLIENT_ID = crypto.randomUUID();

export const CLIENT_ID_HEADER = "X-Client-Id";

type BoardEvent =
  | { type: "board:changed"; origin: string | null; at: number }
  | { type: "presence"; count: number; viewers: UserBrief[] };

export type ChannelStatus = "connecting" | "live" | "offline";

const PING_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 15_000;

/**
 * Batas percobaan sambung ulang (~2 menit dengan backoff di atas).
 * Tanpa batas, klien yang aksesnya dicabut akan mencoba selamanya.
 */
const MAX_ATTEMPTS = 10;

/** Langganan perubahan board dari kolaborator lain. */
export function useBoardChannel(boardId: string, onRemoteChange: () => void) {
  const [status, setStatus] = useState<ChannelStatus>("connecting");

  /* Siapa saja yang sedang membuka papan ini — termasuk diri sendiri. Kosong
     selama belum ada kabar dari server; yang membaca daftar ini tahu bahwa
     dirinya sendiri selalu ada di papan, jadi tidak ada gunanya menebak satu
     orang palsu sebagai isi awal. */
  const [viewers, setViewers] = useState<UserBrief[]>([]);

  // Callback dibaca lewat ref supaya koneksi tidak dibuka ulang tiap render.
  const handler = useRef(onRemoteChange);
  handler.current = onRemoteChange;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let disposed = false;
    let attempt = 0;
    let ping: ReturnType<typeof setInterval> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}/api/boards/${boardId}/ws`);

      socket.onopen = () => {
        attempt = 0;
        setStatus("live");
        // Ping berkala menahan perantara memutus koneksi yang menganggur.
        ping = setInterval(() => socket?.send("ping"), PING_INTERVAL_MS);
      };

      socket.onmessage = (e) => {
        if (e.data === "pong") return;

        const event = JSON.parse(e.data as string) as BoardEvent;

        if (event.type === "presence") {
          setViewers(event.viewers);
        } else if (event.origin !== CLIENT_ID) {
          handler.current();
        }
      };

      socket.onerror = () => socket?.close();

      socket.onclose = () => {
        clearInterval(ping);
        if (disposed) return;

        setStatus("offline");
        attempt += 1;
        if (attempt > MAX_ATTEMPTS) return;

        retry = setTimeout(connect, Math.min(500 * 2 ** attempt, MAX_BACKOFF_MS));
      };
    };

    connect();

    return () => {
      disposed = true;
      clearInterval(ping);
      clearTimeout(retry);
      socket?.close();
    };
  }, [boardId]);

  return { status, viewers };
}
