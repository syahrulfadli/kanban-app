import { useSyncExternalStore } from "react";
import { en } from "../i18n/en";
import { id } from "../i18n/id";
import type { Translations } from "../i18n/id";

export type Language = "id" | "en";

/* Kunci penyimpanan terpisah dari milik tema (lihat useTheme.ts) — dua
   preferensi yang berdiri sendiri, dan tidak ada alasan mengaitkannya. */
const STORAGE_KEY = "kanban:language";

const dict: Record<Language, Translations> = { id, en };

function readPref(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "id" || stored === "en") return stored;
  } catch {
    // Mode privat bisa melarang localStorage; jatuh ke bahasa bawaan.
  }
  return "id";
}

let lang: Language = readPref();
const listeners = new Set<() => void>();

/* `lang` di <html> dibaca pembaca layar dan pemeriksa ejaan browser — kalau
   dibiarkan "id" terus, teks Inggris di halaman akan diucapkan dengan aturan
   Indonesia. Diselaraskan sekali di sini, sama seperti `data-theme` di
   useTheme.ts, bukan di tiap komponen yang berganti bahasa. */
function apply() {
  document.documentElement.lang = lang;
}

export function setLanguage(next: Language) {
  lang = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preferensi tidak persisten, tapi sesi ini tetap berjalan.
  }
  apply();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Selaraskan DOM dengan localStorage sekali saat modul dimuat — html lang
// bawaan dari index.html adalah "id", dan preferensi tersimpan bisa "en".
apply();

/** Bahasa yang sedang dipakai, beserta pengubahnya. */
export function useLanguage() {
  const value = useSyncExternalStore(
    subscribe,
    () => lang,
    () => "id" as Language,
  );

  return { language: value, setLanguage };
}

/** Kamus bahasa yang sedang aktif — dipakai lewat `const t = useT()`. */
export function useT(): Translations {
  const { language } = useLanguage();
  return dict[language];
}
