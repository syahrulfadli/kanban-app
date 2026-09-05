import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { MembersSkeleton } from "./Skeleton";
import { api } from "../lib/api";
import { useSession } from "../lib/auth-client";
import { cn } from "../lib/cn";
import type { AdminUserSummary, LoginMethod } from "../../shared/types";

/** Jeda sebelum ketikan di kotak cari berangkat ke server. */
const SEARCH_DEBOUNCE_MS = 250;

const METHOD_LABEL: Record<LoginMethod, string> = {
  credential: "Email",
  google: "Google",
  github: "GitHub",
};

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * Formulir kata sandi baru, muncul di dalam baris akunnya.
 *
 * Sengaja di dalam baris, bukan di dialog: yang paling mudah salah di aksi ini
 * adalah menetapkan kata sandi pada akun yang keliru, dan dialog yang
 * mengambang di tengah layar melepaskan formulirnya dari nama yang ia tuju.
 */
function PasswordForm({
  person,
  onDone,
  onError,
}: {
  person: AdminUserSummary;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    try {
      await api.resetUserPassword(person.id, value);
      setValue("");
      onDone(
        `Kata sandi ${person.name} diganti. Sesi lamanya diputus — perangkat ` +
          "yang sudah masuk berhenti terlayani dalam beberapa menit.",
      );
    } catch (err) {
      onError(err instanceof Error ? err.message : "Gagal mengganti kata sandi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 border-t border-line-soft pt-2.5">
      <p className="text-xs leading-relaxed text-muted">
        Sampaikan kata sandi ini lewat jalur lain — aplikasi belum punya layanan email.
        Semua sesi {person.name} diputus, tapi perangkat yang sudah masuk baru berhenti
        terlayani dalam beberapa menit: sesi disimpan sebentar di cookie-nya sendiri.
      </p>

      <div className="mt-2 flex gap-2">
        <input
          required
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={8}
          maxLength={128}
          placeholder="Kata sandi baru — minimal 8 huruf"
          /* Sengaja bukan `type="password"`: yang mengetik bukan pemilik
             akunnya, dan ia justru harus bisa membaca apa yang akan ia
             sampaikan. Bahaya bahu-membaca di sini lebih kecil daripada
             bahaya salah ketik yang baru ketahuan saat orangnya gagal masuk. */
          autoComplete="off"
          className="field min-w-0 flex-1"
        />
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Menyimpan…" : "Simpan"}
        </button>
      </div>
    </form>
  );
}

export function AdminUsers() {
  const { data: session } = useSession();

  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<AdminUserSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [pending, setPending] = useState<AdminUserSummary | null>(null);
  /* Mencabut admin diri sendiri satu-satunya aksi di halaman ini yang bisa
     mengunci pelakunya keluar dari halaman ini juga. Pintu darurat ADMIN_EMAILS
     memang ada, tapi ia di berkas konfigurasi server — jauh dari orang yang
     baru saja salah tekan. */
  const [leaving, setLeaving] = useState(false);

  /* Kata kunci yang benar-benar dikirim, tertinggal seperempat detik di
     belakang yang diketik: tanpa itu setiap huruf jadi satu perjalanan ke
     server, dan jawaban yang datang tidak berurutan bisa saling menimpa. */
  const [term, setTerm] = useState("");
  useEffect(() => {
    const id = setTimeout(() => setTerm(query.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [query]);

  /* Halaman berikutnya boleh datang belakangan, dan selama itu kata kuncinya
     bisa sudah berganti. Nomor permintaan yang menjaga jawaban basi tidak
     mendarat di daftar yang sudah membicarakan hal lain. */
  const request = useRef(0);

  const load = useCallback(async (search: string) => {
    const id = ++request.current;

    try {
      const page = await api.listAdminUsers({ q: search || undefined });
      if (id !== request.current) return;

      setUsers(page.items);
      setCursor(page.nextCursor);
      setTotal(page.total);
      setError(null);
    } catch (e) {
      if (id !== request.current) return;
      setError(e instanceof Error ? e.message : "Gagal memuat daftar akun");
    }
  }, []);

  useEffect(() => {
    setUsers(null);
    void load(term);
  }, [load, term]);

  const more = async () => {
    if (!cursor) return;
    const id = request.current;

    try {
      const page = await api.listAdminUsers({ q: term || undefined, cursor });
      if (id !== request.current) return;

      setUsers((prev) => [...(prev ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat halaman berikutnya");
    }
  };

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      setError(null);
      if (done) setNote(done);
      await load(term);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aksi gagal");
    }
  };

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari nama atau email…"
          className="field min-w-0 flex-1"
        />
        <span className="chip shrink-0 tabular-nums" title="Seluruh akun di aplikasi">
          {total} akun
        </span>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      {note && <p className="mt-3 rounded-xl bg-ok/10 px-3 py-2 text-xs text-ok">{note}</p>}

      {!users && !error && (
        <div className="mt-4">
          <MembersSkeleton rows={4} />
        </div>
      )}

      {users?.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          {term ? `Tidak ada akun yang cocok dengan “${term}”.` : "Belum ada akun."}
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {users?.map((person) => {
          const isSelf = person.id === session?.user.id;

          return (
            <li key={person.id} className="glass glass-plate rounded-2xl px-4 py-3.5">
              <div className="flex items-start gap-3">
                <Avatar
                  person={{
                    id: person.id,
                    name: person.name,
                    email: person.email,
                    image: person.image,
                  }}
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {person.name} {isSelf && <span className="text-faint">(Anda)</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{person.email}</p>

                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {person.admin && (
                      <span
                        className={cn("chip text-[11px]", person.fromEnv && "text-accent-ink")}
                        title={
                          person.fromEnv
                            ? "Admin lewat ADMIN_EMAILS di konfigurasi server"
                            : "Diangkat lewat panel ini"
                        }
                      >
                        {person.fromEnv ? "Admin (konfigurasi)" : "Admin"}
                      </span>
                    )}

                    {person.methods.length > 0 && (
                      <span className="chip text-[11px]">
                        {person.methods.map((m) => METHOD_LABEL[m]).join(" · ")}
                      </span>
                    )}

                    <span className="chip text-[11px] tabular-nums">
                      {person.workspaces} workspace
                    </span>

                    <span className="text-[11px] text-faint">
                      Bergabung {dateFormat.format(new Date(person.createdAt))}
                    </span>
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {/* Admin dari konfigurasi tidak menawarkan tombol apa pun di
                    sini: kewenangannya tidak lahir di database, jadi tidak ada
                    yang bisa diubah dari panel — dan tombol yang pasti ditolak
                    server lebih buruk daripada tombol yang tidak ada. */}
                {!person.fromEnv && (
                  <button
                    onClick={() => {
                      if (isSelf && person.admin) {
                        setLeaving(true);
                        return;
                      }

                      void act(
                        () => api.setUserAdmin(person.id, !person.admin),
                        person.admin
                          ? `${person.name} bukan admin lagi`
                          : `${person.name} sekarang admin aplikasi`,
                      );
                    }}
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                  >
                    {person.admin ? "Cabut admin" : "Jadikan admin"}
                  </button>
                )}

                {person.methods.includes("credential") && (
                  <button
                    onClick={() => setResetting(resetting === person.id ? null : person.id)}
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                  >
                    {resetting === person.id ? "Tutup" : "Ganti kata sandi"}
                  </button>
                )}

                {!isSelf && !person.fromEnv && (
                  <button
                    onClick={() => setPending(person)}
                    className="btn btn-ghost px-2.5 py-1 text-xs hover:bg-danger/10 hover:text-danger"
                  >
                    Hapus akun
                  </button>
                )}
              </div>

              {resetting === person.id && (
                <PasswordForm
                  person={person}
                  onDone={(message) => {
                    setResetting(null);
                    setNote(message);
                    setError(null);
                  }}
                  onError={setError}
                />
              )}
            </li>
          );
        })}
      </ul>

      {cursor && (
        <button onClick={() => void more()} className="btn btn-glass mt-3 w-full">
          Muat lebih banyak
        </button>
      )}

      {leaving && session && (
        <ConfirmDialog
          title="Cabut status admin Anda sendiri?"
          body={
            <>
              Halaman ini akan langsung tertutup untuk Anda. Yang bisa
              mengembalikannya hanya admin lain — atau email Anda dimasukkan ke
              ADMIN_EMAILS di konfigurasi server.
            </>
          }
          confirmLabel="Cabut status admin saya"
          onConfirm={() => {
            void act(
              () => api.setUserAdmin(session.user.id, false),
              "Status admin Anda dicabut",
            );
            setLeaving(false);
          }}
          onCancel={() => setLeaving(false)}
        />
      )}

      {pending && (
        <ConfirmDialog
          title="Hapus akun ini?"
          body={
            <>
              Akun {pending.name} ({pending.email}) akan dihapus beserta sesi, foto profil,
              dan kotak masuknya. Workspace yang hanya beranggotakan dia ikut terhapus;
              kartu dan followup yang pernah ia tulis tetap tinggal tanpa nama. Ini tidak
              bisa diurungkan.
            </>
          }
          confirmLabel="Hapus akun"
          onConfirm={() => {
            void act(() => api.deleteUser(pending.id), `Akun ${pending.name} dihapus`);
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
