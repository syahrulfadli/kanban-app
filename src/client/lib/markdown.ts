import { marked } from "marked";
import DOMPurify from "dompurify";

/* `breaks: true` supaya baris baru tunggal tetap terlihat sebagai baris
   baru — persis kebiasaan textarea polos yang digantikannya. Tanpa ini,
   markdown standar butuh baris kosong untuk memisahkan paragraf, dan
   deskripsi/followup lama yang cuma menekan Enter sekali akan terlihat
   menyatu jadi satu paragraf panjang. */
marked.use({ breaks: true, gfm: true });

/**
 * Markdown → HTML aman-tampil.
 *
 * Disaring lewat DOMPurify tanpa syarat: sumbernya ditulis pengguna lain
 * dan dibaca banyak orang (followup, deskripsi kartu), jadi ini satu-satunya
 * pintu keluar HTML yang tidak boleh dilewati apa pun keadaannya.
 */
export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html);
}
