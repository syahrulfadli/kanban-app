import { useSyncExternalStore } from "react";

/**
 * Nada pendek saat kabar baru masuk selagi aplikasinya terbuka.
 *
 * Pilihannya milik perangkat, bukan akun — orang yang sama bisa ingin bunyi di
 * laptopnya dan diam di ponsel yang ada di meja rapat. Karena itu ia tinggal di
 * localStorage, sejalan dengan pilihan tema.
 */
const STORAGE_KEY = "kanban:sound";

const SRC = "/sounds/notification.mp3";

/** Nadanya sudah cukup menonjol di 320 kbps; separuh volume sudah terdengar. */
const VOLUME = 0.5;

/**
 * Jarak minimal antarbunyi. Beberapa kabar bisa mendarat sekaligus — satu
 * tarikan berkala yang menemukan tiga kabar baru, atau papan yang sedang ramai
 * — dan tiga lonceng yang saling tumpang tindih terdengar seperti kerusakan,
 * bukan seperti pemberitahuan.
 */
const THROTTLE_MS = 3_000;

function readPref(): boolean {
  try {
    // Hanya penolakan yang disimpan; tanpa catatan apa pun bunyinya menyala.
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    // Mode privat bisa melarang localStorage.
    return true;
  }
}

let enabled = readPref();
const listeners = new Set<() => void>();

/* Satu elemen dipakai berulang: membuat Audio baru tiap kabar berarti
   mengunduh berkasnya lagi di browser yang tidak menyimpannya di cache. */
let audio: HTMLAudioElement | null = null;
let lastPlayedAt = 0;

function element() {
  if (!audio) {
    audio = new Audio(SRC);
    audio.volume = VOLUME;
    audio.preload = "auto";
  }
  return audio;
}

/**
 * Bunyikan nadanya sekali. Aman dipanggil dari mana pun: kalau pilihannya mati,
 * bunyinya baru saja terdengar, atau browser menolak memutar, panggilan ini
 * tidak melakukan apa-apa dan tidak melempar.
 */
export function playNotificationSound() {
  if (!enabled) return;

  const now = Date.now();
  if (now - lastPlayedAt < THROTTLE_MS) return;
  lastPlayedAt = now;

  const player = element();
  // Nada yang belum selesai diulang dari awal, bukan ditumpuk.
  player.currentTime = 0;
  /* Browser melarang memutar suara sebelum halamannya pernah disentuh, dan
     penolakan itu wajar terjadi pada kabar pertama di tab yang baru dibuka —
     bukan sesuatu yang perlu diadukan ke siapa pun. */
  void player.play().catch(() => {});
}

/**
 * Pilihan bunyi di luar React — untuk yang perlu menanyakannya di dalam timer
 * atau penangan peristiwa, tanpa ikut membuat komponennya render ulang.
 */
export function isSoundEnabled() {
  return enabled;
}

export function setSoundEnabled(next: boolean) {
  enabled = next;
  try {
    localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
  } catch {
    // Pilihannya tidak persisten, tapi sesi ini tetap menurutinya.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pilihan bunyi perangkat ini. */
export function useSound() {
  const value = useSyncExternalStore(
    subscribe,
    () => enabled,
    () => true,
  );

  return { enabled: value, setEnabled: setSoundEnabled, play: playNotificationSound };
}
