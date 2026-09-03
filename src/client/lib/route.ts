import { useSyncExternalStore } from "react";

/** Router hash minimal — cukup untuk jumlah halaman saat ini. */
export type Route =
  | { name: "workspaces" }
  | { name: "workspace"; workspaceId: string }
  | { name: "members"; workspaceId: string }
  | { name: "settings" }
  /** Halaman masuk/daftar. Hanya berarti selagi belum ada sesi. */
  | { name: "auth"; mode: "login" | "register" }
  /** `cardId` ada kalau alamatnya menunjuk satu kartu — dari notifikasi, misalnya. */
  | { name: "board"; boardId: string; cardId?: string }
  | { name: "invite"; token: string };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "");

  /* Bentuk /board/:id/card/:cardId disusun server untuk tautan notifikasi
     (lihat src/worker/notify.ts) — kalau salah satunya berubah, ubah keduanya. */
  const board = path.match(/^\/board\/([^/]+)(?:\/card\/([^/]+))?$/);
  if (board) return { name: "board", boardId: board[1], cardId: board[2] };

  if (path === "/settings") return { name: "settings" };

  if (path === "/masuk") return { name: "auth", mode: "login" };
  if (path === "/daftar") return { name: "auth", mode: "register" };

  const invite = path.match(/^\/invite\/([^/]+)$/);
  if (invite) return { name: "invite", token: invite[1] };

  const members = path.match(/^\/w\/([^/]+)\/members$/);
  if (members) return { name: "members", workspaceId: members[1] };

  const workspace = path.match(/^\/w\/([^/]+)$/);
  if (workspace) return { name: "workspace", workspaceId: workspace[1] };

  return { name: "workspaces" };
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => "",
  );

  return parse(hash);
}

export const paths = {
  workspaces: "#/",
  workspace: (id: string) => `#/w/${id}`,
  members: (id: string) => `#/w/${id}/members`,
  settings: "#/settings",
  masuk: "#/masuk",
  daftar: "#/daftar",
  board: (id: string) => `#/board/${id}`,
  /* Alamat satu kartu. Bentuknya harus sama dengan yang disusun
     src/worker/notify.ts untuk tautan notifikasi. */
  card: (boardId: string, cardId: string) => `#/board/${boardId}/card/${cardId}`,
};

/* `replace` untuk perpindahan yang tidak layak jadi langkah riwayat sendiri —
   menutup kartu, misalnya. `replaceState` tidak memicu `hashchange`, jadi
   router memberi tahu langganannya sendiri. */
export const navigate = (path: string, options?: { replace?: boolean }) => {
  const hash = `#${path.replace(/^#/, "")}`;

  if (options?.replace) {
    history.replaceState(null, "", hash);
    window.dispatchEvent(new Event("hashchange"));
    return;
  }

  window.location.hash = hash.slice(1);
};
