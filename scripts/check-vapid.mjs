/**
 * Periksa sepasang kunci VAPID sebelum dipasang.
 *
 *   node scripts/check-vapid.mjs                 # baca dari .dev.vars
 *   node scripts/check-vapid.mjs <publik> <privat>
 *
 * Bentuknya diperiksa, lalu — yang paling penting — pasangannya dibuktikan:
 * sesuatu ditandatangani dengan kunci privatnya dan diverifikasi dengan kunci
 * publiknya. Dua kunci yang sama-sama sah tapi bukan sepasang akan lolos
 * pemeriksaan bentuk dan tetap ditolak push service, jadi hanya uji inilah yang
 * benar-benar menjawab "boleh dipasang atau tidak".
 *
 * Kunci privatnya tidak pernah ikut tercetak.
 */

import { readFileSync } from "node:fs";

const bytes = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(normalized, "base64"));
};

const b64url = (buffer) =>
  Buffer.from(buffer).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Nilai bergaya env: tanda kutip dan spasi di ujung dibuang, seperti di Worker. */
function fromDevVars(name) {
  const file = new URL("../.dev.vars", import.meta.url);
  const line = readFileSync(file, "utf8")
    .split("\n")
    .find((row) => row.trimStart().startsWith(`${name}=`));

  return (line ?? "")
    .slice((line ?? "").indexOf("=") + 1)
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

const [argPublic, argPrivate] = process.argv.slice(2);
const publicKey = (argPublic ?? fromDevVars("VAPID_PUBLIC_KEY")).trim();
const privateKey = (argPrivate ?? fromDevVars("VAPID_PRIVATE_KEY")).trim();

const problems = [];

if (!publicKey) problems.push("VAPID_PUBLIC_KEY kosong.");
if (!privateKey) problems.push("VAPID_PRIVATE_KEY kosong.");

const point = publicKey ? bytes(publicKey) : new Uint8Array();
const secret = privateKey ? bytes(privateKey) : new Uint8Array();

if (publicKey && (point.length !== 65 || point[0] !== 4)) {
  problems.push(
    `VAPID_PUBLIC_KEY harus 65 bita dan diawali 0x04 (titik P-256 tak terkompresi); yang ada ${point.length} bita.`,
  );
}

if (privateKey && secret.length !== 32) {
  problems.push(
    `VAPID_PRIVATE_KEY harus 32 bita; yang ada ${secret.length} bita.` +
      (secret.length === 65
        ? " Sepertinya kunci publik yang tersalin ke tempat kunci privat."
        : ""),
  );
}

if (problems.length > 0) {
  console.error("\n❌ Belum bisa dipakai:\n");
  for (const problem of problems) console.error(`   • ${problem}`);
  console.error("\nBuat sepasang yang baru dengan: npm run vapid:keys\n");
  process.exit(1);
}

const jwk = {
  kty: "EC",
  crv: "P-256",
  x: b64url(point.subarray(1, 33)),
  y: b64url(point.subarray(33, 65)),
};

const algorithm = { name: "ECDSA", namedCurve: "P-256" };
const message = new TextEncoder().encode("uji pasangan kunci VAPID");

let matched = false;
try {
  const signer = await crypto.subtle.importKey("jwk", { ...jwk, d: privateKey }, algorithm, false, [
    "sign",
  ]);
  const verifier = await crypto.subtle.importKey("jwk", jwk, algorithm, false, ["verify"]);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signer, message);

  matched = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifier, signature, message);
} catch (e) {
  console.error(`\n❌ Kunci privatnya ditolak WebCrypto: ${e.message}\n`);
  process.exit(1);
}

if (!matched) {
  console.error("\n❌ Bentuk keduanya sah, tapi bukan sepasang — tanda tangannya tidak terverifikasi.");
  console.error("   Pakai pasangan yang benar, atau buat baru: npm run vapid:keys\n");
  process.exit(1);
}

console.log("\n✅ Sepasang dan siap dipakai.");
console.log(`   Kunci publik: ${publicKey}`);
console.log("   Kunci privat: sah (tidak dicetak).\n");
