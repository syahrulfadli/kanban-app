import type { Board, Card, Column, Invitation, Role, Workspace } from "../db/schema";

export type { Board, Card, Column, Invitation, Role, Workspace };

/** Workspace beserta peran user yang sedang login di dalamnya. */
export interface WorkspaceSummary extends Workspace {
  role: Role;
}

/** Satu board lengkap dengan kolom dan kartunya — payload untuk render board. */
export interface BoardDetail extends Board {
  role: Role;
  columns: (Column & { cards: Card[] })[];
}

export interface MemberSummary {
  userId: string;
  role: Role;
  joinedAt: Date;
  name: string;
  email: string;
  image: string | null;
}

/** Undangan yang baru dibuat — `url` dibagikan manual (belum ada layanan email). */
export interface InvitationCreated extends Invitation {
  url: string;
}

export interface InvitePreview {
  workspaceName: string;
  email: string;
  role: Role;
  expiresAt: string;
}

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  image?: string | null;
}

export interface ApiError {
  error: string;
}
