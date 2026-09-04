import { DurableObject } from "cloudflare:workers";
import type { UserBrief } from "../shared/types";

export type BoardEvent =
  /** Isi board berubah — klien lain perlu menarik ulang datanya. */
  | { type: "board:changed"; origin: string | null; at: number }
  /** Siapa saja yang sedang membuka board ini. */
  | { type: "presence"; count: number; viewers: UserBrief[] };

/**
 * Nama parameter yang membawa identitas penonton di URL upgrade.
 *
 * Isinya dipasang Worker dari sesi yang sudah diperiksa, bukan dikirim klien
 * (lihat routes/boards.ts) — daftar "siapa yang sedang di papan ini" tidak
 * boleh bisa diisi nama karangan oleh tab mana pun yang berhasil menyambung.
 */
export const VIEWER_PARAM = "viewer";

function readViewer(url: string): UserBrief | null {
  const raw = new URL(url).searchParams.get(VIEWER_PARAM);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as UserBrief;
  } catch {
    return null;
  }
}

/**
 * Satu Durable Object per board: menampung koneksi WebSocket para kolaborator
 * dan menyiarkan perubahan ke mereka.
 *
 * Memakai WebSocket Hibernation (ctx.acceptWebSocket) — bukan addEventListener —
 * supaya objek boleh dihibernasi saat sepi dan tidak menghabiskan kuota
 * duration selama koneksi menganggur.
 */
export class BoardRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Butuh koneksi WebSocket", { status: 426 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);

    /* Identitas ikut disimpan pada soketnya, bukan di state objek: lampiran
       ini selamat melewati hibernasi, sedangkan variabel di memori tidak. */
    server.serializeAttachment(readViewer(request.url));

    this.broadcastPresence();

    return new Response(null, { status: 101, webSocket: client });
  }

  /** Dipanggil lewat RPC dari Worker setiap kali board berubah. */
  broadcast(event: BoardEvent): void {
    const payload = JSON.stringify(event);

    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch {
        // Koneksi sudah mati; webSocketClose akan membereskannya.
      }
    }
  }

  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    // Klien mengirim ping berkala agar koneksi tidak diputus perantara.
    if (message === "ping") ws.send("pong");
  }

  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      // 1006 (abnormal) tidak boleh dipakai saat menutup secara eksplisit.
      ws.close(code === 1006 ? 1000 : code, reason);
    } catch {
      // Sisi lain sudah menutup duluan — tidak ada yang perlu dilakukan.
      // Tanpa penjagaan ini, lemparan di sini membatalkan siaran presence.
    }

    this.broadcastPresence(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.broadcastPresence(ws);
  }

  /**
   * Socket yang sedang ditutup masih ikut terhitung di getWebSockets(),
   * jadi ia harus dikecualikan agar hitungannya tidak kelebihan satu.
   *
   * Yang disiarkan orangnya, bukan koneksinya: satu orang yang membuka papan
   * di dua tab tetap satu orang di daftar, dan sebuah papan yang menyebut
   * "2 orang" padahal cuma satu justru mengabarkan kehadiran yang tidak ada.
   */
  private broadcastPresence(excluding?: WebSocket): void {
    const sockets = this.ctx.getWebSockets().filter((socket) => socket !== excluding);

    const viewers = new Map<string, UserBrief>();
    for (const socket of sockets) {
      const viewer = socket.deserializeAttachment() as UserBrief | null;
      if (viewer) viewers.set(viewer.id, viewer);
    }

    const event: BoardEvent = {
      type: "presence",
      // Soket dari sebelum identitas ikut dikirim tidak punya lampiran; di
      // papan yang isinya hanya soket seperti itu, hitungan koneksi masih
      // lebih benar daripada nol.
      count: viewers.size || sockets.length,
      viewers: [...viewers.values()],
    };
    const payload = JSON.stringify(event);

    for (const socket of sockets) {
      try {
        socket.send(payload);
      } catch {
        // Koneksi mati; akan dibereskan oleh webSocketClose-nya sendiri.
      }
    }
  }
}
