import { useEffect, useState } from "react";
import { signIn, signUp } from "../lib/auth-client";
import { api } from "../lib/api";

const PROVIDER_LABEL: Record<string, string> = { github: "GitHub", google: "Google" };

export function AuthPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);

  useEffect(() => {
    api
      .getConfig()
      .then((cfg) => setProviders(cfg.providers))
      .catch(() => setProviders([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const result =
      mode === "login"
        ? await signIn.email({ email, password })
        : await signUp.email({ email, password, name });

    setBusy(false);

    if (result.error) {
      setError(result.error.message ?? "Gagal masuk");
      return;
    }

    // Sesi sudah aktif; App akan merender ulang ke halaman workspace.
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center p-6">
      <h1 className="text-xl font-semibold">
        {mode === "login" ? "Masuk" : "Buat akun"}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {mode === "login"
          ? "Masuk untuk mengakses workspace Anda."
          : "Daftar untuk mulai membuat papan kanban."}
      </p>

      <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
        {mode === "register" && (
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama"
            autoComplete="name"
            className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
        )}

        <input
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        <input
          required
          type="password"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Kata sandi (min. 8 karakter)"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          className="rounded-lg border border-border-subtle bg-surface-raised px-3 py-2 text-sm outline-none focus:border-blue-500"
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
        </button>
      </form>

      {providers.length > 0 && (
        <div className="mt-4 flex flex-col gap-2">
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="h-px flex-1 bg-border-subtle" />
            atau
            <span className="h-px flex-1 bg-border-subtle" />
          </div>

          {providers.map((provider) => (
            <button
              key={provider}
              type="button"
              onClick={() => void signIn.social({ provider })}
              className="rounded-lg border border-border-subtle px-3 py-2 text-sm hover:bg-slate-500/5"
            >
              Lanjutkan dengan {PROVIDER_LABEL[provider] ?? provider}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError(null);
        }}
        className="mt-6 text-sm text-blue-600 hover:underline"
      >
        {mode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
      </button>
    </div>
  );
}
