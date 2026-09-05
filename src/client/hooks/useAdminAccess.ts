import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useSession } from "../lib/auth-client";
import type { AdminAccess } from "../../shared/types";

/**
 * Boleh tidaknya orang ini membuka panel admin.
 *
 * Jawabannya ditanyakan sekali lalu disimpan di modul, bukan di state tiap
 * komponen: yang bertanya adalah kapsul profil — yang ada di setiap halaman —
 * dan panelnya sendiri, dan keduanya tidak boleh menghasilkan dua perjalanan
 * ke server untuk pertanyaan yang jawabannya sama.
 *
 * Simpanannya bertanda id pemiliknya, dan itu bukan kerapian melainkan syarat
 * benarnya: kapsul profil ikut terpasang di halaman masuk, tempat pertanyaan
 * ini dijawab 401 — "bukan admin". Tanpa penanda, jawaban itu akan bertahan
 * setelah orangnya berhasil masuk, dan admin sungguhan mendapati panelnya
 * menolak dirinya sendiri sampai halamannya dimuat ulang.
 *
 * `checked` memisahkan "sudah ditanya, jawabannya tidak" dari "belum
 * ditanya". Keduanya sama-sama bukan izin, tapi hanya yang pertama boleh
 * ditampilkan sebagai penolakan — yang kedua masih menunggu.
 *
 * Ini kenyamanan tampilan, bukan izin. Yang memutuskan tetap server: setiap
 * rute /api/admin menjawab 404 kepada yang bukan admin, apa pun yang
 * dipercayai klien.
 */
export interface AdminAccessState extends AdminAccess {
  /** Sudah ada jawaban dari server untuk sesi yang sedang berjalan. */
  checked: boolean;
}

const DENIED: AdminAccess = { admin: false, fromEnv: false };

/** Jawaban ini milik siapa. Null berarti belum ada yang ditanyakan. */
let cachedFor: string | null = null;
let cached: AdminAccess = DENIED;
let inflight = false;

/** Semua pemakai hook ini diberi tahu bersamaan begitu jawabannya datang. */
const listeners = new Set<() => void>();

const announce = () => {
  for (const notify of listeners) notify();
};

function load(userId: string) {
  if (inflight) return;
  inflight = true;

  void api
    .getAdminAccess()
    .catch(() => DENIED)
    .then((access) => {
      cachedFor = userId;
      cached = access;
      inflight = false;
      announce();
    });
}

/**
 * Buang jawaban yang tersimpan. Dipanggil saat seseorang keluar: jawabannya
 * milik sesi yang barusan ditutup, dan orang berikutnya yang masuk di
 * perangkat yang sama tidak boleh mewarisinya.
 */
export function forgetAdminAccess() {
  if (cachedFor === null && !inflight) return;

  cachedFor = null;
  cached = DENIED;
  inflight = false;
  announce();
}

export function useAdminAccess(): AdminAccessState {
  const { data: session } = useSession();
  const userId = session?.user.id ?? null;

  const [, bump] = useState(0);

  useEffect(() => {
    const notify = () => bump((n) => n + 1);
    listeners.add(notify);

    /* Sesi berganti — termasuk dari "belum ada" ke "ada" begitu login
       selesai — berarti jawaban lama bukan tentang orang ini lagi. */
    if (!userId) forgetAdminAccess();
    else if (cachedFor !== userId) load(userId);

    return () => {
      listeners.delete(notify);
    };
  }, [userId]);

  const checked = Boolean(userId) && cachedFor === userId;
  return { ...(checked ? cached : DENIED), checked };
}
