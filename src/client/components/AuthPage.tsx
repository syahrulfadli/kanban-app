import { useEffect, useState } from "react";
import { PROVIDER_LABEL, signIn, signUp } from "../lib/auth-client";
import { api } from "../lib/api";

/* `initialMode` hanya menentukan tampilan pertama — sesudahnya sakelar di
   bawah form yang memegang kendali, tanpa menyentuh alamat. Halaman
   pengantar memakainya supaya "Mulai sekarang" mendarat di form daftar,
   bukan di form masuk yang harus ditukar sendiri. */
export function AuthPage({ initialMode = "login" }: { initialMode?: "login" | "register" }) {
  const [mode, setMode] = useState<"login" | "register">(initialMode);
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
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="glass glass-frost w-full max-w-sm rounded-3xl p-7">
        <h1 className="text-xl font-semibold tracking-tight">
          {mode === "login" ? "Masuk" : "Buat akun"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "login"
            ? "Masuk untuk mengakses workspace Anda."
            : "Daftar untuk mulai membuat papan kanban."}
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-2.5">
          {mode === "register" && (
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nama"
              autoComplete="name"
              className="field"
            />
          )}

          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            autoComplete="email"
            className="field"
          />

          <input
            required
            type="password"
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Kata sandi (min. 8 karakter)"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="field"
          />

          {error && <p className="text-sm text-danger">{error}</p>}

          <button type="submit" disabled={busy} className="btn btn-primary mt-1 py-2.5">
            {busy ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
          </button>
        </form>

        {providers.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-line" />
              atau
              <span className="h-px flex-1 bg-line" />
            </div>

            {providers.map((provider) => (
              <button
                key={provider}
                type="button"
                onClick={() => void signIn.social({ provider })}
                className="btn btn-glass py-2.5"
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
          className="mt-6 text-sm text-accent-ink hover:underline"
        >
          {mode === "login" ? "Belum punya akun? Daftar" : "Sudah punya akun? Masuk"}
        </button>
      </div>
    </div>
  );
}
