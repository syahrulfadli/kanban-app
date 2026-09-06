import { useEffect } from "react";
import { backdropProfile, inkFor } from "../lib/backdrop";
import { useTheme } from "./useTheme";
import type { BoardBackground } from "../../shared/types";

/**
 * Menyalakan tinta adaptif untuk teks yang duduk langsung di atas foto latar.
 *
 * Jawabannya ditulis sebagai atribut di `<html>`, bukan diturunkan lewat prop.
 * Itu bukan jalan pintas: yang membutuhkannya ada di tempat-tempat yang tidak
 * bersaudara — kepala papan dan kepala kolom hidup di dalam BoardView,
 * sedangkan kapsul navigasi dan kredit pembuat hidup di App, yang sama sekali
 * tidak tahu papan apa yang sedang dibuka. Satu-satunya leluhur yang dimiliki
 * semuanya adalah dokumen itu sendiri, dan di sanalah `useTheme` sudah
 * menaruh temanya.
 *
 * Atributnya dilepas saat papannya ditinggalkan, jadi halaman lain tidak
 * pernah mewarisi tinta yang dihitung untuk foto yang tidak ada di sana.
 */
const TOP = "inkTop";
const TOP_END = "inkTopEnd";
const BOTTOM_START = "inkBottomStart";
const BOTTOM_CENTER = "inkBottomCenter";
const COLUMNS = "inkColumns";
const KEYS = [TOP, TOP_END, BOTTOM_START, BOTTOM_CENTER, COLUMNS] as const;

export function useBackdropInk(background: BoardBackground) {
  const { resolved: theme } = useTheme();

  const photo = background.kind === "image" ? background.image.url : null;
  const overlay = background.kind === "image" ? background.overlay : true;

  useEffect(() => {
    const root = document.documentElement;

    const clear = () => {
      for (const key of KEYS) delete root.dataset[key];
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
        const { top, topEnd, bottomStart, bottomCenter, columns } = inkFor(profile, {
          viewport: window.innerWidth / window.innerHeight,
          overlay,
          theme,
        });
        root.dataset[TOP] = top;
        root.dataset[TOP_END] = topEnd;
        root.dataset[BOTTOM_START] = bottomStart;
        root.dataset[BOTTOM_CENTER] = bottomCenter;
        root.dataset[COLUMNS] = columns;
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
