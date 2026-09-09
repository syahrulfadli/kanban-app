import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { MembersSkeleton } from "./Skeleton";
import { api } from "../lib/api";
import { useSession } from "../lib/auth-client";
import { useLanguage, useT } from "../hooks/useLanguage";
import { cn } from "../lib/cn";
import type { AdminUserSummary, LoginMethod } from "../../shared/types";

/** Jeda sebelum ketikan di kotak cari berangkat ke server. */
const SEARCH_DEBOUNCE_MS = 250;

const dateFormat = (language: string) =>
  new Intl.DateTimeFormat(language === "id" ? "id-ID" : "en-US", {
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
  const t = useT();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    try {
      await api.resetUserPassword(person.id, value);
      setValue("");
      onDone(t.adminUsers.passwordChangedNotice(person.name));
    } catch (err) {
      onError(err instanceof Error ? err.message : t.adminUsers.passwordChangeError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-2 border-t border-line-soft pt-2.5">
      <p className="text-xs leading-relaxed text-muted">
        {t.adminUsers.passwordFormHint(person.name)}
      </p>

      <div className="mt-2 flex gap-2">
        <input
          required
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          minLength={8}
          maxLength={128}
          placeholder={t.adminUsers.newPasswordPlaceholder}
          /* Sengaja bukan `type="password"`: yang mengetik bukan pemilik
             akunnya, dan ia justru harus bisa membaca apa yang akan ia
             sampaikan. Bahaya bahu-membaca di sini lebih kecil daripada
             bahaya salah ketik yang baru ketahuan saat orangnya gagal masuk. */
          autoComplete="off"
          className="field min-w-0 flex-1"
        />
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? t.common.saving : t.common.save}
        </button>
      </div>
    </form>
  );
}

export function AdminUsers() {
  const t = useT();
  const { language } = useLanguage();
  const METHOD_LABEL: Record<LoginMethod, string> = {
    credential: t.adminUsers.methodEmail,
    google: t.adminUsers.methodGoogle,
    github: t.adminUsers.methodGithub,
  };
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
      setError(e instanceof Error ? e.message : t.adminUsers.loadListError);
    }
  }, [t]);

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
      setError(e instanceof Error ? e.message : t.adminUsers.loadMoreError);
    }
  };

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    try {
      await fn();
      setError(null);
      if (done) setNote(done);
      await load(term);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.adminUsers.actionError);
    }
  };

  return (
    <>
      <div className="mt-4 flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.adminUsers.searchPlaceholder}
          className="field min-w-0 flex-1"
        />
        <span className="chip shrink-0 tabular-nums" title={t.adminUsers.totalAccountsTitle}>
          {t.adminUsers.accountsCount(total)}
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
          {term ? t.adminUsers.noMatches(term) : t.adminUsers.noAccounts}
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
                    {person.name} {isSelf && <span className="text-faint">{t.membersPage.you}</span>}
                  </p>
                  <p className="truncate text-xs text-muted">{person.email}</p>

                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {person.admin && (
                      <span
                        className={cn("chip text-[11px]", person.fromEnv && "text-accent-ink")}
                        title={
                          person.fromEnv
                            ? t.adminUsers.adminFromEnvTitle
                            : t.adminUsers.adminFromPanelTitle
                        }
                      >
                        {person.fromEnv ? t.adminUsers.adminConfigLabel : t.adminUsers.adminLabel}
                      </span>
                    )}

                    {person.methods.length > 0 && (
                      <span className="chip text-[11px]">
                        {person.methods.map((m) => METHOD_LABEL[m]).join(" · ")}
                      </span>
                    )}

                    <span className="chip text-[11px] tabular-nums">
                      {t.adminUsers.workspacesCount(person.workspaces)}
                    </span>

                    <span className="text-[11px] text-faint">
                      {t.adminUsers.joinedLabel(dateFormat(language).format(new Date(person.createdAt)))}
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
                          ? t.adminUsers.demotedNotice(person.name)
                          : t.adminUsers.promotedNotice(person.name),
                      );
                    }}
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                  >
                    {person.admin ? t.adminUsers.revokeAdmin : t.adminUsers.makeAdmin}
                  </button>
                )}

                {person.methods.includes("credential") && (
                  <button
                    onClick={() => setResetting(resetting === person.id ? null : person.id)}
                    className="btn btn-ghost px-2.5 py-1 text-xs"
                  >
                    {resetting === person.id ? t.common.close : t.adminUsers.changePassword}
                  </button>
                )}

                {!isSelf && !person.fromEnv && (
                  <button
                    onClick={() => setPending(person)}
                    className="btn btn-ghost px-2.5 py-1 text-xs hover:bg-danger/10 hover:text-danger"
                  >
                    {t.adminUsers.deleteAccount}
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
          {t.common.loadMore}
        </button>
      )}

      {leaving && session && (
        <ConfirmDialog
          title={t.adminUsers.revokeSelfTitle}
          body={t.adminUsers.revokeSelfBody}
          confirmLabel={t.adminUsers.revokeSelfConfirm}
          onConfirm={() => {
            void act(
              () => api.setUserAdmin(session.user.id, false),
              t.adminUsers.revokeSelfNotice,
            );
            setLeaving(false);
          }}
          onCancel={() => setLeaving(false)}
        />
      )}

      {pending && (
        <ConfirmDialog
          title={t.adminUsers.deleteAccountTitle}
          body={t.adminUsers.deleteAccountBody(pending.name, pending.email)}
          confirmLabel={t.adminUsers.deleteAccountConfirm}
          onConfirm={() => {
            void act(() => api.deleteUser(pending.id), t.adminUsers.deletedNotice(pending.name));
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
