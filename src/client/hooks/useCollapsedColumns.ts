import { useCallback, useEffect, useState } from "react";

/* Kolom yang disusutkan disimpan di peramban, bukan di server: yang dijawab
   fitur ini adalah "apa yang sedang saya kerjakan sekarang", dan itu milik
   satu orang di satu layar. Menyimpannya di kolom akan membuat seseorang yang
   sedang fokus ikut menyusutkan papan untuk semua rekannya.

   Satu kunci per papan, supaya papan yang satu tidak ikut terlipat gara-gara
   papan yang lain. */
const keyFor = (boardId: string) => `kanban:collapsed:${boardId}`;

function read(boardId: string): Set<string> {
  try {
    const stored = localStorage.getItem(keyFor(boardId));
    if (!stored) return new Set();

    const parsed: unknown = JSON.parse(stored);
    if (Array.isArray(parsed)) return new Set(parsed.filter((id) => typeof id === "string"));
  } catch {
    // Mode privat, atau isian yang rusak. Papan terbuka penuh saja.
  }
  return new Set();
}

function write(boardId: string, ids: Set<string>) {
  try {
    if (ids.size === 0) localStorage.removeItem(keyFor(boardId));
    else localStorage.setItem(keyFor(boardId), JSON.stringify([...ids]));
  } catch {
    // Tidak persisten, tapi sesi ini tetap berjalan.
  }
}

/**
 * Kolom mana saja yang sedang disusutkan di papan ini.
 *
 * `known` adalah id kolom yang masih ada di papan; kolom yang sudah dihapus
 * dibersihkan dari simpanan saat itu juga, supaya kuncinya tidak menumpuk
 * id yang tidak menunjuk ke apa pun lagi.
 */
export function useCollapsedColumns(boardId: string, known: string[]) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => read(boardId));

  useEffect(() => {
    setCollapsed(read(boardId));
  }, [boardId]);

  /* Rangkumannya yang jadi ketergantungan, bukan arraynya: `known` adalah
     array baru pada setiap render papan. */
  const signature = known.join(",");
  useEffect(() => {
    if (!signature) return;
    const alive = new Set(signature.split(","));

    setCollapsed((prev) => {
      const next = new Set([...prev].filter((id) => alive.has(id)));
      if (next.size === prev.size) return prev;

      write(boardId, next);
      return next;
    });
  }, [boardId, signature]);

  const toggle = useCallback(
    (columnId: string) => {
      setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(columnId)) next.add(columnId);

        write(boardId, next);
        return next;
      });
    },
    [boardId],
  );

  return { collapsed, toggle };
}
