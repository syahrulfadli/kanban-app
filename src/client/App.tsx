import { AuthPage } from "./components/AuthPage";
import { BoardView } from "./components/BoardView";
import { InvitePage } from "./components/InvitePage";
import { MembersPage } from "./components/MembersPage";
import { WorkspacePage } from "./components/WorkspacePage";
import { WorkspacesPage } from "./components/WorkspacesPage";
import { useSession } from "./lib/auth-client";
import { useRoute } from "./lib/route";

export default function App() {
  const route = useRoute();
  const { data: session, isPending } = useSession();

  // Halaman undangan menangani sendiri kondisi belum-login, karena penerima
  // perlu melihat konteks undangan sebelum diminta membuat akun.
  if (route.name === "invite") return <InvitePage token={route.token} />;

  if (isPending) return <p className="p-8 text-sm text-slate-500">Memuat…</p>;
  if (!session) return <AuthPage />;

  switch (route.name) {
    case "board":
      // `key` memaksa remount saat pindah board, jadi state lama tidak terbawa.
      return <BoardView key={route.boardId} boardId={route.boardId} />;
    case "workspace":
      return <WorkspacePage key={route.workspaceId} workspaceId={route.workspaceId} />;
    case "members":
      return <MembersPage key={route.workspaceId} workspaceId={route.workspaceId} />;
    default:
      return <WorkspacesPage />;
  }
}
