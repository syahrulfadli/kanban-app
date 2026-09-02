import { api } from "./api";

/**
 * Sisi perangkat dari notifikasi: mendaftarkan service worker, meminta izin,
 * lalu menitipkan kunci langganan ke server.
 *
 * Semua yang berkaitan dengan browser dikumpulkan di sini supaya komponennya
 * cukup mengurus tampilan — bukan ikut menghafal urutan langkah Web Push.
 */

const SERVICE_WORKER = "/sw.js";

/**
 * Kunci VAPID datang sebagai base64url; PushManager memintanya sebagai bita.
 *
 * Larik diisi manual, bukan lewat Uint8Array.from: tipe yang dihasilkannya
 * memberi jaminan penyangganya ArrayBuffer biasa — dan hanya itu yang diterima
 * `applicationServerKey`.
 */
function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => {
  if (!a) return false;
  const bytes = new Uint8Array(a);
  return bytes.length === b.length && bytes.every((byte, i) => byte === b[i]);
};

export type PushSupport =
  | "ok"
  /** Browsernya memang tidak punya Web Push. */
  | "unsupported"
  /** iOS: push baru ada setelah aplikasinya ditambahkan ke Layar Utama. */
  | "install-first";

const standalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  // Safari lama menandainya di navigator, bukan lewat media query.
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

const isApple = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) ||
  // iPad modern menyamar sebagai macOS; layar sentuhnya yang membedakan.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function detectSupport(): PushSupport {
  if ("serviceWorker" in navigator && "PushManager" in window && "Notification" in window) {
    return "ok";
  }

  return isApple() && !standalone() ? "install-first" : "unsupported";
}

/**
 * Pendaftaran service worker yang siap dipakai. `register` sendiri idempoten,
 * jadi aman dipanggil lagi meski main.tsx sudah mendaftarkannya saat memuat.
 */
async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register(SERVICE_WORKER);
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (detectSupport() !== "ok") return null;
  return (await registration()).pushManager.getSubscription();
}

/** Titipkan kunci perangkat ke server. Dipanggil ulang setiap aplikasi dibuka. */
export async function syncSubscription(subscription: PushSubscription): Promise<void> {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) return;

  await api.subscribePush({
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  });
}

/**
 * Minta izin, berlangganan ke push service, lalu daftarkan ke server.
 *
 * Izin hanya boleh diminta dari gestur pengguna — di beberapa browser jendela
 * izinnya tidak muncul sama sekali kalau dipanggil dari efek atau timer.
 */
export async function enablePush(publicKey: string): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifikasi diblokir untuk situs ini. Izinkan lagi lewat pengaturan browser."
        : "Izin notifikasi belum diberikan",
    );
  }

  const reg = await registration();
  const key = decodeKey(publicKey);
  const existing = await reg.pushManager.getSubscription();

  if (existing) {
    /* Langganan lama tetap dipakai kalau kunci servernya masih sama. Kalau
       kuncinya sudah berganti, ia tidak bisa dipakai lagi dan subscribe() akan
       menolak — jadi dilepas dulu. */
    if (sameKey(existing.options.applicationServerKey, key)) {
      await syncSubscription(existing);
      return existing;
    }
    await existing.unsubscribe();
  }

  const subscription = await reg.pushManager.subscribe({
    // Wajib true: browser tidak mengizinkan push yang tidak terlihat pengguna.
    userVisibleOnly: true,
    applicationServerKey: key,
  });

  await syncSubscription(subscription);
  return subscription;
}

/** Berhenti berlangganan di perangkat ini — perangkat lain tidak terpengaruh. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;

  // Server dulu: kalau urutannya dibalik dan tab tertutup di tengah jalan,
  // barisnya tertinggal di database dan kiriman berikutnya terbuang percuma.
  await api.unsubscribePush(subscription.endpoint);
  await subscription.unsubscribe();
}
