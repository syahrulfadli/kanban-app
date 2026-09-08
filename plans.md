# Rencana fitur berikutnya

Kumpulan fitur yang disepakati untuk ditambahkan, dicatat di sini sebelum
mulai implementasi.

Batch pertama (#1–3): filter board dulu (paling murah, langsung terasa),
lalu arsip, baru lampiran (paling banyak keputusan desain).

Batch kedua (#4–6): rich text/markdown untuk deskripsi & followup, profil
publik dengan kontribusi, dan edit judul/warna workspace & board.

## 1. Filter board

**Masalah:** pencarian kartu (`CardSearch`) sudah ada tapi itu pencarian teks
bebas (judul, label, orang disebut namanya). Belum ada cara untuk menyaring
tampilan board itu sendiri — "tampilkan hanya kartu berlabel X", "kartu milik
saya", "yang jatuh tempo minggu ini".

**Cakupan:**
- Filter berdasarkan label, orang (assignee/member), dan status jatuh tempo
  (terlambat / minggu ini / tanpa tanggal).
- Berlaku di tampilan board (`BoardView`), menyembunyikan kartu yang tidak
  cocok — bukan modal terpisah seperti `CardSearch`.
- Kombinasi filter memakai AND antar kategori, OR di dalam kategori yang sama
  (mis. label A atau B, DAN milik saya).

**Pertimbangan:**
- Bisa dibangun di atas data yang sudah dimuat client (board sudah punya
  seluruh kartu + label + member), jadi ini murni logic client-side, tidak
  perlu endpoint baru.
- State filter disimpan di mana? Kandidat: state lokal per board (hilang saat
  reload) vs disimpan (localStorage per board). Belum diputuskan.

**Saran UI/UX:**
- Tombol filter di dekat search (bukan modal terpisah) — buka sebagai
  popover kecil berisi checklist label, orang, dan status jatuh tempo, mirip
  pola sheet yang sudah dipakai `NotificationBell`.
- Kartu yang tidak cocok filter **disembunyikan sepenuhnya**, bukan
  diredupkan. Kalau sebuah kolom jadi kosong akibat filter, tampilkan teks
  kecil "tidak ada kartu cocok" di situ supaya tidak terbaca sebagai bug.
- Chip label/avatar di popover filter pakai warna & bentuk yang sama persis
  dengan di kartu (`labelTint`, `cardFaces`) — filter terasa seperti
  highlight dari yang sudah dilihat, bukan UI baru.
- Tombol filter kasih indikator kecil (titik/angka) saat ada filter aktif,
  supaya gampang sadar filter masih menyala setelah reload.

## 2. Arsip kartu / kolom

**Masalah:** saat ini kartu dan kolom sepertinya hanya bisa dihapus permanen
(perlu dicek ulang alur hapus di `BoardView`/`ColumnView`/`CardModal`), belum
ada status "selesai tapi disimpan dulu, bisa dipulihkan" seperti arsip di
Trello.

**Cakupan:**
- Kartu (dan mungkin kolom) punya status arsip terpisah dari hapus.
- Kartu/kolom yang diarsipkan hilang dari tampilan board utama tapi bisa
  dilihat lagi lewat panel arsip (per board), dan dipulihkan.
- Hapus permanen tetap ada sebagai aksi terpisah dari arsip.

**Pertimbangan:**
- Butuh kolom baru di tabel `cards` (dan `columns` kalau kolom juga bisa
  diarsipkan) — mis. `archivedAt`.
- Perlu diputuskan: kartu di kolom yang diarsipkan ikut otomatis
  tersembunyi, atau tetap independen?
- Realtime (`board-room.ts`) dan notifikasi (`notify.ts`) perlu tahu event
  arsip supaya tidak dianggap "kartu hilang" yang aneh di collaborator lain.

**Saran UI/UX:**
- "Arsipkan" sebagai aksi biasa di `CardModal`, sejajar tombol hapus tapi
  visualnya lebih tenang — hapus tetap yang paling "berbahaya" secara
  warna/posisi, karena arsip reversibel dan seharusnya terasa lebih ringan
  diambil.
- Pakai pola `UndoToasts` yang sudah ada: kartu langsung hilang dari board +
  toast "Kartu diarsipkan · Batalkan" — konsisten dengan alur hapus/pindah
  yang sudah dibiasakan pengguna.
- Panel arsip per board sebagai slide-over/sheet (bukan halaman baru),
  isinya daftar kartu terarsip dengan tombol "Pulihkan" dan "Hapus permanen"
  per baris.
- Entry point ke panel arsip kecil saja (ikon di menu board), badge jumlah
  hanya kalau tidak kosong — jangan selalu terlihat kalau memang kosong.

## 3. Lampiran kecil di kartu

**Masalah:** kartu belum bisa punya lampiran berkas.

**Disepakati sejauh ini:**
- Ukuran lampiran **dibatasi** (mengikuti batasan biaya nol — lihat pola yang
  sudah ada di `userAvatars`: berkas kecil disimpan sebagai base64 langsung
  di D1, tanpa R2/storage eksternal). Batas ukuran pasti belum ditentukan,
  tapi arahnya sama: cukup kecil supaya tidak membengkakkan D1 (kuota D1
  free tier terbatas), bukan untuk lampiran dokumen besar.
- Kalau tipe lampirannya **gambar**, mengklik lampiran itu di kartu akan
  menampilkan **pratinjau** gambarnya (bukan langsung mengunduh).

**Belum diputuskan (dicatat sebagai pertanyaan terbuka):**
- Batas ukuran per berkas, dan batas jumlah lampiran per kartu.
- Tipe berkas apa saja yang diterima selain gambar (atau hanya gambar dulu
  di iterasi pertama, tipe lain menyusul).
- Base64 di D1 (pola `userAvatars`) vs R2 (perlu tambah binding baru di
  `wrangler.jsonc`, masih masuk free tier Cloudflare tapi menambah bagian
  infrastruktur baru) — condong ke base64/D1 dulu supaya konsisten dengan
  pola yang sudah ada, kecuali ukurannya ternyata butuh lebih besar dari
  yang wajar untuk D1.
- Bagaimana pratinjau gambar ditampilkan: modal ringan di atas `CardModal`,
  atau lightbox terpisah.

**Saran UI/UX:**
- Bagian lampiran di `CardModal`, posisinya setelah checklist sebelum
  komentar — thumbnail kecil untuk gambar, ikon+nama+ukuran untuk tipe lain
  nanti.
- Klik thumbnail gambar → overlay lightbox sederhana (mirip nuansa
  `ConfirmDialog`: backdrop gelap, klik luar/Esc untuk tutup), tanpa
  zoom/pan dulu di iterasi pertama.
- Ikuti preseden downscale gambar di client sebelum diunggah (pola
  `userAvatars` — dipotong persegi kecil sebelum dikirim): gambar
  dikompres/diresize di browser dulu sebelum jadi base64, supaya batas
  ukuran lebih gampang dipenuhi tanpa terasa membatasi ke pengguna.
- Tampilkan batas ukuran secara eksplisit di dekat tombol unggah (mis.
  "maks 2MB"), bukan baru muncul sebagai error setelah gagal — konsisten
  dengan nada pesan yang halus di app ini.

## 4. Rich text / markdown untuk deskripsi kartu dan followup — **selesai**

Diimplementasikan: `src/client/lib/markdown.ts` (render + sanitasi),
`src/client/components/Markdown.tsx` (tampilan baca), `MarkdownField.tsx`
(editor Tulis/Pratinjau + Simpan/Batal), dipasang di `CardModal` (deskripsi)
dan `CardFollowup` (followup baru & sunting followup). Paket yang dipasang:
`marked` + `dompurify`, sesuai rekomendasi di bawah — bukan `@mdxeditor/editor`.

Keputusan yang sempat jadi pertanyaan terbuka, sudah diputuskan saat
implementasi: followup **baru** pakai tombol "Kirim", tapi **menyunting**
followup yang sudah ada pakai "Simpan" — alasannya "Kirim" adalah aksi
mengirim sesuatu yang baru, sementara menyunting itu menyimpan perubahan
pada sesuatu yang sudah terkirim.

Diuji langsung di browser (Playwright headless, akun baru, board→kolom→
kartu baru): tab Tulis/Pratinjau bekerja, deskripsi & followup tersimpan
dan tampil ter-render, Ubah/Simpan/Batal pada followup bekerja (Batal
benar-benar tidak menyimpan), dan yang terpenting — status jaringan
(`ChannelStatus` dari `realtime.ts`, bukan `navigator.onLine`) terbukti
memadamkan tombol Kirim/Simpan serta memunculkan "Menunggu jaringan…" saat
koneksi WebSocket board diputus, dan pulih otomatis begitu koneksi kembali.
Tidak ada error konsol React di sepanjang pengujian.

**Masalah:** deskripsi kartu (`CardModal`) dan followup/komentar
(`CardFollowup`) saat ini `<textarea>` polos, tersimpan otomatis saat blur.
Belum ada format (bold, list, dsb) dan belum ada penulisan markdown.

**Soal pilihan paket — `@mdxeditor/editor` vs alternatif:**
Rekomendasi saya **bukan** `@mdxeditor/editor`. Alasannya:
- Dasarnya Lexical, dan bundle-nya relatif berat (kira-kira +150KB gzip)
  untuk kebutuhan yang sebenarnya cuma "tulis markdown, simpan markdown" —
  bukan MDX (markdown+JSX) yang memang jadi fokus paket ini.
- Styling bawaannya banyak dan perlu di-override total untuk cocok dengan
  bahasa desain "halus" app ini (glass, bukan UI kotak editor generik) —
  overhead penyesuaian yang tidak kecil.

**Yang saya sarankan:** tab "Tulis / Pratinjau" di atas textarea yang sudah
ada (pola ala GitHub), bukan WYSIWYG. Isinya tetap `<textarea>` biasa untuk
mode Tulis, dan render markdown→HTML untuk mode Pratinjau, pakai `marked`
(ringan, ~5-8KB) + `dompurify` untuk sanitasi (**wajib** — followup dan
deskripsi dibaca orang lain, jadi HTML hasil render harus disaring supaya
tidak jadi celah XSS, apa pun paketnya). Alasan pilih ini:
- Selaras dengan UX yang sudah ada (textarea + commit), tinggal menambah
  tab pratinjau dan tombol Simpan/Batal — bukan mengganti seluruh mekanisme
  input.
- Bundle jauh lebih kecil, dan styling pratinjau tinggal pakai class
  tipografi yang sudah ada di app (tidak perlu melawan CSS bawaan paket
  editor).
- Sintaks markdown (`**tebal**`, `- list`, dst) tetap bisa diketik langsung
  di mode Tulis — kebutuhan "bisa ditulis dengan format markdown" terpenuhi
  tanpa WYSIWYG.

**Alternatif kalau nanti WYSIWYG memang diinginkan:** Tiptap (ProseMirror)
+ extension `tiptap-markdown` — lebih ringan dan lebih mudah ditata ulang
gayanya dibanding MDXEditor, tapi tetap menambah beberapa puluh KB dan
kompleksitas baru. Disimpan sebagai opsi lanjutan, bukan rencana awal.

**Tombol Simpan / Batal + kesadaran jaringan:**
- Kedua field (deskripsi dan followup) berhenti auto-save-saat-blur, ganti
  jadi eksplisit: tombol **Simpan** dan **Batal**. Batal selalu aktif,
  mengembalikan isi ke sebelum diedit, terlepas dari status jaringan.
- Untuk kolom followup, teks tombol kirimnya pakai kata **"Kirim"** (bukan
  "Simpan") — followup itu sesuatu yang dikirim ke orang lain, bukan
  disimpan seperti draf deskripsi. Menyunting followup yang sudah ada
  memakai "Simpan": itu menyimpan perubahan pada sesuatu yang sudah
  terkirim, bukan mengirim yang baru.
- Deteksi jaringan sebaiknya **bukan** `navigator.onLine` mentah (bisa
  `true` walau server tidak terjangkau), tapi pakai status koneksi
  real-time yang sudah ada di app (`ChannelStatus` — `"connecting" |
  "live" | "offline"` di `client/lib/realtime.ts`, sudah dipakai `BoardView`
  untuk titik indikator). Itu mencerminkan bisa-tidaknya app benar-benar
  bicara ke server, bukan cuma kabel tercolok.
- Saat status bukan `"live"`: tombol Simpan/Kirim **padam** (disabled,
  tidak bisa diklik) dan di sebelahnya muncul teks kecil, mis. "Menunggu
  jaringan…" — supaya jelas kenapa tombolnya tidak bisa ditekan, bukan
  terlihat rusak. Begitu status kembali `"live"`, tombol otomatis menyala
  lagi tanpa perlu aksi ulang dari user.

## 5. Profil publik: lihat kontribusi orang lain

**Masalah:** belum ada cara melihat profil ringkas orang lain di
workspace — hanya nama/avatar yang muncul di avatar stack, komentar, dan
daftar anggota.

**Cakupan:**
- Klik avatar/nama orang (di `AvatarStack`, `CardPeople`, penulis followup,
  daftar anggota di `MembersPage`) membuka panel/profil ringkas orang itu.
- Isinya: nama, avatar, dan statistik kontribusi — jumlah followup/komentar
  yang ditulis, dan jumlah kartu yang dibuat (`cards.createdBy` sudah ada di
  skema, jadi hitungan kartu tinggal query agregat; `cardComments` juga
  sudah punya `userId`).

**Pertimbangan:**
- Lingkup hitungan: per workspace yang sedang dibuka, atau total lintas
  semua workspace yang sama-sama diikuti kedua orang? Per-workspace lebih
  konsisten dengan batas visibilitas yang sudah ada (`workspaceMembers`
  adalah sumber kebenaran akses), jadi itu yang disarankan sebagai
  default, kecuali ditentukan lain.
- Perlu endpoint baru untuk agregat ini (belum ada di `routes/*.ts`) —
  hitung `COUNT` dikelompokkan per `userId`, dibatasi ke board-board dalam
  satu workspace.
- Profil ini hanya-baca untuk orang lain; pengaturan milik sendiri
  (`ProfileSettings.tsx`) tetap terpisah dan tidak berubah.

**Saran UI/UX:**
- Panel ringan (sheet/popover kecil saat diklik dari avatar), bukan
  halaman penuh — konsisten dengan bobot informasinya yang memang ringkas.
- Statistik ditampilkan sebagai dua angka besar berlabel ("X followup",
  "Y kartu dibuat"), bukan tabel — cukup untuk sekilas lihat kontribusi.

## 6. Edit judul dan warna untuk workspace & board

**Masalah:** nama workspace dan board (`workspaces.name`, `boards.title`)
sepertinya hanya diisi sekali saat dibuat — di `WorkspacesPage` dan
`WorkspacePage` baris-barisnya cuma punya aksi hapus, tidak ada ubah nama.
Keduanya juga belum punya warna pembeda seperti kolom (`COLUMN_COLORS`)
atau label (`LABEL_COLORS`) sudah punya.

**Cakupan:**
- Bisa mengubah judul workspace dan board kapan saja setelah dibuat.
- Tambah warna aksen untuk workspace dan board, dipakai sebagai penanda di
  baris daftarnya (`WorkspacesPage`, `WorkspacePage`) — pakai palet warna
  yang sama dengan `LABEL_COLORS`/`COLUMN_COLORS`, bukan palet baru, dan
  komponen `ColorSwatches` yang sudah ada tinggal dipakai ulang.

**Pertimbangan:**
- Butuh kolom warna baru di tabel `workspaces` dan `boards` (mis. `color`,
  nullable — kosong berarti tanpa warna, konsisten dengan cara kolom
  menangani "tanpa warna" lewat opsi `clearable` di `ColorSwatches`).
- Butuh endpoint update untuk nama+warna di `routes/workspaces.ts` dan
  `routes/boards.ts` (kemungkinan sudah ada endpoint update board untuk
  latar belakang — cek apakah cukup diperluas, bukan bikin baru).

**Saran UI/UX:**
- Ubah nama & warna lewat popover kecil yang dibuka dari baris workspace/
  board di daftar (titik tiga atau area yang sama dengan ikon hapus
  sekarang) — bukan halaman pengaturan terpisah, karena ini pengeditan
  cepat yang sifatnya sama seperti mengubah nama kolom.
- Warna aksen tampil sebagai titik/garis kecil di baris daftar (mis. tepi
  kiri kartu baris, atau titik di samping nama) — tetap tenang, bukan
  mewarnai seluruh baris.
