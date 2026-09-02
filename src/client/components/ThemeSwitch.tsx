import { useTheme, type ThemePref } from "../hooks/useTheme";
import { cn } from "../lib/cn";

const ICON = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.7 6.7 0 0 0 10.5 10.5Z" />,
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
} satisfies Record<ThemePref, React.ReactNode>;

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "light", label: "Terang" },
  { value: "dark", label: "Gelap" },
  { value: "system", label: "Sistem" },
];

/* Hanya ikon: sakelar ini tinggal di kapsul bawah, dan tiga label teks akan
   menjadikannya bagian terlebar di sana. Nama tiap pilihan tetap terbaca
   pembaca layar lewat aria-label, dan muncul sebagai tooltip di pointer. */
export function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const index = OPTIONS.findIndex((o) => o.value === theme);

  return (
    <div
      role="radiogroup"
      aria-label="Tema tampilan"
      className="glass glass-quiet relative flex rounded-full p-1"
    >
      {/* Peluncur — satu elemen yang bergeser, bukan tiga latar yang
          dinyalakan bergantian, supaya perpindahannya terbaca sebagai gerak. */}
      <span
        aria-hidden
        className="switch-knob absolute inset-y-1 left-1 size-7 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />

      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={theme === option.value}
          aria-label={option.label}
          onClick={() => setTheme(option.value)}
          title={option.label}
          className={cn(
            "relative z-10 grid size-7 place-items-center rounded-full transition-colors",
            theme === option.value ? "text-ink" : "text-muted hover:text-ink-soft",
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {ICON[option.value]}
          </svg>
        </button>
      ))}
    </div>
  );
}
