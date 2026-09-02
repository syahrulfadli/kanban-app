import { DurableObject } from "cloudflare:workers";

export type BoardEvent =
  /** Isi board berubah — klien lain perlu menarik ulang datanya. */
  | { type: "board:changed"; origin: string | null; at: number }
  /** Jumlah orang yang sedang membuka board ini. */
  | { type: "presence"; count: number };

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
   */
  private broadcastPresence(excluding?: WebSocket): void {
    const sockets = this.ctx.getWebSockets().filter((socket) => socket !== excluding);
    const payload = JSON.stringify({ type: "presence", count: sockets.length });

    for (const socket of sockets) {
      try {
        socket.send(payload);
      } catch {
        // Koneksi mati; akan dibereskan oleh webSocketClose-nya sendiri.
      }
    }
  }
}
