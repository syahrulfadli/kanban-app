import { useId, useRef, useState } from "react";
import { api } from "../lib/api";
import { prepareAvatar } from "../lib/avatar";
import {
  PROVIDER_LABEL,
  authClient,
  changeEmail,
  updateUser,
  type SessionUser,
} from "../lib/auth-client";
import { cn } from "../lib/cn";
import { avatarTint, initials } from "../lib/people";
import { SkeletonLine } from "./Skeleton";

/** Cukup ini yang dibutuhkan dari daftar akun tertaut. */
export interface LinkedAccount {
  providerId: string;
}

/**
 * Identitas akun: foto, nama, dan email.
 *
 * Nama dan foto disimpan lewat Better Auth (`updateUser`) supaya sesinya ikut
 * diperbarui di tempat yang sama, sedangkan berkas fotonya sendiri lewat
 * /api/profile/avatar — lihat src/worker/routes/profile.ts.
 */
export function ProfileSettings({
  user,
  accounts,
}: {
  user: SessionUser;
  accounts: LinkedAccount[] | null;
}) {
  const nameId = useId();
  const emailId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  /* Foto yang baru dipilih tampil dari data URL-nya, tidak menunggu sesi
     dimuat ulang: unggahannya sudah selesai, dan menunggu ronde bolak-balik
     lagi hanya membuat foto lama bertahan beberapa saat tanpa alasan. */
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /** Satu pintu untuk semua aksi di bagian ini: sibuk, galat, dan kabar. */
  const run = async (action: () => Promise<string>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      setNotice(await action());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Perubahan gagal disimpan");
    } finally {
      setBusy(false);
    }
  };

  const photo = preview ?? user.image;

  /* Email yang sudah terverifikasi hanya boleh berpindah lewat surat
     verifikasi, dan aplikasi ini tidak mengirim surat — lihat catatan di
     src/worker/auth.ts. Akun sosial selalu masuk kategori ini. */
  const provider = accounts?.find((a) => a.providerId !== "credential")?.providerId;
  const lockedEmail = user.emailVerified;

  const pickPhoto = (file: File) =>
    run(async () => {
      const upload = await prepareAvatar(file);
      const { image } = await api.uploadAvatar(upload);

      const result = await updateUser({ image });
      if (result.error) throw new Error(result.error.message ?? "Foto gagal dipasang");

      setPreview(upload.preview);
      return "Foto profil diperbarui.";
    });

  const removePhoto = () =>
    run(async () => {
      // Tautannya dilepas dulu: baris yang terhapus sementara masih ditunjuk
      // `user.image` cuma akan menghasilkan avatar yang gagal dimuat.
      const result = await updateUser({ image: null });
      if (result.error) throw new Error(result.error.message ?? "Foto gagal dihapus");

      await api.deleteAvatar();
      setPreview(null);
      return "Foto profil dihapus.";
    });

  const saveName = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const result = await updateUser({ name: name.trim() });
      if (result.error) throw new Error(result.error.message ?? "Nama gagal disimpan");
      return "Nama diperbarui.";
    });
  };

  const saveEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const target = email.trim();

    void run(async () => {
      const result = await changeEmail({ newEmail: target });
      if (result.error) throw new Error(result.error.message ?? "Email gagal disimpan");

      /* Email yang sudah dipakai orang lain juga dijawab "berhasil" — itu
         disengaja Better Auth, supaya tidak ada yang bisa menebak email siapa
         saja yang terdaftar di sini. Jadi yang menentukan berhasil atau tidak
         bukan jawabannya, melainkan email di sesi sesudahnya. */
      const after = await authClient.getSession({ query: { disableCookieCache: true } });
      if (after.data?.user.email !== target) {
        setEmail(user.email);
        throw new Error("Email itu tidak bisa dipakai — kemungkinan sudah terdaftar.");
      }

      return "Email diperbarui.";
    });
  };

  return (
    <>
      <div className="flex items-center gap-4">
        <span
          className={cn("avatar size-16 overflow-hidden text-xl", !photo && "avatar-tinted")}
          style={photo ? undefined : avatarTint(user.name, user.email)}
        >
          {photo ? <img src={photo} alt="" /> : initials(user.name, user.email)}
        </span>

        <div className="flex min-w-0 flex-col items-start gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="btn btn-glass"
            >
              {photo ? "Ganti foto" : "Unggah foto"}
            </button>

            {photo && (
              <button
                type="button"
                onClick={() => void removePhoto()}
                disabled={busy}
                className="btn btn-ghost"
              >
                Hapus
              </button>
            )}
          </div>

          <p className="text-xs leading-relaxed text-muted">
            Dipangkas dari tengah menjadi persegi 256 piksel di perangkat Anda sebelum diunggah.
          </p>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Nilainya dikosongkan supaya memilih berkas yang sama dua kali
            // tetap memicu perubahan.
            e.target.value = "";
            if (file) void pickPhoto(file);
          }}
        />
      </div>

      <form onSubmit={saveName} className="mt-5 flex flex-col gap-1.5">
        <label htmlFor={nameId} className="text-xs font-medium text-muted">
          Nama
        </label>
        <div className="flex items-start gap-2">
          <input
            id={nameId}
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            className="field min-w-0 flex-1"
          />
          <button
            type="submit"
            disabled={busy || !name.trim() || name.trim() === user.name}
            className="btn btn-primary"
          >
            Simpan
          </button>
        </div>
      </form>

      <form onSubmit={saveEmail} className="mt-4 flex flex-col gap-1.5">
        <label htmlFor={emailId} className="text-xs font-medium text-muted">
          Email
        </label>
        <div className="flex items-start gap-2">
          <input
            id={emailId}
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            readOnly={lockedEmail}
            autoComplete="email"
            className="field min-w-0 flex-1 read-only:text-muted"
          />
          {!lockedEmail && (
            <button
              type="submit"
              disabled={busy || !email.trim() || email.trim() === user.email}
              className="btn btn-primary"
            >
              Simpan
            </button>
          )}
        </div>

        {/* Alasan terkuncinya baru diketahui setelah daftar akun datang —
            sampai saat itu kalimatnya disediakan tempatnya saja, supaya tidak
            ada kalimat yang ditulis lalu diganti kalimat lain. */}
        {lockedEmail &&
          (accounts ? (
            <p className="text-xs leading-relaxed text-muted">
              {provider
                ? `Email ini mengikuti akun ${PROVIDER_LABEL[provider] ?? provider} Anda dan hanya bisa diubah di sana.`
                : "Email yang sudah terverifikasi tidak bisa diubah dari halaman ini."}
            </p>
          ) : (
            <SkeletonLine className="my-1 w-full max-w-sm" />
          ))}
      </form>

      {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      {notice && <p className="mt-3 text-xs text-ok">{notice}</p>}
    </>
  );
}
