import { useEffect, useState } from "react";
import { AppHeader } from "./AppHeader";
import { LanguageSwitch } from "./LanguageSwitch";
import { NotificationSettings } from "./NotificationSettings";
import { PasswordSettings } from "./PasswordSettings";
import { ProfileSettings, type LinkedAccount } from "./ProfileSettings";
import { usePush } from "../hooks/usePush";
import { useT } from "../hooks/useLanguage";
import { listAccounts, useSession } from "../lib/auth-client";

/* Satu pane per urusan. Judul dan penjelasannya tinggal di sini, bukan di
   dalam tiap bagian: dengan begitu bagiannya cukup mengurus isinya, dan
   halamannya punya satu tempat yang menentukan nada semua judul. */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass glass-plate mt-4 rounded-2xl p-5">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">{hint}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function SettingsPage() {
  const { data: session } = useSession();
  const push = usePush();
  const t = useT();

  /* Cara akun ini bisa masuk. Ditarik sekali di sini lalu dibagikan: bagian
     kata sandi memakainya untuk memilih formulir, dan bagian profil untuk
     menjelaskan mengapa emailnya terkunci. */
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  useEffect(() => {
    void listAccounts().then(({ data, error }) => {
      if (data) setAccounts(data);
      else setAccountsError(error?.message ?? t.settings.accountsError);
    });
  }, []);

  // App hanya merender halaman ini untuk sesi yang sah; ini penjaga tipe.
  if (!session) return null;

  return (
    <>
      <AppHeader>
        <span className="text-faint">/</span>
        <span className="truncate text-sm font-medium">{t.settings.crumb}</span>
      </AppHeader>

      <div className="mx-auto w-full max-w-2xl px-5 pb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t.settings.title}</h1>

        <Section title={t.settings.profileTitle} hint={t.settings.profileHint}>
          <ProfileSettings user={session.user} accounts={accounts} />
        </Section>

        <Section title={t.settings.passwordTitle} hint={t.settings.passwordHint}>
          {accountsError ? (
            <p className="text-xs text-danger">{accountsError}</p>
          ) : (
            <PasswordSettings accounts={accounts} />
          )}
        </Section>

        {/* Yang diatur di sini hanya cara kabarnya mengetuk: nada di dalam
            aplikasi, dan getaran di perangkat. Kotak masuk di lonceng mencatat
            semuanya, apa pun pilihan sakelarnya. */}
        <Section title={t.settings.notificationsTitle} hint={t.settings.notificationsHint}>
          <NotificationSettings push={push} />
        </Section>

        <Section title={t.settings.languageTitle} hint={t.settings.languageHint}>
          <LanguageSwitch />
        </Section>
      </div>
    </>
  );
}
