/**
 * Pengiriman Web Push langsung dari Worker — tanpa pustaka dan tanpa layanan
 * pihak ketiga, jadi tidak ada biaya tambahan dan tidak ada kunci yang
 * dititipkan ke siapa pun.
 *
 * Dua spesifikasi bertemu di berkas ini:
 *
 *   • RFC 8291 — isi notifikasi dienkripsi ujung-ke-ujung (aes128gcm) dengan
 *     kunci milik perangkat penerima, sehingga push service milik Google atau
 *     Mozilla yang meneruskannya pun tidak bisa membaca isinya.
 *   • RFC 8292 (VAPID) — setiap kiriman ditandatangani, supaya push service
 *     tahu pengirimnya server ini dan bukan orang lain yang mencuri endpoint.
 *
 * Semuanya memakai WebCrypto yang sudah ada di runtime Workers.
 */

const enc = new TextEncoder();

/** Kurva yang dipakai Web Push — satu-satunya yang diizinkan spesifikasi. */
const P256 = { name: "ECDH", namedCurve: "P-256" } as const;

/**
 * Ukuran record aes128gcm. Satu notifikasi selalu muat dalam satu record,
 * jadi angka ini cuma perlu lebih besar daripada payload terpanjang.
 */
const RECORD_SIZE = 4096;

/** Sisa ruang untuk teks setelah tag GCM dan penanda akhir record. */
const MAX_PAYLOAD = RECORD_SIZE - 16 - 1;

/** Berapa lama push service menahan notifikasi untuk perangkat yang offline. */
const TTL_SECONDS = 24 * 60 * 60;

/** Umur token VAPID. Spesifikasi melarang lebih dari 24 jam. */
const TOKEN_LIFETIME_MS = 12 * 60 * 60 * 1000;

/**
 * Kunci yang terpasang tidak bisa dipakai — ini salah pasang, bukan salah
 * kirim. Dibedakan supaya pemanggilnya bisa menjawab dengan kalimat yang
 * menjelaskan, alih-alih membiarkannya jatuh jadi 500 tanpa keterangan.
 */
export class VapidConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VapidConfigError";
  }
}

/**
 * Bersihkan nilai secret dari bawaan yang tidak disengaja.
 *
 * `npm run vapid:keys` mencetak barisnya lengkap dengan tanda kutip karena itu
 * bentuk yang benar untuk .dev.vars — tapi `wrangler secret put` membaca apa
 * adanya, jadi tanda kutip yang ikut tersalin akan tersimpan sebagai bagian
 * dari kuncinya. Spasi dan baris baru di ujung juga gampang ikut terbawa.
 */
const clean = (value: string | undefined): string =>
  (value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();

/**
 * Kunci publik yang boleh diketahui klien — sudah dibersihkan, jadi bentuknya
 * sama persis dengan yang dipakai penanda tangan. Null berarti belum dipasang.
 */
export const vapidPublicKey = (env: Env): string | null => clean(env.VAPID_PUBLIC_KEY) || null;

/**
 * Alamat pengirim untuk klaim `sub` — mailto: atau https:, kata spesifikasinya.
 * Kandidat dicoba berurutan supaya satu nilai yang salah tulis tidak mematikan
 * seluruh fiturnya: alamat aplikasinya sendiri selalu jadi jaring terakhir.
 */
function subjectFrom(candidates: (string | undefined)[]): string {
  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const url = new URL(candidate);
      if (url.protocol === "mailto:") return candidate;
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // Bukan alamat yang sah; coba kandidat berikutnya.
    }
  }

  throw new VapidConfigError(
    "Tidak ada alamat pengirim yang sah untuk VAPID. Isi VAPID_SUBJECT dengan mailto: atau https:, atau pastikan BETTER_AUTH_URL berupa alamat lengkap.",
  );
}

/* ── Base64url ─────────────────────────────────────────────────────
   Semua kunci Web Push berpindah sebagai base64url tanpa padding —
   itulah bentuk yang dikeluarkan `PushSubscription` di browser. */

