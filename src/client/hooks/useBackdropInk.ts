import { useEffect } from "react";
import { backdropProfile, inkFor } from "../lib/backdrop";
import { useTheme } from "./useTheme";
import type { BoardBackground } from "../../shared/types";

/**
 * Menyalakan tinta adaptif untuk teks yang duduk langsung di atas foto latar.
 *
 * Jawabannya ditulis sebagai atribut di `<html>`, bukan diturunkan lewat prop.
 * Itu bukan jalan pintas: yang membutuhkannya ada di dua tempat yang tidak
 * bersaudara — kepala papan hidup di dalam BoardView, sedangkan kredit pembuat
 * hidup di kapsul navigasi milik App, yang sama sekali tidak tahu papan apa
 * yang sedang dibuka. Satu-satunya leluhur yang dimiliki keduanya adalah
 * dokumen itu sendiri, dan di sanalah `useTheme` sudah menaruh temanya.
 *
 * Atributnya dilepas saat papannya ditinggalkan, jadi halaman lain tidak
 * pernah mewarisi tinta yang dihitung untuk foto yang tidak ada di sana.
 */
const TOP = "inkTop";
const TOP_END = "inkTopEnd";
const BOTTOM = "inkBottom";

export function useBackdropInk(background: BoardBackground) {
  const { resolved: theme } = useTheme();

  const photo = background.kind === "image" ? background.image.url : null;
  const overlay = background.kind === "image" ? background.overlay : true;

  useEffect(() => {
    const root = document.documentElement;

    const clear = () => {
      delete root.dataset[TOP];
      delete root.dataset[TOP_END];
      delete root.dataset[BOTTOM];
    };

    if (!photo) {
      clear();
      return;
    }

    /* Foto boleh berganti selagi pengukuran sebelumnya masih berjalan. Tanpa
       penanda ini, jawaban yang datang terlambat akan menimpa jawaban untuk
       foto yang sekarang. */
    let live = true;
    let cleanup: (() => void) | null = null;

    void backdropProfile(photo).then((profile) => {
      if (!live) return;

      if (!profile) {
        // Tidak terukur — tinta tema yang berlaku, seperti sebelumnya.
        clear();
        return;
      }

      const paint = () => {
        const { top, topEnd, bottom } = inkFor(profile, {
          viewport: window.innerWidth / window.innerHeight,
          overlay,
          theme,
        });
        root.dataset[TOP] = top;
        root.dataset[TOP_END] = topEnd;
        root.dataset[BOTTOM] = bottom;
      };

      paint();

      /* Jendela yang berubah bentuk mengubah bagian foto yang terlihat, dan
         dengan itu jawabannya. Perhitungannya cuma penjumlahan beberapa puluh
         angka dari profil yang sudah ada, jadi tidak perlu ditahan. */
      window.addEventListener("resize", paint);
      cleanup = () => window.removeEventListener("resize", paint);
    });

    return () => {
      live = false;
      cleanup?.();
      clear();
    };
  }, [photo, overlay, theme]);
}
