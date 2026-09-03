import { useEffect, useRef, useState } from "react";
import { signOut, useSession } from "../lib/auth-client";
import { cn } from "../lib/cn";
import { avatarTint, initials } from "../lib/people";
import { currentSubscription, syncSubscription } from "../lib/push";
import { navigate, paths } from "../lib/route";

/* Ikon roda gigi dan pintu keluar. Digambar sebaris supaya tidak ada
   permintaan jaringan tambahan; warnanya mengikuti `currentColor`. */
/* Gerigi utuh, bukan lingkaran bersinar: sakelar tema di sebelahnya memakai
   ikon matahari, dan pada ukuran 16 piksel keduanya nyaris tak terbedakan. */
const GEAR = (
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>
);

const EXIT = <path d="M15 17l5-5-5-5M20 12H9M12 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h6" />;

/** Baris menu: ikon, label, dan rona yang membedakan aksi biasa dari keluar. */
function Item({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={
        danger
          ? "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-danger/10 hover:text-danger"
          : "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-accent-soft hover:text-accent-ink"
      }
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
        {icon}
      </svg>
      {label}
    </button>
  );
}

export function ProfileMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  /* Perangkat yang sudah berlangganan notifikasi mendaftar ulang diam-diam
     tiap aplikasi dibuka: baris di server bisa saja hilang — database
     dibangun ulang, atau langganan lama sempat dianggap mati — sedangkan
     perangkatnya tidak tahu apa-apa dan tidak akan pernah bertanya sendiri.
     Tempatnya di sini karena kapsul profil ada di semua halaman, jadi ini
     tidak menunggu siapa pun membuka halaman pengaturan lebih dulu. */
  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;

    currentSubscription()
      .then((subscription) => subscription && syncSubscription(subscription))
      .catch(() => {});
  }, [userId]);

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
        className={cn(
          "avatar overflow-hidden transition-transform hover:scale-105",
          !image && "avatar-tinted",
        )}
        style={image ? undefined : avatarTint(name, email)}
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

          <Item
            icon={GEAR}
            label="Pengaturan"
            onClick={() => {
              setOpen(false);
              navigate(paths.settings);
            }}
          />

          <Item
            icon={EXIT}
            label="Keluar"
            danger
            onClick={() => {
              setOpen(false);
              void signOut().then(() => navigate(paths.workspaces));
            }}
          />
        </div>
      )}
    </div>
  );
}
