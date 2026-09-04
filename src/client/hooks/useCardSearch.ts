import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { MIN_QUERY_LENGTH } from "../../shared/search";
import type { CardSearchHit } from "../../shared/types";

/**
 * Jeda sebelum ketikan dikirim ke server. Cukup untuk menelan satu kata yang
 * diketik lancar, dan masih terasa hidup — pencarian yang menunggu lebih lama
 * dari ini terbaca sebagai pencarian yang harus ditekan Enter dulu.
 */
const DEBOUNCE_MS = 220;

/**
 * Hasil pencarian untuk kata kunci yang sedang diketik.
 *
 * Kata kunci yang belum cukup panjang tidak pernah sampai ke server, dan
 * jawaban yang datang terlambat dibuang: yang tampil selalu jawaban atas apa
 * yang terakhir diketik, bukan atas ketikan yang sudah dihapus.
 */
export function useCardSearch(query: string) {
  const [hits, setHits] = useState<CardSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const term = query.trim();
  const ready = term.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    if (!ready) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }

    /* Menyala sejak huruf pertama, bukan setelah jeda habis: yang ditunggu
       orang adalah tanda bahwa ketikannya sampai, dan daftar lama yang diam
       selama seperlima detik terbaca sebagai hasil untuk kata yang baru. */
    setLoading(true);
    let alive = true;

    const timer = setTimeout(() => {
      void api
        .searchCards(term)
        .then((found) => {
          if (!alive) return;
          setHits(found);
          setError(null);
        })
        .catch((e: unknown) => {
          if (!alive) return;
          setHits([]);
          setError(e instanceof Error ? e.message : "Pencarian gagal");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [term, ready]);

  return { hits, loading, error, ready, term };
}
