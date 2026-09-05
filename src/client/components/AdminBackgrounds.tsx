import { useCallback, useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ListSkeleton } from "./Skeleton";
import { api, type BackgroundInput } from "../lib/api";
import { thumbSrc } from "../lib/background";
import { cn } from "../lib/cn";
import { UNSPLASH_IMAGE_HOST, type AdminBackgroundImage } from "../../shared/types";

const EMPTY: BackgroundInput = { name: "", url: "", photographer: "", photographerUrl: "" };

/**
 * Formulir satu gambar — dipakai untuk menambah maupun menyunting.
 *
 * Satu komponen untuk keduanya, bukan dua yang mirip: yang membedakan cuma
 * nilai awalnya dan kata di tombolnya, dan dua formulir yang mirip akan
 * menyimpang di salah satunya begitu ada field baru.
 */
function ImageForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: BackgroundInput;
  submitLabel: string;
  onSubmit: (input: BackgroundInput) => Promise<void>;
  onCancel?: () => void;
}) {
  const [input, setInput] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<BackgroundInput>) => setInput((prev) => ({ ...prev, ...patch }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    try {
      await onSubmit(input);
      setError(null);
      // Formulir tambah dikosongkan supaya gambar berikutnya bisa langsung
      // ditempel; formulir sunting ditutup pemanggilnya.
      if (!onCancel) setInput(EMPTY);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          required
          value={input.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Nama — “Kabut pegunungan”"
          maxLength={80}
          className="field min-w-0 flex-1"
        />
        <input
          required
          value={input.photographer}
          onChange={(e) => set({ photographer: e.target.value })}
          placeholder="Nama fotografer"
          maxLength={80}
          className="field min-w-0 flex-1"
        />
      </div>

      <input
        required
        value={input.url}
        onChange={(e) => set({ url: e.target.value })}
        placeholder={`https://${UNSPLASH_IMAGE_HOST}/photo-…`}
        className="field"
      />

      <input
        value={input.photographerUrl ?? ""}
        onChange={(e) => set({ photographerUrl: e.target.value })}
        placeholder="Profil fotografer di Unsplash (opsional)"
        className="field"
      />

      {error && <p className="text-xs text-danger">{error}</p>}

      <div className="flex items-center gap-2">
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "Menyimpan…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn btn-ghost">
            Batal
          </button>
        )}
      </div>
    </form>
  );
}

/** Panah naik-turun. Ikon yang sama diputar, jadi keduanya persis sebangun. */
const ARROW = <path d="M12 19V5M6 11l6-6 6 6" />;

