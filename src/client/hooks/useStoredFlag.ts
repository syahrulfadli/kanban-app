import { useCallback, useEffect, useState } from "react";

/* Kunci ditulis lengkap di tempat pemakaiannya, bukan dirakit dari argumen:
   satu-satunya cara mencari tahu apa saja yang disimpan aplikasi ini di
   peramban adalah dengan mencari awalannya di sumber. */
const PREFIX = "kanban:";

function read(key: string, fallback: boolean): boolean {
  try {
    const stored = localStorage.getItem(PREFIX + key);
    return stored === null ? fallback : stored === "1";
  } catch {
    // Mode privat. Sesi ini tetap berjalan dengan keadaan bawaannya.
    return fallback;
  }
}

/**
 * Satu sakelar tampilan yang diingat peramban.
 *
 * Untuk pilihan yang menjawab "bagaimana saya ingin membaca halaman ini",
 * bukan "apa isi kartunya": menyembunyikan panel followup dan membuka lini
 * masa lengkap tidak mengubah apa pun bagi rekan setim, jadi tempatnya di
 * peramban orangnya — bukan di server, dan bukan pula di state yang hilang
 * setiap kali dialognya ditutup.
 *
 * Satu kunci untuk seluruh aplikasi, bukan per kartu: yang diatur adalah
 * kebiasaan membaca, dan kebiasaan tidak berganti dari kartu ke kartu.
 */
export function useStoredFlag(key: string, fallback: boolean) {
  const [value, setValue] = useState(() => read(key, fallback));

  // Kunci yang berganti di tengah hidup komponen jarang terjadi, tapi kalau
  // terjadi ia harus membaca simpanannya sendiri, bukan meneruskan yang lama.
  useEffect(() => {
    setValue(read(key, fallback));
  }, [key, fallback]);

  const toggle = useCallback(() => {
    setValue((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(PREFIX + key, next ? "1" : "0");
      } catch {
        // Tidak persisten, tapi sakelarnya tetap bekerja untuk sesi ini.
      }
      return next;
    });
  }, [key]);

  return [value, toggle] as const;
}
