/**
 * Encode canvas → Blob dan Blob → base64 — dipakai foto profil dan lampiran
 * kartu, keduanya memangkas/meresize gambar di browser sebelum mengirimnya.
 */

export interface CanvasEncoding {
  mime: string;
  quality: number;
}

/**
 * Alasan baku kegagalan memproses gambar/berkas — bukan kalimat siap tampil.
 * Kalimatnya sendiri tinggal di kamus bahasa (`client/i18n`, kunci
 * `mediaErrors`); pemanggil yang punya akses ke `useT()` yang menerjemahkan.
 */
export type MediaErrorReason =
  | "notAnImage"
  | "tooLarge12mbImage"
  | "tooLarge12mbFile"
  | "unreadableImage"
  | "cantProcessImage"
  | "tooLargeAfterProcessing"
  | "tooLargeAfterProcessingRetry"
  | "unsupportedFileType"
  | "tooLarge350kb";

export class MediaError extends Error {
  readonly reason: MediaErrorReason;

  constructor(reason: MediaErrorReason) {
    super(reason);
    this.name = "MediaError";
    this.reason = reason;
  }
}

/**
 * WebP jauh lebih kecil pada mutu yang sama, tapi tidak semua browser bisa
 * mengencode-nya. `toBlob` yang tidak mengenal tipenya diam-diam mengembalikan
 * PNG — jadi tipe hasilnya yang diperiksa, bukan daftar browser.
 */
export function encodeCanvas(
  canvas: HTMLCanvasElement,
  encodings: readonly CanvasEncoding[],
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const attempt = (index: number) => {
      const { mime, quality } = encodings[index];
      const last = index === encodings.length - 1;

      canvas.toBlob(
        (blob) => {
          if (blob && (blob.type === mime || last)) return resolve(blob);
          if (last) return reject(new MediaError("cantProcessImage"));
          attempt(index + 1);
        },
        mime,
        quality,
      );
    };

    attempt(0);
  });
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  // Dicicil per potongan: satu spread berisi ratusan ribu argumen membuat
  // String.fromCharCode melampaui batas tumpukan pemanggilan.
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}
