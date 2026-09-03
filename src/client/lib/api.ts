import type {
  AvatarMime,
  Board,
  BoardDetail,
  Card,
  CardCommentDetail,
  CardDetail,
  CardSummary,
  ChecklistItem,
  Column,
  Invitation,
  InvitationCreated,
  InvitePreview,
  Label,
  LabelColor,
  MemberSummary,
  NotificationFeed,
  NotificationSettings,
  PushSettings,
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

const send = <T,>(path: string, method: string, body?: unknown, init?: RequestInit) =>
  request<T>(path, {
    ...init,
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

/**
 * Hanya dipakai penghapusan: `keepalive` menahan request tetap terkirim walau
 * tab ditutup di tengah jendela urung — lihat UndoProvider.
 */
type SendOptions = { keepalive?: boolean };

/** Penyaring kotak masuk; field yang kosong tidak ikut dikirim. */
export interface NotificationFilter {
  workspaceId?: string;
  boardId?: string;
  cursor?: string;
}

const queryString = (params: NotificationFilter) => {
  const search = new URLSearchParams(
    Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  return search.size > 0 ? `?${search}` : "";
};

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
  deleteBoard: (id: string, options?: SendOptions) =>
    send<void>(`/boards/${id}`, "DELETE", undefined, options),

  /* kolom & kartu */
  createColumn: (boardId: string, title: string) =>
    send<Column>("/columns", "POST", { boardId, title }),
  renameColumn: (id: string, title: string) => send<Column>(`/columns/${id}`, "PATCH", { title }),
  moveColumn: (id: string, index: number) => send<Column>(`/columns/${id}/move`, "POST", { index }),
  deleteColumn: (id: string, options?: SendOptions) =>
    send<void>(`/columns/${id}`, "DELETE", undefined, options),

  createCard: (columnId: string, title: string) =>
    send<CardSummary>("/cards", "POST", { columnId, title }),
  getCard: (id: string) => request<CardDetail>(`/cards/${id}`),
  updateCard: (id: string, patch: { title?: string; description?: string | null }) =>
    send<Card>(`/cards/${id}`, "PATCH", patch),
  moveCard: (id: string, columnId: string, index: number) =>
    send<Card>(`/cards/${id}/move`, "POST", { columnId, index }),
  deleteCard: (id: string, options?: SendOptions) =>
    send<void>(`/cards/${id}`, "DELETE", undefined, options),

  /* label — miliknya board, dipasang ke kartu */
  createLabel: (boardId: string, name: string, color: LabelColor) =>
    send<Label>("/labels", "POST", { boardId, name, color }),
  updateLabel: (id: string, patch: { name?: string; color?: LabelColor }) =>
    send<Label>(`/labels/${id}`, "PATCH", patch),
  deleteLabel: (id: string) => send<void>(`/labels/${id}`, "DELETE"),
  attachLabel: (cardId: string, labelId: string) =>
    send<Label>(`/cards/${cardId}/labels`, "POST", { labelId }),
  detachLabel: (cardId: string, labelId: string) =>
    send<void>(`/cards/${cardId}/labels/${labelId}`, "DELETE"),

  /* followup */
  addComment: (cardId: string, body: string) =>
    send<CardCommentDetail>(`/cards/${cardId}/comments`, "POST", { body }),
  updateComment: (id: string, body: string) =>
    send<CardCommentDetail>(`/cards/comments/${id}`, "PATCH", { body }),
  deleteComment: (id: string) => send<void>(`/cards/comments/${id}`, "DELETE"),

  /* kotak masuk notifikasi */
  getNotifications: (filter: NotificationFilter = {}) =>
    request<NotificationFeed>(`/notifications${queryString(filter)}`),
  countUnreadNotifications: () => request<{ unread: number }>("/notifications/count"),
  markNotificationsRead: (ids: string[]) =>
    send<{ unread: number }>("/notifications/read", "POST", { ids }),
  markAllNotificationsRead: (filter: NotificationFilter = {}) =>
    send<{ unread: number }>("/notifications/read-all", "POST", filter),

  /* notifikasi perangkat */
  getPushSettings: () => request<PushSettings>("/push"),
  subscribePush: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    send<void>("/push/subscribe", "POST", subscription),
  unsubscribePush: (endpoint: string) => send<void>("/push/unsubscribe", "POST", { endpoint }),
  updateNotificationPrefs: (patch: Partial<NotificationSettings>) =>
    send<NotificationSettings>("/push/prefs", "PATCH", patch),
  sendTestPush: (endpoint: string) => send<void>("/push/test", "POST", { endpoint }),

  /* akun — sisi yang tidak ditangani Better Auth sendiri */
  uploadAvatar: (upload: { mime: AvatarMime; data: string }) =>
    send<{ image: string }>("/profile/avatar", "PUT", upload),
  deleteAvatar: () => send<void>("/profile/avatar", "DELETE"),
  createPassword: (newPassword: string) =>
    send<void>("/profile/password", "POST", { newPassword }),

  /* checklist */
  addChecklistItem: (cardId: string, text: string) =>
    send<ChecklistItem>(`/cards/${cardId}/checklist`, "POST", { text }),
  updateChecklistItem: (id: string, patch: { text?: string; done?: boolean }) =>
    send<ChecklistItem>(`/cards/checklist/${id}`, "PATCH", patch),
  deleteChecklistItem: (id: string) => send<void>(`/cards/checklist/${id}`, "DELETE"),
};
