import { AVATAR_MIMES, AVATAR_SIZE, MAX_AVATAR_BASE64, type AvatarMime } from "../../shared/types";

/**
 * Menyiapkan berkas pilihan pengguna menjadi foto profil.
 *
 * Pemangkasan terjadi di browser, bukan di server: Worker tidak punya pengolah
 * gambar, dan mengirim foto kamera 4 MB ke sana untuk disimpan apa adanya
 * berarti setiap avatar kecil di aplikasi mengunduh 4 MB itu kembali.
 *
 * Hasilnya persegi AVATAR_SIZE piksel — cukup untuk avatar terbesar di
 * aplikasi ini pada layar retina, dan jatuh di kisaran puluhan kilobita.
 */

/** Batas ukuran berkas mentah. Yang lebih besar dari ini pasti bukan foto profil. */
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export interface AvatarUpload {
  mime: AvatarMime;
  /** base64 tanpa awalan data URL — bentuk yang diminta server. */
  data: string;
  /** Data URL yang sama, untuk pratinjau sebelum unggahannya selesai. */
  preview: string;
}

/**
 * WebP jauh lebih kecil pada mutu yang sama, tapi tidak semua browser bisa
 * mengencode-nya. `toBlob` yang tidak mengenal tipenya diam-diam mengembalikan
 * PNG — jadi tipe hasilnya yang diperiksa, bukan daftar browser.
 */
const ENCODINGS: { mime: AvatarMime; quality: number }[] = [
  { mime: "image/webp", quality: 0.85 },
  { mime: "image/jpeg", quality: 0.85 },
];

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const attempt = (index: number) => {
      const { mime, quality } = ENCODINGS[index];
      const last = index === ENCODINGS.length - 1;

      canvas.toBlob(
        (blob) => {
          if (blob && (blob.type === mime || last)) return resolve(blob);
          if (last) return reject(new Error("Browser ini tidak bisa memproses gambar"));
          attempt(index + 1);
        },
        mime,
        quality,
      );
    };

    attempt(0);
  });
}

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // Dicicil per potongan: satu spread berisi ratusan ribu argumen membuat
  // String.fromCharCode melampaui batas tumpukan pemanggilan.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
};

export async function prepareAvatar(file: File): Promise<AvatarUpload> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Berkas itu bukan gambar");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Gambarnya terlalu besar — maksimal 12 MB");
  }

  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Gambarnya tidak bisa dibaca");
  });

  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini tidak bisa memproses gambar");

  // Pangkas dari tengah: sisi terpendeknya yang menentukan, jadi foto potret
  // maupun lanskap sama-sama jadi persegi tanpa gepeng.
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();

  const blob = await encode(canvas);
  const data = await toBase64(blob);

  if (data.length > MAX_AVATAR_BASE64) {
    throw new Error("Gambarnya terlalu besar setelah diproses");
  }

  const mime = (AVATAR_MIMES as readonly string[]).includes(blob.type)
    ? (blob.type as AvatarMime)
    : "image/png";

  return { mime, data, preview: `data:${mime};base64,${data}` };
}
