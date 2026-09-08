import {
  ATTACHMENT_FILE_MIMES,
  ATTACHMENT_IMAGE_MIMES,
  ATTACHMENT_MAX_DIMENSION,
  ATTACHMENT_MIMES,
  MAX_ATTACHMENT_BASE64,
  type AttachmentMime,
} from "../../shared/types";
import { blobToBase64, encodeCanvas, type CanvasEncoding } from "./imageCodec";

/**
 * Menyiapkan berkas pilihan pengguna menjadi lampiran kartu.
 *
 * Gambar diresize di browser sebelum dikirim (Worker tidak punya pengolah
 * gambar) — beda dengan foto profil, sisinya **tidak** dipotong persegi:
 * rasio aslinya penting untuk screenshot dan dokumen. Berkas non-gambar
 * dikirim apa adanya, tanpa diproses.
 */

/** Batas ukuran berkas mentah. Yang lebih besar dari ini pasti bukan lampiran wajar. */
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export interface AttachmentUpload {
  filename: string;
  mime: AttachmentMime;
  /** base64 tanpa awalan data URL — bentuk yang diminta server. */
  data: string;
  /** Data URL yang sama, untuk pratinjau sebelum unggahannya selesai. Null untuk berkas non-gambar. */
  preview: string | null;
}

const ENCODINGS: CanvasEncoding[] = [
  { mime: "image/webp", quality: 0.85 },
  { mime: "image/jpeg", quality: 0.85 },
];

async function prepareImage(file: File): Promise<AttachmentUpload> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Gambarnya tidak bisa dibaca");
  });

  const scale = Math.min(1, ATTACHMENT_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Browser ini tidak bisa memproses gambar");

  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await encodeCanvas(canvas, ENCODINGS);
  const data = await blobToBase64(blob);

  if (data.length > MAX_ATTACHMENT_BASE64) {
    throw new Error("Gambarnya terlalu besar setelah diproses — coba yang lain");
  }

  const mime = (ATTACHMENT_IMAGE_MIMES as readonly string[]).includes(blob.type)
    ? (blob.type as AttachmentMime)
    : "image/png";

  return { filename: file.name, mime, data, preview: `data:${mime};base64,${data}` };
}

async function prepareFile(file: File): Promise<AttachmentUpload> {
  if (!(ATTACHMENT_FILE_MIMES as readonly string[]).includes(file.type)) {
    throw new Error("Tipe berkas ini belum didukung");
  }

  const data = await blobToBase64(file);
  if (data.length > MAX_ATTACHMENT_BASE64) {
    throw new Error("Berkasnya terlalu besar — maksimal sekitar 350 KB");
  }

  return { filename: file.name, mime: file.type as AttachmentMime, data, preview: null };
}

export async function prepareAttachment(file: File): Promise<AttachmentUpload> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Berkasnya terlalu besar — maksimal 12 MB");
  }

  if (file.type.startsWith("image/")) return prepareImage(file);
  return prepareFile(file);
}

/** Untuk `accept` di `<input type="file">`. */
export const ATTACHMENT_ACCEPT = ATTACHMENT_MIMES.join(",");
