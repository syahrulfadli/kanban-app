import { useEffect, useState } from "react";

/* Pengungkap kredit pembuat.

   Kredit tidak pernah ikut mengalir bersama isi halaman — ia menempel di
   dasar layar, di bawah kapsul navigasi. Yang diatur di sini cuma satu hal:
   seberapa jauh ia sudah keluar, sebagai pecahan 0…1.

   Ada dua keadaan. Halaman yang muat di layar tidak punya gulir untuk
   dipakai sebagai isyarat, jadi kreditnya langsung berlabuh (nilai 1) dan
   kapsul naik memberi tempat. Halaman yang menggulir — termasuk papan kanban
   yang menggulir di dalam kolomnya sendiri — menyembunyikannya: mentok di
   dasar belum cukup, kreditnya baru keluar kalau gulirnya dipaksa lagi, dan
   masuk kembali begitu digulir ke atas.

   Tarikannya dilaporkan berkelanjutan, bukan sebagai sakelar: kredit
   mengikuti jari atau roda selama ditarik, jadi terasa ditarik keluar,
   bukan muncul tiba-tiba. */

/** Panjang tarikan berlebih (px) untuk membuka kredit sepenuhnya. */
const PULL = 110;
/** Diam selama ini dengan tarikan setengah jalan — kreditnya surut lagi. */
const RELEASE_MS = 260;

/* Apakah masih ada yang bisa digulir ke bawah dari titik ini? Ditelusuri dari
   sasaran acara ke atas: kolom kanban menggulir di dalam dirinya sendiri, dan
   selama masih ada sisa di salah satu induknya, gulirnya milik mereka —
   bukan isyarat untuk kredit. */
function canScrollDown(from: EventTarget | null): boolean {
  let node = from instanceof Element ? from : null;

  while (node) {
    if (node.scrollHeight - node.clientHeight > 1) {
      const overflow = getComputedStyle(node).overflowY;
      const scrollable = overflow === "auto" || overflow === "scroll";
      if (scrollable && node.scrollTop + node.clientHeight < node.scrollHeight - 1) return true;
    }
    node = node.parentElement;
  }

  const doc = document.scrollingElement;
  return !!doc && doc.scrollTop + doc.clientHeight < doc.scrollHeight - 1;
}

/* Gulir di dalam dialog milik dialog itu. Kreditnya duduk di bawah sapuan
   dialog, jadi menariknya dari sana hanya menggeser kapsul yang tak terlihat
   siapa pun — dan menyisakannya terbuka begitu dialognya ditutup. */
function inDialog(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('[aria-modal="true"]');
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
}

/**
 * @param locked Halaman yang mengunci diri setinggi layar (papan kanban).
 *   Di sana tidak ada gulir dokumen untuk diukur, jadi kreditnya tidak pernah
 *   berlabuh — selalu harus ditarik.
 * @returns Seberapa jauh kredit terbuka, 0…1.
 */
export function useCreditReveal(locked: boolean): number {
  const [docked, setDocked] = useState(false);
  const [pull, setPull] = useState(0);

  // Berlabuh atau tidak diukur ulang setiap isi halaman berubah tinggi —
  // daftar yang bertambah panjang bisa mengubah jawabannya di tengah jalan.
  useEffect(() => {
    if (locked) {
      setDocked(false);
      return;
    }

    const doc = document.documentElement;
    // Toleransi beberapa piksel: sisa gulir sependek ini bukan halaman yang
    // panjang, cuma pembulatan antara dvh dan tinggi isi.
    const measure = () => setDocked(doc.scrollHeight <= doc.clientHeight + 4);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(doc);
    ro.observe(document.body);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [locked]);

  useEffect(() => {
    if (docked) {
      setPull(0);
      return;
    }

    let px = 0;
    let timer = 0;

    const set = (next: number) => {
      const clamped = Math.max(0, Math.min(PULL, next));
      if (clamped === px) return;
      px = clamped;
      setPull(px / PULL);
    };

    // Tarikan yang berhenti di tengah jalan tidak menggantung: kalau tidak
    // sampai penuh, ia surut sendiri. Yang sudah penuh dibiarkan — menutupnya
    // butuh gulir ke atas, bukan sekadar diam.
    const relax = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (px < PULL) set(0);
      }, RELEASE_MS);
    };

    const onWheel = (e: WheelEvent) => {
      if (inDialog(e.target)) return;

      if (e.deltaY > 0) {
        if (canScrollDown(e.target)) {
          set(0);
          return;
        }
        set(px + e.deltaY);
        relax();
      } else if (e.deltaY < 0) {
        // Menutup dua kali lebih cepat daripada membuka: yang ingin kembali
        // ke atas tidak perlu menunggu kreditnya pamit.
        set(px + e.deltaY * 2);
      }
    };

    let lastX = 0;
    let lastY = 0;
    const onTouchStart = (e: TouchEvent) => {
      lastX = e.touches[0]?.clientX ?? 0;
      lastY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (inDialog(e.target)) return;

      const x = e.touches[0]?.clientX ?? lastX;
      const y = e.touches[0]?.clientY ?? lastY;
      const dx = lastX - x;
      const dy = lastY - y; // positif = jari naik = halaman digulir ke bawah
      lastX = x;
      lastY = y;

      // Menggeser papan ke samping bukan permintaan untuk kredit: usapan yang
      // lebih mendatar daripada menegak diabaikan.
      if (Math.abs(dx) > Math.abs(dy)) return;

      if (dy > 0) {
        if (canScrollDown(e.target)) {
          set(0);
          return;
        }
        set(px + dy * 1.4);
      } else if (dy < 0) {
        set(px + dy * 2.2);
      }
    };
    const onTouchEnd = () => {
      if (px < PULL) set(0);
    };

    // Setara papan tik untuk "digulir lagi ke bawah" — dua ketukan di dasar
    // halaman membuka kredit, satu ketukan ke atas menutupnya.
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target) || inDialog(e.target)) return;

      if (e.key === "End" || e.key === "PageDown" || e.key === "ArrowDown") {
        if (!canScrollDown(e.target)) set(px + PULL / 2);
      } else if (e.key === "Home" || e.key === "PageUp" || e.key === "ArrowUp") {
        set(0);
      }
    };

    /* Gulir lewat batang gulir tidak mengirim roda. Begitu wadahnya
       meninggalkan dasar, kreditnya ikut pamit. */
    const onScroll = (e: Event) => {
      if (px === 0 || inDialog(e.target)) return;
      const el = e.target === document ? document.scrollingElement : (e.target as Element);
      if (el && el.scrollTop + el.clientHeight < el.scrollHeight - 1) set(0);
    };

    window.addEventListener("wheel", onWheel, { passive: true, capture: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true, capture: true });
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("wheel", onWheel, { capture: true });
      window.removeEventListener("touchstart", onTouchStart, { capture: true });
      window.removeEventListener("touchmove", onTouchMove, { capture: true });
      window.removeEventListener("touchend", onTouchEnd, { capture: true });
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  }, [docked]);

  return docked ? 1 : pull;
}
