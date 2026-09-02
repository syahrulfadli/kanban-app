import { signOut, useSession } from "../lib/auth-client";
import { navigate, paths } from "../lib/route";

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const { data: session } = useSession();

  return (
    <header className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
      <button
        onClick={() => navigate(paths.workspaces)}
        className="text-sm font-semibold hover:underline"
      >
        Kanban
      </button>

      {children}

      <div className="ml-auto flex items-center gap-3">
        <span className="hidden text-sm text-slate-500 sm:inline">{session?.user.name}</span>
        <button
          onClick={() => void signOut().then(() => navigate(paths.workspaces))}
          className="rounded px-2 py-1 text-sm text-slate-500 hover:bg-slate-500/10"
        >
          Keluar
        </button>
      </div>
    </header>
  );
}