export function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlToBytes(value: string): Uint8Array {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Kunci publik perangkat, persis seperti yang dikirim browser saat mendaftar. */
export interface DeviceKeys {
  /** Kunci publik ECDH perangkat (titik tak terkompresi, 65 bita). */
  p256dh: string;
  /** Rahasia autentikasi perangkat (16 bita). */
  auth: string;
}

/**
 * Enkripsi satu payload untuk satu perangkat (RFC 8291 §3).
 *
 * `seed` hanya diisi oleh pengujian: dengan salt dan kunci sesaat yang tetap,
 * hasilnya bisa dibandingkan dengan contoh resmi di RFC. Di jalur normal
 * keduanya diacak ulang setiap kiriman — itu syarat keamanan aes128gcm.
 */
export async function encryptPayload(
  device: DeviceKeys,
  plaintext: Uint8Array,
  seed?: { salt: Uint8Array; keyPair: CryptoKeyPair },
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PAYLOAD) {
    throw new Error("Isi notifikasi melebihi satu record push");
  }

  const salt = seed?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const keyPair =
    seed?.keyPair ??
    ((await crypto.subtle.generateKey(P256, true, ["deriveBits"])) as CryptoKeyPair);

  const uaPublic = base64UrlToBytes(device.p256dh);
  const authSecret = base64UrlToBytes(device.auth);

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, P256, false, []);
  const asPublic = new Uint8Array(
    (await crypto.subtle.exportKey("raw", keyPair.publicKey)) as ArrayBuffer,
  );

  /* Rahasia bersama ECDH: perangkat menghitung angka yang sama dari kunci
     publik sesaat yang ikut dikirim di header record.

     Cast-nya perlu karena tipe bawaan Workers menamai field ini `$public`,
     sedangkan yang diminta runtime — dan standar WebCrypto — adalah `public`. */
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm,
      keyPair.privateKey,
      256,
    ),
  );

  /* Rahasia bersama diikat ke kedua kunci publik lebih dulu. Tanpa langkah
     ini, satu rahasia yang bocor berlaku untuk semua pengirim; dengan `auth`
     perangkat sebagai salt, hanya yang tahu rahasia itu bisa menyusunnya. */
  const ikm = await hkdf(
    authSecret,
    shared,
    concat(enc.encode("WebPush: info\0"), uaPublic, asPublic),
    32,
  );

  const contentKey = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", contentKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce },
      aesKey,
      // 0x02 menandai record terakhir; tanpa itu penerima menganggap masih
      // ada lanjutan dan menolak seluruh kiriman.
      concat(plaintext, new Uint8Array([2])),
    ),
  );

  // Header record: salt(16) ‖ ukuran record(4) ‖ panjang kunci(1) ‖ kunci(65).
  const header = new Uint8Array(21);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPublic.length;

  return concat(header, asPublic, ciphertext);
}

/**
 * Kunci privat VAPID disimpan sebagai 32 bita mentah base64url — bentuk yang
 * sama dengan keluaran `web-push generate-vapid-keys`, jadi kunci lama tetap
 * bisa dipakai. WebCrypto hanya mau menerimanya lewat JWK, dan JWK menuntut
 * kunci publiknya ikut disebut; keduanya dipecah dari titik yang sama.
 */
async function importSigningKey(publicKey: string, privateKey: string): Promise<CryptoKey> {
  /* Nilai yang bukan base64url pun harus menyebut variabelnya: kesalahan
     tersering adalah seluruh baris `VAPID_PRIVATE_KEY=…` ikut tersalin, dan
     "Invalid character" dari atob tidak memberi tahu itu. */
  const decode = (value: string, name: string) => {
    try {
      return base64UrlToBytes(value);
    } catch {
      throw new Error(`${name} bukan base64url yang sah — nama variabelnya ikut tersalin?`);
    }
  };

  const point = decode(publicKey, "VAPID_PUBLIC_KEY");
  const secret = decode(privateKey, "VAPID_PRIVATE_KEY");

  /* Bentuk keduanya diperiksa sendiri lebih dulu. WebCrypto memang menolak
     nilai yang salah, tapi keluhannya tidak menyebut variabel mana yang harus
     dibetulkan — padahal justru itu satu-satunya yang perlu diketahui. */
  if (point.length !== 65 || point[0] !== 4) {
    throw new Error(
      `VAPID_PUBLIC_KEY harus 65 bita diawali 0x04 (titik P-256 tak terkompresi), yang ada ${point.length} bita`,
    );
  }

  if (secret.length !== 32) {
    throw new Error(
      `VAPID_PRIVATE_KEY harus 32 bita, yang ada ${secret.length} bita` +
        (secret.length === 65 ? " — sepertinya kunci publik yang tersalin ke sini" : ""),
    );
  }

  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: bytesToBase64Url(point.subarray(1, 33)),
      y: bytesToBase64Url(point.subarray(33, 65)),
      d: privateKey,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** Token VAPID untuk satu push service (RFC 8292 §2). */
async function signToken(key: CryptoKey, audience: string, subject: string): Promise<string> {
  const segment = (value: unknown) => bytesToBase64Url(enc.encode(JSON.stringify(value)));

  const unsigned =
    segment({ typ: "JWT", alg: "ES256" }) +
    "." +
    segment({
      aud: audience,
      exp: Math.floor((Date.now() + TOKEN_LIFETIME_MS) / 1000),
      sub: subject,
    });

  // WebCrypto mengeluarkan tanda tangan ECDSA dalam bentuk r‖s mentah —
  // persis yang diminta JWS, tanpa perlu membongkar DER.
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(unsigned)),
  );

  return `${unsigned}.${bytesToBase64Url(signature)}`;
}

