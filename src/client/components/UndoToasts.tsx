import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

/** Lama jendela urung. Nilai yang sama dipakai timer JS dan bilah countdown CSS. */
const UNDO_MS = 6000;

/** Opsi request yang diteruskan ke `commit` — dipakai saat tab ditutup. */
export interface CommitOptions {
  keepalive?: boolean;
}

export interface UndoRequest {
  /** Kalimat pendek di toast: apa yang barusan hilang. */
  message: string;
  /** Perintah sungguhan ke server. Baru dijalankan setelah jendela urung habis. */
  commit: (options?: CommitOptions) => Promise<unknown>;
  /** Kembalikan tampilan seperti semula — dipakai saat diurungkan maupun saat commit gagal. */
  revert: () => void;
  onError?: (message: string) => void;
}

interface Toast extends UndoRequest {
  id: string;
}

const UndoContext = createContext<((request: UndoRequest) => void) | null>(null);

/**
 * Urung tanpa jejak di server: penghapusan disembunyikan dari layar dulu, dan
 * permintaan DELETE-nya baru dikirim setelah jendela urung habis. Cara ini
 * dipilih daripada soft delete karena kartu/kolom/board menyeret seisi
 * anaknya lewat cascade — memulihkannya dari server berarti menyimpan
 * seluruh pohon yang sudah terhapus, sedangkan menahan perintahnya beberapa
 * detik tidak menambah satu kolom pun ke basis data.
 *
 * Konsekuensinya: selama jendela masih berjalan, kolaborator lain belum
 * melihat penghapusannya. Itu memang jawaban yang benar — belum ada yang
 * dihapus sampai jendelanya tutup.
 */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  // Timer hidup di ref, bukan state: yang dirender cuma daftar toast-nya.
  const pending = useRef(new Map<string, { toast: Toast; timer: ReturnType<typeof setTimeout> }>());

  const take = useCallback((id: string) => {
    const entry = pending.current.get(id);
    if (!entry) return null;

    pending.current.delete(id);
    clearTimeout(entry.timer);
    setToasts((list) => list.filter((t) => t.id !== id));
    return entry.toast;
  }, []);

  /** Jendela habis: kirim perintahnya. Kalau server menolak, tampilan dikembalikan. */
  const settle = useCallback(
    (id: string, options?: CommitOptions) => {
      const toast = take(id);
      if (!toast) return;

      void toast.commit(options).catch((e: unknown) => {
        toast.revert();
        toast.onError?.(e instanceof Error ? e.message : "Gagal menghapus");
      });
    },
    [take],
  );

  const cancel = useCallback(
    (id: string) => {
      take(id)?.revert();
    },
    [take],
  );

  const schedule = useCallback(
    (request: UndoRequest) => {
      const toast: Toast = { ...request, id: crypto.randomUUID() };
      const timer = setTimeout(() => settle(toast.id), UNDO_MS);

      pending.current.set(toast.id, { toast, timer });
      setToasts((list) => [...list, toast]);
    },
    [settle],
  );

  /* Tab yang ditutup di tengah jendela urung tidak boleh menelan
     penghapusannya. `keepalive` menahan request tetap terkirim walau
     halamannya sudah pergi. */
  useEffect(() => {
    const flush = () => {
      for (const id of [...pending.current.keys()]) settle(id, { keepalive: true });
    };

    addEventListener("pagehide", flush);
    return () => {
      removeEventListener("pagehide", flush);
      flush();
    };
  }, [settle]);

  return (
    <UndoContext.Provider value={schedule}>
      {children}

      {/* Di atas kapsul navigasi dan dialog kartu — toast adalah lapisan
          paling depan, karena umurnya paling pendek. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            style={{ "--undo-ms": `${UNDO_MS}ms` } as React.CSSProperties}
            className="glass glass-frost toast pointer-events-auto flex w-full max-w-md items-center gap-3 py-2.5 pr-2.5 pl-4"
          >
            <p className="min-w-0 flex-1 truncate text-sm text-ink-soft">{toast.message}</p>

            <button type="button" onClick={() => cancel(toast.id)} className="btn btn-glass shrink-0">
              Urungkan
            </button>

            {/* Bilah countdown: sisa waktu sebelum penghapusan benar-benar dikirim. */}
            <span aria-hidden className="toast-countdown">
              <span />
            </span>
          </div>
        ))}
      </div>
    </UndoContext.Provider>
  );
}

/** Jadwalkan penghapusan yang masih bisa diurungkan selama beberapa detik. */
export function useUndo() {
  const schedule = useContext(UndoContext);
  if (!schedule) throw new Error("useUndo dipakai di luar <UndoProvider>");
  return schedule;
}
