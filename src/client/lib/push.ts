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

/** Kirim satu langganan ke server; jawabannya membawa kunci publik yang berlaku. */
async function register(subscription: PushSubscription): Promise<string | null> {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) return null;

  const { publicKey } = await api.subscribePush({
    endpoint: subscription.endpoint,
    keys: { p256dh: keys.p256dh, auth: keys.auth },
  });

  return publicKey;
}

/**
 * Titipkan kunci perangkat ke server, dan ikut menyadari kalau kunci VAPID
 * server sudah berganti.
 *
 * Rotasi kunci mematikan setiap langganan yang terikat pada kunci lama, dan
 * push service tidak pernah memberi tahu perangkatnya — ia hanya berhenti
 * menerima apa pun. Tanpa pemeriksaan ini, satu-satunya jalan pulih adalah
 * setiap orang mematikan lalu menyalakan sendiri sakelarnya di tiap perangkat,
 * padahal tidak ada yang tampak rusak dari luar.
 *
 * Izinnya sudah diberikan sejak langganan pertama, jadi mendaftar ulang di
 * sini tidak memunculkan jendela permintaan apa pun.
 */
export async function syncSubscription(subscription: PushSubscription): Promise<PushSubscription> {
  const publicKey = await register(subscription);
  if (!publicKey) return subscription;

  const key = decodeKey(publicKey);
  if (sameKey(subscription.options.applicationServerKey, key)) return subscription;

  // Langganan lama harus dilepas dulu: satu pendaftaran service worker cuma
  // boleh punya satu langganan, dan subscribe() menolak selama yang lama ada.
  const stale = subscription.endpoint;
  await subscription.unsubscribe();

  const fresh = await subscribe(await registration(), key);
  await register(fresh);
  await api.unsubscribePush(stale).catch(() => {
    // Baris lama tertinggal di server; kiriman berikutnya ke sana akan
    // dijawab 410 dan barisnya dibuang saat itu.
  });

  return fresh;
}

/**
 * Kegagalan yang datang dari browser sendiri, bukan dari server kita.
 *
 * `message` sudah berupa kalimat yang bisa dibaca orang, `hints` berisi apa
 * yang bisa mereka coba, dan `detail` menyimpan bunyi asli dari browser —
 * itulah yang berguna kalau nanti perlu dilaporkan.
 */
export class PushSetupError extends Error {
  readonly detail: string;
  readonly hints: string[];

  constructor(message: string, detail: string, hints: string[] = []) {
    super(message);
    this.name = "PushSetupError";
    this.detail = detail;
    this.hints = hints;
  }
}

/**
 * Terjemahkan kegagalan `subscribe()` jadi keterangan yang bisa ditindaklanjuti.
 *
 * Yang paling sering muncul adalah "Registration failed - push service error":
 * itu terjadi jauh sebelum ada permintaan ke server ini — browser gagal
 * mendaftarkan dirinya ke layanan push miliknya sendiri (FCM milik Google untuk
 * Chrome, WNS milik Microsoft untuk Edge di Windows). Karena itu ia muncul di
 * satu perangkat dan tidak di perangkat lain walau browsernya sama: yang
 * berbeda jaringannya, bukan aplikasinya.
 */
function explain(error: unknown): PushSetupError {
  const detail = error instanceof Error ? error.message : String(error);
  const name = error instanceof DOMException ? error.name : "";

  if (name === "AbortError" || /push service|registration failed/i.test(detail)) {
    return new PushSetupError(
      "Browser gagal mendaftar ke layanan push miliknya sendiri, jadi langganannya tidak pernah terbentuk.",
      detail,
      [
        "Coba jaringan lain — jaringan kantor, sekolah, VPN, dan sebagian ISP memblokir server notifikasi Google (FCM) maupun Microsoft (WNS).",
        "Matikan VPN atau proxy, lalu coba lagi.",
        "Pastikan notifikasi sistem menyala dan browsernya diizinkan menampilkannya.",
        "Periksa jam dan tanggal perangkat: jam yang meleset membuat sambungan ke layanan push ditolak.",
      ],
    );
  }

  if (name === "NotAllowedError") {
    return new PushSetupError(
      "Notifikasi diblokir untuk situs ini.",
      detail,
      ["Izinkan lagi lewat pengaturan situs di browser, lalu muat ulang halaman ini."],
    );
  }

  if (name === "InvalidStateError") {
    return new PushSetupError(
      "Masih ada langganan lama di perangkat ini yang memakai kunci berbeda.",
      detail,
      ["Muat ulang halaman ini, lalu nyalakan sekali lagi."],
    );
  }

  return new PushSetupError("Gagal mendaftarkan perangkat ini.", detail);
}

/**
 * Berlangganan, dengan satu kesempatan kedua.
 *
 * Sisa langganan yang setengah jadi bisa menggagalkan percobaan berikutnya
 * tanpa pernah bilang apa-apa, jadi sebelum mengulang semuanya dibersihkan
 * dulu. Kalau yang kedua juga gagal, yang dilaporkan tetap kegagalan pertama:
 * itulah yang menjelaskan sebabnya, sedangkan yang kedua cuma gemanya.
 */
async function subscribe(
  reg: ServiceWorkerRegistration,
  key: Uint8Array<ArrayBuffer>,
): Promise<PushSubscription> {
  const options = { userVisibleOnly: true, applicationServerKey: key } as const;

  try {
    return await reg.pushManager.subscribe(options);
  } catch (first) {
    try {
      const leftover = await reg.pushManager.getSubscription();
      await leftover?.unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 800));
      return await reg.pushManager.subscribe(options);
    } catch {
      throw explain(first);
    }
  }
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
    throw permission === "denied"
      ? new PushSetupError("Notifikasi diblokir untuk situs ini.", "permission: denied", [
          "Izinkan lagi lewat pengaturan situs di browser, lalu muat ulang halaman ini.",
        ])
      : new PushSetupError("Izin notifikasi belum diberikan.", "permission: default");
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

  // `userVisibleOnly: true` dipasang di dalam: browser tidak mengizinkan push
  // yang tidak terlihat pengguna.
  const subscription = await subscribe(reg, key);

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
