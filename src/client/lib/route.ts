import { useSyncExternalStore } from "react";

/** Router hash minimal — cukup untuk jumlah halaman saat ini. */
export type Route =
  | { name: "workspaces" }
  | { name: "workspace"; workspaceId: string }
  | { name: "members"; workspaceId: string }
  | { name: "board"; boardId: string }
  | { name: "invite"; token: string };

function parse(hash: string): Route {
  const path = hash.replace(/^#/, "");

  const board = path.match(/^\/board\/([^/]+)$/);
  if (board) return { name: "board", boardId: board[1] };

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
  board: (id: string) => `#/board/${id}`,
};

export const navigate = (path: string) => {
  window.location.hash = path.replace(/^#/, "");
};
