import {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Avatar } from "./Avatar";
import { Lightbox } from "./Lightbox";
import { Skeleton } from "./Skeleton";
import { useDismiss } from "../hooks/useDismiss";
import { api } from "../lib/api";
import { AVATAR_SIZE } from "../../shared/types";
import type { MemberStats, UserBrief } from "../../shared/types";

type OpenProfile = (person: UserBrief, workspaceId: string, anchor: HTMLElement) => void;

const ProfileContext = createContext<OpenProfile | null>(null);

const PANEL_WIDTH = 256;
const GAP = 8;

interface Position {
  top: number;
  left: number;
}

/**
 * Di bawah elemen yang diklik; geser ke atas kalau kepotong bawah layar.
 *
 * `panelHeight` diukur dari panel yang sungguh sudah dirender (lihat
 * `useLayoutEffect` di bawah) — bukan ditebak. Footer kartu ada dekat tepi
 * bawah dialog, dan menebak tinggi panel lebih besar dari aslinya membuat
 * pembalikan ke atas melompat jauh lebih tinggi dari yang perlu.
 */
function place(rect: DOMRect, panelHeight: number): Position {
  const below = rect.bottom + GAP;
  const top =
    below + panelHeight > window.innerHeight
      ? Math.max(GAP, rect.top - panelHeight - GAP)
      : below;

  const left = Math.min(
    Math.max(GAP, rect.left),
    window.innerWidth - PANEL_WIDTH - GAP,
  );

  return { top, left };
}

interface State {
  person: UserBrief;
  workspaceId: string;
  anchor: HTMLElement;
}

/**
 * Panel ringkas kontribusi seseorang dalam satu workspace — nama, avatar,
 * dan dua angka statistik. Dipicu dari mana saja (footer kartu, followup,
 * daftar anggota, dst.), jadi state-nya global lewat context ini alih-alih
 * dioper lewat props berlapis-lapis — pola yang sama seperti `UndoProvider`
 * di `UndoToasts.tsx`.
 *
 * Posisinya `fixed`, dihitung dari elemen yang diklik lewat portal ke
 * `document.body` — bukan `absolute` biasa seperti popover `CardPeople`/
 * `CardLabels`, karena titik pemicunya berpindah-pindah tempat dan sebagian
 * ada di dalam area yang bisa memotong elemen `absolute` (dialog kartu yang
 * discroll).
 */
export function ProfilePopoverProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [stats, setStats] = useState<MemberStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const open: OpenProfile = (person, workspaceId, anchor) => {
    setStats(null);
    setError(null);
    setPosition(null);
    setShowPhoto(false);
    setState({ person, workspaceId, anchor });
  };

  const close = () => setState(null);

  /* Nonaktif selagi lightbox foto terbuka: lightbox itu di-portal terpisah,
     jadi klik di dalamnya (termasuk fotonya sendiri) bukan keturunan
     `panelRef` — tanpa ini, klik apa pun di lightbox akan salah dibaca
     sebagai "klik di luar" dan menutup popovernya juga. */
  useDismiss(state !== null && !showPhoto, close, [panelRef]);

  /* Posisi dihitung dari ukuran panel yang SUNGGUH dirender, bukan ditebak
     — lihat catatan di `place()`. Diukur ulang tiap kali isinya bisa berubah
     tinggi (skeleton → angka, atau pesan galat), dan dipasang sebelum
     peramban sempat mengecat frame-nya (`useLayoutEffect`), jadi panelnya
     tidak pernah terlihat sekejap di posisi sementara. */
  useLayoutEffect(() => {
    if (!state) {
      setPosition(null);
      return;
    }
    const panel = panelRef.current;
    if (!panel) return;

    setPosition(place(state.anchor.getBoundingClientRect(), panel.offsetHeight));
  }, [state, stats, error]);

  /* Fokus dipindah ke panel begitu terbuka — persis pola `ConfirmDialog`/
     lightbox lampiran. Tanpa ini, fokus tetap di tombol avatar yang diklik
     (di dalam CardModal kalau dipicu dari sana), dan Escape menembus lewat
     bubbling native ke handler dialog kartu di baliknya, ikut menutupnya. */
  useEffect(() => {
    if (state) panelRef.current?.focus();
  }, [state]);

  // Panel ini berumur pendek dan tidak melacak ulang posisi anchor-nya —
  // discroll berarti anchor-nya sudah pindah, jadi paling sederhana ditutup.
  useEffect(() => {
    if (!state) return;
    const onScroll = () => close();
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [state]);

  useEffect(() => {
    if (!state) return;
    let alive = true;

    void (async () => {
      try {
        const rows = await api.getMemberStats(state.workspaceId, state.person.id);
        if (alive) setStats(rows);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Gagal memuat statistik");
      }
    })();

    return () => {
      alive = false;
    };
  }, [state]);

  return (
    <ProfileContext.Provider value={open}>
      {children}

      {state &&
        createPortal(
          <div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label={`Profil ${state.person.name}`}
            style={{
              top: position?.top ?? 0,
              left: position?.left ?? -9999,
              width: PANEL_WIDTH,
              visibility: position ? "visible" : "hidden",
            }}
            className="sheet sheet-frost glass-lens fixed z-[56] rounded-2xl p-4 outline-none"
          >
            <div className="flex items-center gap-3">
              {state.person.image ? (
                <button
                  type="button"
                  aria-label={`Lihat foto profil ${state.person.name} ukuran penuh`}
                  onClick={() => setShowPhoto(true)}
                  className="shrink-0 rounded-full transition-opacity hover:opacity-80"
                >
                  <Avatar person={state.person} size="lg" />
                </button>
              ) : (
                <Avatar person={state.person} size="lg" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{state.person.name}</p>
                <p className="truncate text-xs text-muted">{state.person.email}</p>
              </div>
            </div>

            {error ? (
              <p className="mt-3 text-xs text-danger">{error}</p>
            ) : (
              <div className="mt-4 grid grid-cols-2 gap-3 text-center">
                <div>
                  {stats ? (
                    <p className="text-2xl font-semibold tabular-nums">{stats.commentCount}</p>
                  ) : (
                    <Skeleton className="mx-auto h-7 w-10" />
                  )}
                  <p className="mt-0.5 text-xs text-muted">followup</p>
                </div>
                <div>
                  {stats ? (
                    <p className="text-2xl font-semibold tabular-nums">{stats.cardsCreated}</p>
                  ) : (
                    <Skeleton className="mx-auto h-7 w-10" />
                  )}
                  <p className="mt-0.5 text-xs text-muted">kartu dibuat</p>
                </div>
              </div>
            )}
          </div>,
          document.body,
        )}

      {state?.person.image &&
        showPhoto &&
        createPortal(
          <Lightbox
            label={`Foto profil ${state.person.name}`}
            onClose={() => setShowPhoto(false)}
          >
            <img
              src={state.person.image}
              alt={state.person.name}
              width={AVATAR_SIZE}
              height={AVATAR_SIZE}
              className="glass relative rounded-2xl shadow-2xl"
            />
          </Lightbox>,
          document.body,
        )}
    </ProfileContext.Provider>
  );
}

/** Buka panel profil seseorang, di-anchor ke elemen yang diklik. */
export function useOpenProfile(): OpenProfile {
  const open = useContext(ProfileContext);
  if (!open) throw new Error("useOpenProfile dipakai di luar <ProfilePopoverProvider>");
  return open;
}