export interface PushDevice extends DeviceKeys {
  endpoint: string;
}

/**
 * `gone` berarti perangkatnya sudah tidak ada — langganannya dicabut, atau
 * browsernya dipasang ulang. Barisnya harus dihapus, bukan dicoba lagi.
 */
export type PushOutcome = "ok" | "gone" | "failed";

export interface Pusher {
  /** Kunci publik VAPID; klien membutuhkannya untuk mendaftar. */
  publicKey: string;
  send(device: PushDevice, payload: unknown): Promise<PushOutcome>;
}

/**
 * Penyiap kiriman untuk satu request. Mengembalikan null kalau kunci VAPID
 * belum dipasang — notifikasi cuma mati, aplikasinya tetap jalan.
 */
export async function createPusher(env: Env, origin?: string): Promise<Pusher | null> {
  const publicKey = clean(env.VAPID_PUBLIC_KEY);
  const privateKey = clean(env.VAPID_PRIVATE_KEY);

  // Belum dipasang sama sekali: fiturnya mati, dan itu bukan kesalahan.
  if (!publicKey || !privateKey) return null;

  let signingKey: CryptoKey;
  try {
    signingKey = await importSigningKey(publicKey, privateKey);
  } catch (e) {
    throw new VapidConfigError(
      `Kunci VAPID tidak bisa dipakai (${e instanceof Error ? e.message : String(e)}). ` +
        "Pastikan keduanya berasal dari satu pasang yang sama — `npm run vapid:keys` — dan tersimpan tanpa tanda kutip.",
    );
  }

  /* Kepada siapa push service boleh mengeluh kalau kiriman kita bermasalah.
     Alamat aplikasinya sendiri sudah memenuhi syarat, jadi tidak perlu rahasia
     tambahan; `origin` permintaan yang sedang berjalan jadi jaring terakhir
     kalau BETTER_AUTH_URL belum terpasang benar. */
  const subject = subjectFrom([clean(env.VAPID_SUBJECT), clean(env.BETTER_AUTH_URL), origin]);

  // Satu token berlaku untuk semua perangkat di push service yang sama, dan
  // menandatanganinya tidak gratis — jadi disimpan per origin.
  const tokens = new Map<string, Promise<string>>();

  const tokenFor = (endpoint: string) => {
    const audience = new URL(endpoint).origin;
    let token = tokens.get(audience);
    if (!token) tokens.set(audience, (token = signToken(signingKey, audience, subject)));
    return token;
  };

  return {
    publicKey,

    async send(device, payload) {
      try {
        const body = await encryptPayload(device, enc.encode(JSON.stringify(payload)));

        const res = await fetch(device.endpoint, {
          method: "POST",
          headers: {
            Authorization: `vapid t=${await tokenFor(device.endpoint)}, k=${publicKey}`,
            "Content-Encoding": "aes128gcm",
            "Content-Type": "application/octet-stream",
            TTL: String(TTL_SECONDS),
            Urgency: "normal",
          },
          body,
        });

        if (res.status === 404 || res.status === 410) return "gone";

        if (!res.ok) {
          console.error("Push ditolak", res.status, await res.text().catch(() => ""));
          return "failed";
        }

        return "ok";
      } catch (e) {
        console.error("Push gagal dikirim", e);
        return "failed";
      }
    },
  };
}
