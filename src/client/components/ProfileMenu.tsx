import { useEffect, useRef, useState } from "react";
import { NotificationSettings } from "./NotificationSettings";
import { usePush } from "../hooks/usePush";
import { signOut, useSession } from "../lib/auth-client";
import { initials } from "../lib/people";
import { navigate, paths } from "../lib/route";

export function ProfileMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Hook-nya tinggal di sini, bukan di dialognya: begitu menu profil muncul,
     langganan perangkat ini didaftarkan ulang diam-diam ke server — dan itu
     tidak boleh menunggu seseorang membuka pengaturan lebih dulu. */
  const push = usePush();

  // Tutup kalau ditekan di luar menu atau saat Escape. `pointerdown`, bukan
  // `click`, supaya menu sudah tertutup sebelum klik mendarat di bawahnya.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!session) return null;

  const { name, email, image } = session.user;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu profil ${name}`}
        className="avatar overflow-hidden transition-transform hover:scale-105"
      >
        {image ? <img src={image} alt="" /> : initials(name, email)}
      </button>

      {open && (
        /* Menu terbit ke ATAS: kapsulnya menempel di dasar layar, jadi ke
           bawah tidak ada ruang. */
        <div
          role="menu"
          className="sheet absolute right-0 bottom-full mb-3 w-56 rounded-2xl p-1.5"
        >
          <div className="px-2.5 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>

          <span className="my-1 block h-px bg-line-soft" />

          {/* Disembunyikan kalau servernya memang belum bisa mengirim apa pun,
              atau browsernya tidak mengenal notifikasi sama sekali. */}
          {push.available && push.support !== "unsupported" && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setSettingsOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-accent-soft hover:text-accent-ink"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4 shrink-0"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
              Notifikasi
              <span className="ml-auto text-xs text-faint">
                {push.enabled ? "Aktif" : "Mati"}
              </span>
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              void signOut().then(() => navigate(paths.workspaces));
            }}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M15 17l5-5-5-5M20 12H9M12 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6" />
            </svg>
            Keluar
          </button>
        </div>
      )}

      {settingsOpen && (
        <NotificationSettings push={push} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  );
}
