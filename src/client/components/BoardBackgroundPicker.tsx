import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "../hooks/useDismiss";
import { api, type BoardBackgroundPatch } from "../lib/api";
import { thumbSrc } from "../lib/background";
import { cn } from "../lib/cn";
import { Toggle } from "./Toggle";
import {
  BOARD_BLUR_LABELS,
  BOARD_BLUR_LEVELS,
  BOARD_GRADIENTS,
  BOARD_GRADIENT_LABELS,
  type BackgroundImageBrief,
  type BoardBackground,
  type BoardBlur,
} from "../../shared/types";

/* Bingkai pemandangan — pegunungan dalam kotak. Lambang latar, bukan lambang
   gambar: yang dipilih di sini rupa papannya. */
const SCENERY = (
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <path d="M3 15.5l4.2-4.4a1.4 1.4 0 0 1 2 0L13 15" />
    <path d="M12.5 14.5l2.4-2.6a1.4 1.4 0 0 1 2 0L21 16" />
    <circle cx="15.8" cy="8.6" r="1.3" />
  </>
);

/** Satu pilihan di kisi: keping, tanda terpilih, dan namanya di bawah. */
function Swatch({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      title={label}
      className="group flex flex-col gap-1 text-left"
    >
      <span
        className={cn(
          "relative block h-12 w-full overflow-hidden rounded-xl border transition-transform",
          "group-hover:-translate-y-0.5",
          selected ? "border-accent ring-2 ring-accent/40" : "border-line",
        )}
      >
        {children}
      </span>
      <span
        className={cn(
          "truncate text-[11px] leading-tight",
          selected ? "text-accent-ink" : "text-muted",
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Keping "Bawaan": ladang cahaya aplikasinya sendiri, dilihat dari jauh. */
function DefaultSwatch() {
  return (
    <span
      className="absolute inset-0"
      style={{
        backgroundColor: "var(--glass-fill)",
        backgroundImage:
          "radial-gradient(70% 60% at 20% 15%, rgb(125 211 252 / 0.45), transparent 70%)," +
          "radial-gradient(60% 55% at 85% 80%, rgb(196 181 253 / 0.40), transparent 72%)",
      }}
    />
  );
}

/**
 * Dua pengaturan yang hanya berlaku untuk latar bergambar.
 *
 * Kabutnya menyala secara bawaan karena ia yang membuat tinta kartu terbaca di
 * atas foto sembarang. Mematikannya adalah pilihan untuk melihat fotonya utuh,
 * dan sejak itu warna teks di kepala papan dan di kaki halaman ditentukan oleh
 * terang-gelap fotonya sendiri — itu terjadi sendiri, tanpa sakelar ketiga.
 */
function ImageOptions({
  overlay,
  blur,
  onOverlay,
  onBlur,
}: {
  overlay: boolean;
  blur: BoardBlur;
  onOverlay: (next: boolean) => void;
  onBlur: (next: BoardBlur) => void;
}) {
  const overlayId = useId();

  return (
    <div className="mt-4 border-t border-line-soft pt-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p id={overlayId} className="text-xs font-medium">
            Kabut di atas gambar
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            Menjaga tulisan tetap terbaca. Dimatikan, fotonya tampil utuh dan warna
            teks mengikuti terang-gelap fotonya.
          </p>
        </div>
        <Toggle
          checked={overlay}
          onChange={onOverlay}
          labelledBy={overlayId}
          className="h-5 w-9"
        />
      </div>

      <p className="mt-3 text-xs font-medium">Kekaburan</p>
      <div className="mt-1.5 flex items-center gap-1">
        {BOARD_BLUR_LEVELS.map((level) => (
          <button
            key={level}
            type="button"
            onClick={() => onBlur(level)}
            aria-pressed={blur === level}
            className={cn(
              "flex-1 rounded-full px-2 py-1 text-[11px] transition-colors",
              blur === level
                ? "bg-accent-soft text-accent-ink"
                : "text-muted hover:bg-line-soft",
            )}
          >
            {BOARD_BLUR_LABELS[level]}
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  boardId: string;
  background: BoardBackground;
  /** Papan menarik ulang dirinya setelah latarnya berganti. */
  onChanged: () => void;
}

/**
 * Pemilih latar papan, di kepala papan.
 *
 * Tiga bagian dalam satu lembar, bukan tiga tab: pilihannya sedikit, dan tab
 * memaksa orang menebak di laci mana latar yang sedang terpasang berada.
 * Dengan satu lembar yang digulir, yang terpilih selalu bisa ditemukan mata.
 *
 * Daftar gambar ditarik saat lembarnya dibuka pertama kali, bukan saat papan
 * dimuat: sebagian besar orang yang membuka papan tidak sedang mengganti
 * latarnya, dan gambar Unsplash bukan payload yang layak dibayar di muka.
 */
export function BoardBackgroundPicker({ boardId, background, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<BackgroundImageBrief[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useDismiss(open, () => setOpen(false), [ref, panelRef]);

  useEffect(() => {
    if (!open || images) return;

    api
      .listBackgrounds()
      .then(setImages)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Gagal memuat daftar gambar"),
      );
  }, [open, images]);

  /* Lembarnya dipasang di <body> — sama seperti menu profil, dan karena
     alasan yang sama: di dalam pane ber-frost, backdrop-filter miliknya
     sendiri tidak menghitung apa pun. Letaknya diukur dari tombolnya, dan
     tepi kanan lembarnya dijaga tidak keluar layar. */
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  useLayoutEffect(() => {
    if (!open) return;

    const place = () => {
      const rect = ref.current?.getBoundingClientRect();
      if (rect) {
        setAnchor({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) });
      }
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  const choose = async (next: BoardBackgroundPatch) => {
    setSaving(true);
    try {
      await api.setBoardBackground(boardId, next);
      setError(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal mengganti latar");
    } finally {
      setSaving(false);
    }
  };

  const selectedGradient = background.kind === "gradient" ? background.gradient : null;
  const selectedImage = background.kind === "image" ? background.image.id : null;

  return (
  /* `flex`, bukan blok biasa: .chip itu inline-flex, dan sebuah tombol inline
     di dalam div blok ikut membentuk baris teks — tingginya jadi tinggi tombol
     ditambah sisa leading, dan sisa itu berubah mengikuti isi tombolnya. Yang
     disejajarkan `items-center` di kepala papan adalah pembungkus ini, jadi
     sisa yang berbeda-beda itu menggeser tombolnya sendiri. Dengan `flex`,
     pembungkusnya setinggi tombolnya persis. */
    <div ref={ref} className="relative flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Ganti latar papan"
        title="Ganti latar papan"
        className="chip cursor-pointer transition-colors hover:bg-line-soft"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {SCENERY}
        </svg>
        <span className="hidden sm:inline">Latar</span>
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Latar papan"
            style={{ top: anchor.top, right: anchor.right }}
            className="sheet sheet-frost fixed z-45 max-h-[70vh] w-80 max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl p-3"
          >
            <p className="text-xs font-semibold tracking-tight">Latar papan</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
              Berlaku untuk semua anggota papan ini.
            </p>

            {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

            <div
              className={cn(
                "mt-3 transition-opacity",
                saving && "pointer-events-none opacity-60",
              )}
            >
              <div className="grid grid-cols-3 gap-2">
                <Swatch
                  label="Bawaan"
                  selected={background.kind === "default"}
                  onClick={() => void choose({ kind: "default" })}
                >
                  <DefaultSwatch />
                </Swatch>

                {BOARD_GRADIENTS.map((gradient) => (
                  <Swatch
                    key={gradient}
                    label={BOARD_GRADIENT_LABELS[gradient]}
                    selected={selectedGradient === gradient}
                    onClick={() => void choose({ kind: "gradient", value: gradient })}
                  >
                    <span className="bg-swatch absolute inset-0" data-gradient={gradient} />
                  </Swatch>
                ))}
              </div>

              <p className="mt-4 text-xs font-semibold tracking-tight">Gambar</p>

              {images === null && !error && (
                <p className="mt-2 text-[11px] text-muted">Memuat…</p>
              )}

              {images?.length === 0 && (
                <p className="mt-2 text-[11px] leading-relaxed text-muted">
                  Belum ada gambar yang dikurasi. Admin aplikasi bisa menambahkannya lewat
                  panel admin.
                </p>
              )}

              {images && images.length > 0 && (
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {images.map((image) => (
                    <Swatch
                      key={image.id}
                      label={image.name}
                      selected={selectedImage === image.id}
                      onClick={() => void choose({ kind: "image", value: image.id })}
                    >
                      <img
                        src={thumbSrc(image.url)}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 size-full object-cover"
                      />
                    </Swatch>
                  ))}
                </div>
              )}

              {/* Hanya muncul untuk latar bergambar, dan itu bukan penyembunyian
                  melainkan kejujuran: gradiasi sudah setenang yang dibutuhkan,
                  dan latar bawaan tidak menggambar apa pun untuk dikaburkan. */}
              {background.kind === "image" && (
                <ImageOptions
                  overlay={background.overlay}
                  blur={background.blur}
                  onOverlay={(overlay) =>
                    void choose({ kind: "image", value: background.image.id, overlay })
                  }
                  onBlur={(blur) =>
                    void choose({ kind: "image", value: background.image.id, blur })
                  }
                />
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Kredit fotografer. Wajib menemani gambar Unsplash, dan itulah kenapa ia
 * digambar oleh papan, bukan oleh pemilih: yang harus terlihat adalah kredit
 * gambar yang sedang terpasang, bukan gambar yang sedang dipilih.
 */
export function PhotoCredit({ image }: { image: BackgroundImageBrief }) {
  const name = image.photographerUrl ? (
    <a
      href={image.photographerUrl}
      target="_blank"
      rel="noreferrer noopener"
      className="underline decoration-dotted underline-offset-2"
    >
      {image.photographer}
    </a>
  ) : (
    image.photographer
  );

  return (
    <p className="photo-credit pointer-events-auto">
      Foto oleh {name} di{" "}
      <a
        href="https://unsplash.com"
        target="_blank"
        rel="noreferrer noopener"
        className="underline decoration-dotted underline-offset-2"
      >
        Unsplash
      </a>
    </p>
  );
}