export function AdminBackgrounds() {
  const [images, setImages] = useState<AdminBackgroundImage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [pending, setPending] = useState<AdminBackgroundImage | null>(null);

  const load = useCallback(async () => {
    try {
      setImages(await api.listAdminBackgrounds());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal memuat daftar gambar");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Aksi yang mengubah daftar selalu berakhir dengan menariknya ulang: urutan,
     keaktifan, dan hitungan pemakaian saling terkait, dan menebaknya di klien
     berarti tiga tebakan yang harus benar bersamaan. */
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aksi gagal");
    }
  };

  const move = (id: string, delta: number) => {
    const at = images?.findIndex((image) => image.id === id) ?? -1;
    if (at < 0) return;

    const to = at + delta;
    if (to < 0 || to >= (images?.length ?? 0)) return;

    void act(() => api.moveBackground(id, to));
  };

  return (
    <>
      <section className="glass glass-plate mt-4 rounded-2xl p-5">
        <h2 className="text-sm font-semibold tracking-tight">Tambah gambar</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          Buka fotonya di Unsplash, klik kanan gambarnya, lalu pilih “Salin alamat gambar” —
          alamatnya harus dari {UNSPLASH_IMAGE_HOST}. Ukuran gambar diatur aplikasi, jadi
          parameter apa pun di alamatnya akan dibuang.
        </p>

        <div className="mt-4">
          <ImageForm initial={EMPTY} submitLabel="Tambah" onSubmit={(input) => act(() => api.createBackground(input))} />
        </div>
      </section>

      <h2 className="mt-8 text-sm font-semibold tracking-tight">
        Daftar gambar
        {images && <span className="ml-1.5 font-normal text-faint">{images.length}</span>}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        Urutannya menentukan urutan di pemilih latar. Yang dinonaktifkan hilang dari pemilih
        tapi tetap terpasang di papan yang sudah memakainya.
      </p>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      {!images && !error && (
        <div className="mt-4">
          <ListSkeleton rows={3} label="Memuat daftar gambar" />
        </div>
      )}

      {images?.length === 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Belum ada gambar. Yang ditambahkan di sini muncul sebagai pilihan latar di setiap
          papan.
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-2">
        {images?.map((image, i) => (
          <li key={image.id} className="glass glass-plate rounded-2xl p-3">
            <div className="flex items-start gap-3">
              <img
                src={thumbSrc(image.url)}
                alt=""
                loading="lazy"
                className={cn(
                  "size-16 shrink-0 rounded-xl border border-line object-cover transition-opacity",
                  !image.active && "opacity-40 grayscale",
                )}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{image.name}</p>
                <p className="truncate text-xs text-muted">Foto oleh {image.photographer}</p>
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  {!image.active && <span className="chip text-[11px]">Nonaktif</span>}
                  <span className="chip text-[11px]">
                    {image.usedBy === 0 ? "Belum dipakai" : `Dipakai ${image.usedBy} papan`}
                  </span>
                </p>
              </div>

              {/* Urutan: dua panah, bukan seret. Daftarnya pendek dan jarang
                  disentuh, dan seret di daftar sependek ini membayar mahal
                  untuk kenyamanan yang tidak terasa. */}
              <div className="flex shrink-0 flex-col">
                {[
                  { delta: -1, label: "Naikkan", disabled: i === 0, flip: false },
                  {
                    delta: 1,
                    label: "Turunkan",
                    disabled: i === images.length - 1,
                    flip: true,
                  },
                ].map((step) => (
                  <button
                    key={step.label}
                    type="button"
                    onClick={() => move(image.id, step.delta)}
                    disabled={step.disabled}
                    aria-label={`${step.label} “${image.name}”`}
                    title={step.label}
                    className="btn btn-ghost p-1 disabled:opacity-25"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={cn("size-4", step.flip && "rotate-180")}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      {ARROW}
                    </svg>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setEditing(editing === image.id ? null : image.id)}
                className="btn btn-ghost px-2.5 py-1 text-xs"
              >
                {editing === image.id ? "Tutup" : "Sunting"}
              </button>
              <button
                onClick={() => void act(() => api.updateBackground(image.id, { active: !image.active }))}
                className="btn btn-ghost px-2.5 py-1 text-xs"
              >
                {image.active ? "Nonaktifkan" : "Aktifkan"}
              </button>
              <button
                onClick={() => setPending(image)}
                className="btn btn-ghost px-2.5 py-1 text-xs hover:bg-danger/10 hover:text-danger"
              >
                Hapus
              </button>
            </div>

            {editing === image.id && (
              <div className="mt-3 border-t border-line-soft pt-3">
                <ImageForm
                  initial={{
                    name: image.name,
                    url: image.url,
                    photographer: image.photographer,
                    photographerUrl: image.photographerUrl ?? "",
                  }}
                  submitLabel="Simpan"
                  onCancel={() => setEditing(null)}
                  onSubmit={async (input) => {
                    await act(() => api.updateBackground(image.id, input));
                    setEditing(null);
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      {pending && (
        <ConfirmDialog
          title="Hapus gambar latar?"
          body={
            <>
              “{pending.name}” akan hilang dari pemilih latar.
              {pending.usedBy > 0 && (
                <>
                  {" "}
                  {pending.usedBy} papan yang memakainya akan kembali ke latar bawaan.
                </>
              )}
            </>
          }
          confirmLabel="Hapus gambar"
          onConfirm={() => {
            void act(() => api.deleteBackground(pending.id));
            setPending(null);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </>
  );
}
