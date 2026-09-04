import { useId } from "react";
import { cn } from "../lib/cn";
import type { usePush } from "../hooks/usePush";
import type { NotificationSettings as Prefs } from "../../shared/types";
import { ToggleListSkeleton } from "./Skeleton";

/** Sakelar dua keadaan. Tombolnya sendiri yang jadi jalur peluncurnya. */
function Toggle({
  checked,
  onChange,
  disabled,
  labelledBy,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  labelledBy: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200",
        // Keadaan mati butuh cincin: isian redup saja nyaris hilang di tema
        // terang, dan sakelar yang tak terlihat tidak bisa ditekan orang.
        checked
          ? "bg-accent"
          : "bg-line-soft shadow-[inset_0_0_0_1px_var(--color-line)]",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-1 left-0 size-4 rounded-full bg-white shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          checked ? "translate-x-5" : "translate-x-1",
        )}
      />
    </button>
  );
}

/** Satu baris pilihan: nama, penjelasan sebaris, dan sakelarnya. */
function Row({
  title,
  hint,
  checked,
  onChange,
  disabled,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();

  return (
    <div className="flex items-start gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p id={id} className="text-sm font-medium">
          {title}
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} labelledBy={id} />
    </div>
  );
}

/* Ketiganya bicara tentang hal yang Anda awasi, kecuali yang terakhir — dan
   perbedaan itulah yang perlu terbaca di sini. Dua kanal pertama mengikuti
   mata: kartu yang Anda sentuh atau nyalakan sendiri, dan kolom yang Anda
   awasi. Yang ketiga adalah siaran ke seluruh workspace, dan defaultnya mati
   justru karena ia tidak menunggu Anda mengawasi apa pun. */
const PREFS: { key: keyof Prefs; title: string; hint: string }[] = [
  {
    key: "comments",
    title: "Followup",
    hint: "Saat ada yang menulis di kartu yang Anda awasi.",
  },
  {
    key: "changes",
    title: "Perubahan",
    hint: "Judul, deskripsi, label, checklist, dan perpindahan kolom — di kartu dan kolom yang Anda awasi.",
  },
  {
    key: "newCards",
    title: "Kartu baru",
    hint: "Setiap kartu baru di papan mana pun di workspace Anda, diawasi atau tidak.",
  },
];

/**
 * Pengaturan notifikasi. Sakelar teratas berlaku untuk perangkat yang sedang
 * dipegang — langganan push memang milik perangkat, bukan milik akun — sedangkan
 * pilihan kanal di bawahnya berlaku untuk orangnya di semua perangkat.
 *
 * Judul dan penjelasan bagiannya datang dari SettingsPage.
 */
export function NotificationSettings({ push }: { push: ReturnType<typeof usePush> }) {
  if (push.loading) {
    return <ToggleListSkeleton rows={4} />;
  }

  // Tidak ada kunci VAPID di server berarti tidak ada yang bisa mengirim apa
  // pun; menawarkan sakelarnya cuma menjanjikan sesuatu yang tidak akan datang.
  if (!push.available) {
    return (
      <p className="glass-plate rounded-xl px-3 py-2.5 text-xs leading-relaxed text-muted">
        Server ini belum dipasangi kunci notifikasi, jadi notifikasi belum bisa dinyalakan.
      </p>
    );
  }

  return (
    <>
      {push.support === "install-first" ? (
        <p className="rounded-xl bg-accent-soft px-3 py-2.5 text-xs leading-relaxed text-accent-ink">
          Di iPhone dan iPad, notifikasi baru bisa dinyalakan setelah aplikasi ini ditambahkan ke
          Layar Utama — lewat tombol Bagikan, lalu “Tambahkan ke Layar Utama”.
        </p>
      ) : push.support === "unsupported" ? (
        <p className="glass-plate rounded-xl px-3 py-2.5 text-xs leading-relaxed text-muted">
          Browser ini belum mendukung notifikasi push.
        </p>
      ) : push.blocked ? (
        <p className="glass-plate rounded-xl px-3 py-2.5 text-xs leading-relaxed text-muted">
          Notifikasi diblokir untuk situs ini. Izinkan lagi lewat pengaturan situs di browser
          Anda, lalu muat ulang halaman ini.
        </p>
      ) : (
        <>
          <Row
            title="Perangkat ini"
            hint={
              push.enabled
                ? "Perangkat ini menerima notifikasi."
                : "Nyalakan untuk menerima notifikasi di sini."
            }
            checked={push.enabled}
            onChange={(next) => void (next ? push.enable() : push.disable())}
            disabled={push.busy}
          />

          {/* Pilihan kanal hanya berarti kalau ada yang mengirim ke sini. */}
          {push.enabled && (
            <div className="mt-1 divide-y divide-line-soft border-t border-line-soft">
              {PREFS.map((pref) => (
                <Row
                  key={pref.key}
                  title={pref.title}
                  hint={pref.hint}
                  checked={push.prefs[pref.key]}
                  onChange={(next) => void push.setPref(pref.key, next)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {push.error && <p className="mt-3 text-xs text-danger">{push.error}</p>}
      {push.notice && <p className="mt-3 text-xs text-ok">{push.notice}</p>}

      {push.enabled && (
        <div className="mt-4 flex justify-end">
          {/* Rantainya panjang — izin, service worker, kunci VAPID, push
              service — dan hanya notifikasi yang benar-benar sampai yang
              membuktikan semuanya tersambung. */}
          <button
            type="button"
            onClick={() => void push.test()}
            disabled={push.busy}
            className="btn btn-glass"
          >
            Kirim percobaan
          </button>
        </div>
      )}
    </>
  );
}
