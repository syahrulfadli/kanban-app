/**
 * Bikin sepasang kunci VAPID untuk notifikasi push.
 *
 *   node scripts/generate-vapid.mjs
 *
 * Bentuknya sama dengan keluaran `web-push generate-vapid-keys`: kunci publik
 * berupa titik P-256 tak terkompresi, kunci privat berupa 32 bita mentah —
 * keduanya base64url. Satu pasang dipakai selamanya untuk satu aplikasi:
 * menggantinya membuat semua langganan perangkat yang sudah ada berhenti
 * bekerja, dan semua orang harus mengaktifkan notifikasi lagi dari nol.
 */

const b64url = (bytes) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
  "sign",
  "verify",
]);

const publicKey = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)));
const { d: privateKey } = await crypto.subtle.exportKey("jwk", pair.privateKey);

/* Dua bentuk, karena tempatnya menuntut bentuk berbeda: .dev.vars membaca
   baris bergaya env (tanda kutip ikut dibuang), sedangkan `wrangler secret put`
   menyimpan apa pun yang ditempel apa adanya — termasuk tanda kutipnya. */
console.log(`
1) Untuk pengembangan lokal, salin dua baris ini ke .dev.vars:

VAPID_PUBLIC_KEY="${publicKey}"
VAPID_PRIVATE_KEY="${privateKey}"

2) Untuk produksi, jalankan dua perintah ini lalu tempel NILAINYA SAJA saat
   diminta — tanpa tanda kutip, tanpa nama variabelnya:

  npx wrangler secret put VAPID_PUBLIC_KEY
  ${publicKey}

  npx wrangler secret put VAPID_PRIVATE_KEY
  ${privateKey}

Keduanya harus berasal dari satu pasang yang sama. Mengganti pasangannya
membuat semua langganan perangkat yang sudah ada berhenti bekerja.
`);
