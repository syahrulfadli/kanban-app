import type {
  Board,
  BoardDetail,
  Card,
  Column,
  Invitation,
  InvitationCreated,
  InvitePreview,
  MemberSummary,
  Role,
  WorkspaceSummary,
} from "../../shared/types";
import { CLIENT_ID, CLIENT_ID_HEADER } from "./realtime";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      [CLIENT_ID_HEADER]: CLIENT_ID,
    },
  });

  if (!res.ok) {
    const message = await res
      .json()
      .then((body) => (body as { error?: string }).error)
      .catch(() => null);
    throw new Error(message ?? `Permintaan gagal (${res.status})`);
  }

  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const send = <T,>(path: string, method: string, body?: unknown) =>
  request<T>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  getConfig: () => request<{ providers: string[] }>("/config"),

  /* workspace */
  listWorkspaces: () => request<WorkspaceSummary[]>("/workspaces"),
  createWorkspace: (name: string) => send<WorkspaceSummary>("/workspaces", "POST", { name }),
  renameWorkspace: (id: string, name: string) => send<void>(`/workspaces/${id}`, "PATCH", { name }),
  deleteWorkspace: (id: string) => send<void>(`/workspaces/${id}`, "DELETE"),

  /* anggota */
  listMembers: (workspaceId: string) =>
    request<MemberSummary[]>(`/workspaces/${workspaceId}/members`),
  changeRole: (workspaceId: string, userId: string, role: Role) =>
    send<void>(`/workspaces/${workspaceId}/members/${userId}`, "PATCH", { role }),
  removeMember: (workspaceId: string, userId: string) =>
    send<void>(`/workspaces/${workspaceId}/members/${userId}`, "DELETE"),

  /* undangan */
  listInvitations: (workspaceId: string) =>
    request<Invitation[]>(`/workspaces/${workspaceId}/invitations`),
  invite: (workspaceId: string, email: string, role: Role) =>
    send<InvitationCreated>(`/workspaces/${workspaceId}/invitations`, "POST", { email, role }),
  revokeInvitation: (id: string) => send<void>(`/invitations/${id}`, "DELETE"),
  previewInvitation: (token: string) => request<InvitePreview>(`/invitations/${token}`),
  acceptInvitation: (token: string) =>
    send<{ workspaceId: string; workspaceName: string }>(`/invitations/${token}/accept`, "POST"),

  /* board */
  listBoards: (workspaceId: string) =>
    request<Board[]>(`/boards?workspaceId=${encodeURIComponent(workspaceId)}`),
  createBoard: (workspaceId: string, title: string) =>
    send<Board>("/boards", "POST", { workspaceId, title }),
  getBoard: (id: string) => request<BoardDetail>(`/boards/${id}`),
  renameBoard: (id: string, title: string) => send<Board>(`/boards/${id}`, "PATCH", { title }),
  deleteBoard: (id: string) => send<void>(`/boards/${id}`, "DELETE"),

  /* kolom & kartu */
  createColumn: (boardId: string, title: string) =>
    send<Column>("/columns", "POST", { boardId, title }),
  renameColumn: (id: string, title: string) => send<Column>(`/columns/${id}`, "PATCH", { title }),
  moveColumn: (id: string, index: number) => send<Column>(`/columns/${id}/move`, "POST", { index }),
  deleteColumn: (id: string) => send<void>(`/columns/${id}`, "DELETE"),

  createCard: (columnId: string, title: string) =>
    send<Card>("/cards", "POST", { columnId, title }),
  updateCard: (id: string, patch: { title?: string; description?: string | null }) =>
    send<Card>(`/cards/${id}`, "PATCH", patch),
  moveCard: (id: string, columnId: string, index: number) =>
    send<Card>(`/cards/${id}/move`, "POST", { columnId, index }),
  deleteCard: (id: string) => send<void>(`/cards/${id}`, "DELETE"),
};
