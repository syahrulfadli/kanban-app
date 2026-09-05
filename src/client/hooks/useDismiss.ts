import { useEffect, useRef, type RefObject } from "react";

/**
 * Tutup pop-up saat ditekan di luar wadahnya, atau saat Escape.
 *
 * Menerima BEBERAPA wadah, bukan satu. Lembar yang dipasang di <body> lewat
 * portal berhenti jadi keturunan tombol yang memunculkannya, jadi menanyakan
 * `contains` pada tombolnya saja akan menghitung setiap ketukan di dalam
 * lembar itu sendiri sebagai ketukan di luar — panel tertutup begitu disentuh.
 * Yang dianggap "di dalam" karenanya harus disebut satu per satu: tombolnya,
 * dan panelnya.
 *
 * `pointerdown`, bukan `click`: panel sudah tertutup sebelum kliknya mendarat
 * di apa pun yang kebetulan ada di bawahnya.
 */
export function useDismiss(
  open: boolean,
  close: () => void,
  refs: RefObject<HTMLElement | null>[],
) {
  /* Pendengarnya dipasang sekali per pembukaan, bukan tiap render: `close`
     dan larik ref lahir baru setiap kali komponennya digambar ulang, dan
     menaruhnya di daftar kebergantungan berarti melepas-pasang pendengar
     dokumen di setiap ketikan. */
  const latest = useRef({ close, refs });
  useEffect(() => {
    latest.current = { close, refs };
  });

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const { close, refs } = latest.current;
      if (!refs.some((ref) => ref.current?.contains(target))) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") latest.current.close();
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
}
