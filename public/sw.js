/**
 * Service worker aplikasi.
 *
 * Tugas utamanya cuma satu: menerima push dan memunculkan notifikasinya.
 * Inilah satu-satunya cara notifikasi bisa sampai saat tab aplikasinya sudah
 * ditutup — browser membangunkan berkas ini, bukan halamannya.
 *
 * Yang sengaja TIDAK dilakukan di sini: menyimpan aset aplikasi ke cache.
 * Berkas hasil build punya nama ber-hash dan dilayani Cloudflare dengan
 * caching-nya sendiri; menyalinnya lagi di sini cuma menambah satu tempat lagi
 * yang bisa menyajikan versi basi. Yang dicache hanya halaman offline.
 */

const OFFLINE_CACHE = "kanban-offline-v1";
const OFFLINE_PAGE = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_CACHE)
      // `reload` melewati cache HTTP: halaman offline yang ikut terbawa versi
      // lama tidak akan pernah diperbarui kalau diambil dari sana.
      .then((cache) => cache.add(new Request(OFFLINE_PAGE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Buang cache versi lama kalau namanya pernah berganti.
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== OFFLINE_CACHE).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Hanya permintaan halaman yang disentuh, dan hanya saat jaringannya gagal.
 * Aset lain lewat begitu saja tanpa perantara.
 */
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(async () => {
      const cache = await caches.open(OFFLINE_CACHE);
      return (await cache.match(OFFLINE_PAGE)) ?? Response.error();
    }),
  );
});

/**
 * Isi payload dibentuk server di src/worker/notify.ts:
 * { title, body, tag, url }.
 */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    // Push tanpa isi yang bisa dibaca tetap layak muncul — orangnya toh perlu
    // tahu ada sesuatu di papannya.
  }

  const title = payload.title || "Kanban";

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: payload.body || "Ada perubahan di papan Anda.",
        // Tag per kartu: kabar baru menimpa kabar lama tentang kartu yang sama,
        // jadi layar kunci tidak dipenuhi satu kartu yang sedang ramai disunting.
        tag: payload.tag || "kanban",
        icon: "/icons/icon-192.png",
        badge: "/icons/badge-96.png",
        lang: "id",
        timestamp: Date.now(),
        data: { url: payload.url || "/" },
      });

      /* Tab yang sedang terbuka ikut diberi tahu, supaya lencana di loncengnya
         bergerak saat itu juga alih-alih menunggu tarikan berkala berikutnya. */
      const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clients) client.postMessage({ type: "notification" });
    })(),
  );
});

/**
 * Push service boleh mengganti atau mencabut langganan kapan saja — kunci
 * lamanya kedaluwarsa, browsernya membersihkan diri. Kalau tidak ditangani di
 * sini, perangkatnya berhenti menerima kabar tanpa ada yang tahu, sampai
 * seseorang kebetulan membuka pengaturan notifikasi.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const key =
        event.newSubscription?.options?.applicationServerKey ??
        old?.options?.applicationServerKey;

      const fresh =
        event.newSubscription ??
        (key
          ? await self.registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: key,
            })
          : null);

      if (!fresh) return;

      const keys = fresh.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) return;

      const post = (path, body) =>
        fetch(path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Sesi login ikut terbawa; tanpa itu server tidak tahu ini siapa.
          credentials: "include",
          body: JSON.stringify(body),
        }).catch(() => {});

      await post("/api/push/subscribe", {
        endpoint: fresh.endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
      });

      if (old?.endpoint && old.endpoint !== fresh.endpoint) {
        await post("/api/push/unsubscribe", { endpoint: old.endpoint });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = new URL(event.notification.data?.url || "/", self.location.origin);

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      /* Kalau aplikasinya sudah terbuka di suatu tempat, ke sanalah kita
         menuju — bukan membuka jendela kedua. Rutenya berupa hash, jadi
         navigate() cuma menggeser halaman, tidak memuat ulang aplikasinya. */
      for (const client of clients) {
        if (new URL(client.url).origin !== self.location.origin) continue;

        await client.focus();
        if ("navigate" in client) {
          await client.navigate(target.href).catch(() => {});
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});
