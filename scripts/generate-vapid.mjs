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

console.log(`
Salin ke .dev.vars untuk pengembangan lokal:

VAPID_PUBLIC_KEY="${publicKey}"
VAPID_PRIVATE_KEY="${privateKey}"

Untuk produksi, kunci privatnya dipasang sebagai secret (jangan masuk git):

  npx wrangler secret put VAPID_PRIVATE_KEY
  npx wrangler secret put VAPID_PUBLIC_KEY
`);
