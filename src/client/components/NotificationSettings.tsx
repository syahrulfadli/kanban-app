import { useEffect, useId, useRef } from "react";
import { cn } from "../lib/cn";
import type { usePush } from "../hooks/usePush";
import type { NotificationSettings as Prefs } from "../../shared/types";

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

const PREFS: { key: keyof Prefs; title: string; hint: string }[] = [
  {
    key: "comments",
    title: "Followup",
    hint: "Saat ada yang menulis di kartu yang pernah Anda sentuh.",
  },
  {
    key: "changes",
    title: "Perubahan kartu",
    hint: "Judul, deskripsi, label, checklist, dan perpindahan kolom.",
  },
  {
    key: "newCards",
    title: "Kartu baru",
    hint: "Setiap kartu baru di papan mana pun di workspace Anda.",
  },
];

/**
 * Pengaturan notifikasi perangkat. Satu dialog, bukan halaman tersendiri:
 * yang diatur cuma empat sakelar, dan semuanya berlaku untuk perangkat yang
 * sedang dipegang.
 */
export function NotificationSettings({
  push,
  onClose,
}: {
  push: ReturnType<typeof usePush>;
  onClose: () => void;
}) {
  const labelId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center overflow-hidden p-4"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {/* Saudara, bukan induk — lihat catatan .glass-frost. */}
      <div className="scrim" onClick={onClose} aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelId}
        className="glass glass-lens card-dialog relative w-full max-w-sm p-5 outline-none"
      >
        <h2 id={labelId} className="text-base font-semibold tracking-tight">
          Notifikasi
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Kabar dari kartu yang Anda ikuti, sampai ke perangkat ini meski aplikasinya sedang
          tertutup.
        </p>

        <div className="mt-4">
          {push.support === "install-first" ? (
            <p className="rounded-xl bg-accent-soft px-3 py-2.5 text-xs leading-relaxed text-accent-ink">
              Di iPhone dan iPad, notifikasi baru bisa dinyalakan setelah aplikasi ini
              ditambahkan ke Layar Utama — lewat tombol Bagikan, lalu “Tambahkan ke Layar
              Utama”.
            </p>
          ) : push.support === "unsupported" ? (
            <p className="glass-plate rounded-xl px-3 py-2.5 text-xs leading-relaxed text-muted">
              Browser ini belum mendukung notifikasi push.
            </p>
          ) : push.blocked ? (
            <p className="glass-plate rounded-xl px-3 py-2.5 text-xs leading-relaxed text-muted">
              Notifikasi diblokir untuk situs ini. Izinkan lagi lewat pengaturan situs di
              browser Anda, lalu buka pengaturan ini kembali.
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
                disabled={push.loading || push.busy}
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
        </div>

        {push.error && <p className="mt-3 text-xs text-danger">{push.error}</p>}
        {push.notice && <p className="mt-3 text-xs text-ok">{push.notice}</p>}

        <div className="mt-5 flex justify-end gap-2">
          {push.enabled && (
            <button
              type="button"
              onClick={() => void push.test()}
              disabled={push.busy}
              className="btn btn-glass"
            >
              Kirim percobaan
            </button>
          )}
          <button ref={closeRef} type="button" onClick={onClose} className="btn btn-primary">
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
