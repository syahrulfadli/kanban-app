/**
 * Mata Awasi — mata terbuka saat diawasi, mata bercoret saat tidak.
 *
 * Bentuknya yang membedakan keadaan, bukan warnanya: mata yang menyala
 * berbeda warna akan menagih perhatian di kepala setiap kolom dan di hampir
 * setiap kartu di papan sendiri, padahal ia cuma menjawab "kabar dari sini
 * sampai ke saya". Warnanya karena itu diwariskan dari tempat ia berdiri,
 * sama dengan tombol-tombol tetangganya.
 *
 * Dipakai telanjang sebagai penanda (kepala kolom, muka kartu) maupun sebagai
 * ikon butir menu (menu kolom, menu kartu) — sakelarnya sendiri selalu di
 * dalam menu tiga titik, bukan berdiri lepas di kepala, supaya satu ketukan
 * nyasar tidak diam-diam memutus kabar dari kartu atau kolom itu.
 */
export function EyeIcon({
  watching,
  className,
  label,
}: {
  watching: boolean;
  className?: string;
  /** Diisi hanya kalau matanya berdiri sendiri; di dalam tombol, tombolnya yang bicara. */
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...(label ? { role: "img", "aria-label": label } : { "aria-hidden": true })}
    >
      {watching ? (
        <>
          <path d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </>
      ) : (
        <path d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
      )}
    </svg>
  );
}
