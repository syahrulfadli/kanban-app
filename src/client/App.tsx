import { AuthPage } from "./components/AuthPage";
import { BoardView } from "./components/BoardView";
import { InvitePage } from "./components/InvitePage";
import { MembersPage } from "./components/MembersPage";
import { BottomNav } from "./components/BottomNav";
import { WorkspacePage } from "./components/WorkspacePage";
import { WorkspacesPage } from "./components/WorkspacesPage";
import { useSession } from "./lib/auth-client";
import { cn } from "./lib/cn";
import { useRoute } from "./lib/route";

/* Kerangka halaman. Kapsul navigasi hidup di sini, sekali untuk semua rute,
   supaya profil dan pengatur tema selalu ada di tempat yang sama.

   `fill` membedakan dua mode tata letak: papan kanban mengunci diri setinggi
   viewport dan menggulir di dalam kolomnya sendiri, sedangkan halaman daftar
   tumbuh ke bawah seperti dokumen biasa. Halaman yang menggulir menyisakan
   ruang di bawah karena kapsulnya `fixed` — tanpa itu ia menutupi baris
   terakhir; papan mengatur jaraknya sendiri di BoardView. */
function Shell({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <div className={cn("flex flex-col", fill ? "h-dvh overflow-hidden" : "min-h-dvh pb-24")}>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <BottomNav credit={!fill} />
    </div>
  );
}

function Loading({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <p className="flex items-center gap-2 text-sm text-muted">
        <span className="size-2 animate-pulse rounded-full bg-accent" />
        {label}
      </p>
    </div>
  );
}

export default function App() {
  const route = useRoute();
  const { data: session, isPending } = useSession();

  // Halaman undangan menangani sendiri kondisi belum-login, karena penerima
  // perlu melihat konteks undangan sebelum diminta membuat akun.
  if (route.name === "invite") {
    return (
      <Shell>
        <InvitePage token={route.token} />
      </Shell>
    );
  }

  if (isPending) {
    return (
      <Shell>
        <Loading label="Memuat…" />
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <AuthPage />
      </Shell>
    );
  }

  switch (route.name) {
    case "board":
      return (
        <Shell fill>
          {/* `key` memaksa remount saat pindah board, jadi state lama tidak terbawa. */}
          <BoardView key={route.boardId} boardId={route.boardId} openCardId={route.cardId} />
        </Shell>
      );
    case "workspace":
      return (
        <Shell>
          <WorkspacePage key={route.workspaceId} workspaceId={route.workspaceId} />
        </Shell>
      );
    case "members":
      return (
        <Shell>
          <MembersPage key={route.workspaceId} workspaceId={route.workspaceId} />
        </Shell>
      );
    default:
      return (
        <Shell>
          <WorkspacesPage />
        </Shell>
      );
  }
}
