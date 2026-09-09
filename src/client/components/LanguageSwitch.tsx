import { useLanguage, useT, type Language } from "../hooks/useLanguage";
import { cn } from "../lib/cn";

const OPTIONS: { value: Language; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "en", label: "EN" },
];

/* Sama persis polanya dengan ThemeSwitch: satu peluncur yang bergeser,
   bukan dua latar yang dinyalakan bergantian. Bedanya cuma dua pilihan,
   bukan tiga, dan labelnya teks — tidak ada ikon yang cukup jelas
   mewakili "bahasa" tanpa dibaca dulu. */
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  const t = useT();
  const index = OPTIONS.findIndex((o) => o.value === language);

  return (
    <div
      role="radiogroup"
      aria-label={t.language.label}
      className="glass glass-quiet switch-track relative inline-flex rounded-full p-1"
    >
      <span
        aria-hidden
        className="switch-knob absolute inset-y-1 left-1 w-11 rounded-full transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${index * 100}%)` }}
      />

      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={language === option.value}
          onClick={() => setLanguage(option.value)}
          className={cn(
            "relative z-10 grid w-11 place-items-center rounded-full py-1.5 text-xs font-semibold transition-colors",
            language === option.value ? "text-ink" : "text-muted hover:text-ink-soft",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
