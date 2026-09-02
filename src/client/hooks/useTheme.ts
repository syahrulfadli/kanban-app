import { useSyncExternalStore } from "react";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/* Kunci yang sama dipakai skrip anti-kedip di index.html. Kalau salah satu
   diubah, ubah keduanya — kalau tidak, halaman melukis tema lama dulu. */
const STORAGE_KEY = "kanban:theme";

const darkQuery = window.matchMedia("(prefers-color-scheme: dark)");

// Warna bar browser di ponsel harus ikut latar halaman, kalau tidak ada pita
// terang di atas papan yang gelap.
const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#E6ECF5",
  dark: "#08090C",
};

function readPref(): ThemePref {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Mode privat bisa melarang localStorage; jatuh ke "system" saja.
  }
  return "system";
}

export function resolveTheme(pref: ThemePref): ResolvedTheme {
  if (pref === "system") return darkQuery.matches ? "dark" : "light";
  return pref;
}

let pref: ThemePref = readPref();
const listeners = new Set<() => void>();

function apply() {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[resolved]);
}

function emit() {
  apply();
  for (const listener of listeners) listener();
}

// Saat pilihannya "system", perubahan tema OS harus langsung terlihat.
darkQuery.addEventListener("change", () => {
  if (pref === "system") emit();
});

export function setTheme(next: ThemePref) {
  pref = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Preferensi tidak persisten, tapi sesi ini tetap berjalan.
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Preferensi tema beserta hasil resolusinya. */
export function useTheme() {
  const value = useSyncExternalStore(
    subscribe,
    () => pref,
    () => "system" as ThemePref,
  );

  return { theme: value, resolved: resolveTheme(value), setTheme };
}

// Selaraskan DOM dengan localStorage sekali saat modul dimuat, jaga-jaga kalau
// skrip di index.html tidak sempat jalan.
apply();
