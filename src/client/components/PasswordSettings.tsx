import { useId, useState } from "react";
import { api } from "../lib/api";
import { changePassword } from "../lib/auth-client";
import type { LinkedAccount } from "./ProfileSettings";
import { FormSkeleton } from "./Skeleton";

/**
 * Kata sandi akun.
 *
 * Ada dua keadaan yang berbeda, bukan satu formulir dengan kolom opsional:
 * akun yang lahir dari email dan kata sandi menggantinya dengan menyebut kata
 * sandi lamanya, sedangkan akun yang masuk lewat Google atau GitHub belum
 * punya kata sandi sama sekali dan tinggal membuatnya. Yang kedua sengaja
 * tidak meminta kata sandi lama — tidak ada yang bisa disebut.
 */
export function PasswordSettings({ accounts }: { accounts: LinkedAccount[] | null }) {
  const currentId = useId();
  const nextId = useId();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /* Formulir mana yang muncul baru diketahui setelah daftar akun datang —
     dua kolom kalau akunnya lahir dari kata sandi, satu kalau dari Google
     atau GitHub. Kerangkanya memasang dua: itu yang paling sering benar, dan
     kalau meleset yang hilang cuma satu kolom, bukan seluruh formulir. */
  if (!accounts) {
    return <FormSkeleton fields={2} label="Memuat pengaturan kata sandi…" />;
  }

  const hasPassword = accounts.some((a) => a.providerId === "credential");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);

    try {
      if (hasPassword) {
        /* Sesi lain dicabut: kata sandi biasanya diganti justru karena yang
           lama dianggap sudah tidak aman, dan membiarkan sesi lama hidup
           membuat penggantian itu sia-sia. */
        const result = await changePassword({
          currentPassword: current,
          newPassword: next,
          revokeOtherSessions: true,
        });
        if (result.error) {
          // Pesan bawaan Better Auth berbahasa Inggris; yang ini paling sering
          // terlihat, jadi diterjemahkan di sini.
          throw new Error(
            result.error.code === "INVALID_PASSWORD"
              ? "Kata sandi sekarang tidak cocok."
              : (result.error.message ?? "Kata sandi gagal diganti"),
          );
        }
      } else {
        await api.createPassword(next);
      }

      setCurrent("");
      setNext("");
      setNotice(
        hasPassword
          ? "Kata sandi diganti. Sesi di perangkat lain sudah dikeluarkan."
          : "Kata sandi dibuat. Sekarang Anda juga bisa masuk dengan email dan kata sandi.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kata sandi gagal disimpan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      {hasPassword && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={currentId} className="text-xs font-medium text-muted">
            Kata sandi sekarang
          </label>
          <input
            id={currentId}
            required
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="field"
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor={nextId} className="text-xs font-medium text-muted">
          Kata sandi baru
        </label>
        <input
          id={nextId}
          required
          type="password"
          minLength={8}
          value={next}
          onChange={(e) => setNext(e.target.value)}
          placeholder="Minimal 8 karakter"
          autoComplete="new-password"
          className="field"
        />
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}
      {notice && <p className="text-xs text-ok">{notice}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || next.length < 8 || (hasPassword && current.length === 0)}
          className="btn btn-primary"
        >
          {hasPassword ? "Ganti kata sandi" : "Buat kata sandi"}
        </button>
      </div>
    </form>
  );
}
