import type { CSSProperties } from "react";
import type { BackgroundImageBrief, BoardBackground } from "../../shared/types";

/**
 * Ukuran gambar yang diminta dari CDN Unsplash, per tempat pemakaiannya.
 *
 * Alamat yang tersimpan di database sengaja polos tanpa parameter ukuran
 * (lihat `cleanUnsplashUrl` di worker/routes/admin.ts), jadi satu barisnya
 * bisa melayani keping 160 piksel di pemilih dan latar 2400 piksel di papan.
 * Tanpa ini, pemilih berisi dua belas gambar layar penuh.
 */
export const BACKGROUND_WIDTHS = {
  /** Keping di pemilih latar dan di panel admin. */
  thumb: 320,
  /** Latar papan. Cukup untuk layar 2x pada lebar desktop yang wajar. */
  full: 2400,
} as const;

/**
 * Alamat gambar pada ukuran tertentu.
 *
 * `auto=format` membuat Unsplash mengirim AVIF/WebP ke peramban yang
 * menerimanya; `fit=crop` menjaga rasio kepingnya. Parameter ditulis ulang,
 * bukan ditambahkan, supaya alamat yang kebetulan sudah membawa `w` tidak
 * berakhir dengan dua.
 */
export function backgroundSrc(url: string, width: number): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("auto", "format");
    parsed.searchParams.set("fit", "crop");
    parsed.searchParams.set("w", String(width));
    parsed.searchParams.set("q", width > 1000 ? "72" : "60");
    return parsed.toString();
  } catch {
    // Alamat yang tidak bisa diurai dipakai apa adanya; server sudah
    // memeriksanya saat disimpan, jadi ini cuma jaring terakhir.
    return url;
  }
}

export const thumbSrc = (url: string) => backgroundSrc(url, BACKGROUND_WIDTHS.thumb);

/**
 * Atribut yang menggambar sebuah latar.
 *
 * Bentuknya sengaja atribut + custom property, bukan kelas: gradiasinya
 * tinggal di CSS (`.board-bg[data-gradient]`), jadi setiap gradiasi punya
 * satu bentuk untuk tema terang dan satu untuk gelap tanpa ada yang perlu
 * dihitung di sini. Yang dikirim JavaScript hanya namanya — dan, untuk
 * gambar, alamatnya.
 */
export function backgroundProps(background: BoardBackground): {
  "data-kind": BoardBackground["kind"];
  "data-gradient"?: string;
  style?: CSSProperties;
} {
  if (background.kind === "gradient") {
    return { "data-kind": "gradient", "data-gradient": background.gradient };
  }

  if (background.kind === "image") {
    return {
      "data-kind": "image",
      style: {
        "--board-image": `url("${backgroundSrc(background.image.url, BACKGROUND_WIDTHS.full)}")`,
      } as CSSProperties,
    };
  }

  return { "data-kind": "default" };
}

/** Gambar yang sedang dipakai papan, atau null kalau latarnya bukan gambar. */
export const backgroundPhoto = (background: BoardBackground): BackgroundImageBrief | null =>
  background.kind === "image" ? background.image : null;
