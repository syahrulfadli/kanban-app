import { useSyncExternalStore } from "react";

/**
 * Bunyi-bunyi pendek di dalam aplikasi: kabar baru yang masuk, dan kartu atau
 * kolom yang mendarat setelah diseret.
 *
 * Pilihannya milik perangkat, bukan akun — orang yang sama bisa ingin bunyi di
 * laptopnya dan diam di ponsel yang ada di meja rapat. Karena itu ia tinggal di
 * localStorage, sejalan dengan pilihan tema. Satu sakelar untuk semuanya:
 * yang dimatikan orang adalah "aplikasi ini bersuara", bukan salah satu nada.
 */
const STORAGE_KEY = "kanban:sound";

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

/**
 * Satu nada, siap dibunyikan dari mana pun.
 *
 * Elemennya dipakai berulang: membuat Audio baru tiap bunyi berarti mengunduh
 * berkasnya lagi di browser yang tidak menyimpannya di cache — dan nada drop
 * bisa diminta berkali-kali dalam satu menit.
 *
 * `throttleMs` adalah jarak minimal antarbunyi, dan angkanya berbeda jauh
 * antarnada: lihat masing-masing pemanggilan di bawah.
 */
function tone(src: string, volume: number, throttleMs: number) {
  let audio: HTMLAudioElement | null = null;
  let lastPlayedAt = 0;

  /* Aman dipanggil dari mana pun: kalau pilihannya mati, bunyinya baru saja
     terdengar, atau browser menolak memutar, panggilan ini tidak melakukan
     apa-apa dan tidak melempar. */
  return () => {
    if (!enabled) return;

    const now = Date.now();
    if (now - lastPlayedAt < throttleMs) return;
    lastPlayedAt = now;

    if (!audio) {
      audio = new Audio(src);
      audio.volume = volume;
      audio.preload = "auto";
    }

    // Nada yang belum selesai diulang dari awal, bukan ditumpuk.
    audio.currentTime = 0;
    /* Browser melarang memutar suara sebelum halamannya pernah disentuh, dan
       penolakan itu wajar terjadi pada kabar pertama di tab yang baru dibuka —
       bukan sesuatu yang perlu diadukan ke siapa pun. */
    void audio.play().catch(() => {});
  };
}

/**
 * Kabar baru masuk.
 *
 * Nadanya sudah cukup menonjol di 320 kbps; separuh volume sudah terdengar.
 *
 * Jeda tiga detik karena beberapa kabar bisa mendarat sekaligus — satu tarikan
 * berkala yang menemukan tiga kabar baru, atau papan yang sedang ramai — dan
 * tiga lonceng yang saling tumpang tindih terdengar seperti kerusakan, bukan
 * seperti pemberitahuan.
 */
export const playNotificationSound = tone("/sounds/notification.mp3", 0.5, 3_000);

/**
 * Kartu atau kolom mendarat di tempatnya.
 *
 * Ini bunyi jawaban atas satu gerakan tangan, bukan kabar: ia harus terdengar
 * tiap kali sesuatu dilepaskan, jadi jeda antarbunyinya cuma sepanjang yang
 * dibutuhkan untuk menangkis lepasan ganda dari satu ketukan. Volumenya di
 * bawah nada kabar — orang bisa memindahkan dua puluh kartu berturut-turut,
 * dan bunyi yang menonjol akan berubah jadi gangguan pada kartu kelima.
 */
export const playDropSound = tone("/sounds/drop.mp3", 0.35, 80);

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
