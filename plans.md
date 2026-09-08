# Rencana fitur berikutnya

Kumpulan fitur yang disepakati untuk ditambahkan, dicatat di sini sebelum
mulai implementasi.

Batch pertama (#1–3): filter board dulu (paling murah, langsung terasa),
lalu arsip, baru lampiran (paling banyak keputusan desain).

Batch kedua (#4–6): rich text/markdown untuk deskripsi & followup, profil
publik dengan kontribusi, dan edit judul/warna workspace & board.

## 1. Filter board — **selesai**

Diimplementasikan: `src/client/lib/boardFilter.ts` (state filter, fungsi murni
`matchesBoardFilter` — AND antar kategori label/orang/dibuat oleh/jatuh
tempo, OR di dalam kategori yang sama — dan `dueCategory` yang membagi
tenggat jadi `"overdue" | "week" | "none"`, beda ambang dari `dueState` yang
sudah ada di `format.ts` karena "minggu ini" butuh jendela 7 hari, bukan
24 jam seperti `"soon"`). Kategori "Orang" mencocokkan lewat `cardFaces`
(gabungan `card.members` dan `card.participants`), bukan `card.members`
saja — supaya sama persis dengan sumber checklist-nya, karena mencocokkan
cuma ke `members` berarti orang yang di checklist tapi cuma berstatus
peserta (bukan diundang) tidak akan pernah cocok dengan kartu apa pun.

State filter disimpan lewat `useBoardFilter.ts` (hook baru) — satu kunci
`localStorage` per board (`kanban:filter:<boardId>`), pola yang sama persis
dengan `useCollapsedColumns`: lokal per perangkat (tidak disinkronkan ke
kolaborator lain), tapi bertahan lewat reload. Kosong berarti kunci dihapus
dari `localStorage`, bukan disimpan sebagai array kosong.

Komponen `BoardFilter.tsx` — tombol chip + panel `.sheet` di kepala papan
(`AppHeader`, sejajar `BoardBackgroundPicker`/`LiveIndicator`, pola yang
sama: tanpa portal karena kepala papan bukan pane ber-frost). Ukuran teks
di panelnya disamakan dengan panel `BoardBackgroundPicker` ("Latar papan")
supaya kedua panel yang bertetangga di kepala papan terbaca sebagai satu
keluarga: judul bagian `text-xs font-semibold tracking-tight` (bukan
`.section-label` yang dipakai di tempat lain seperti `CardPeople`, yang
lebih kecil dan lebih tebal), baris isi `text-[11px]`. Isinya empat bagian:
checklist label (chip `labelTint` yang sama seperti di kartu, cincin aksen
saat aktif — pola yang sama dengan highlight `CardSearch`), checklist orang
(avatar + nama, diturunkan dari `cardFaces(members, participants)` tiap
kartu di board, digabung unik — bukan `api.listMembers`, supaya tidak ada
panggilan jaringan tambahan dan hanya orang yang benar-benar tampil di kartu
board ini yang muncul), checklist **dibuat oleh** (daftar lebih pendek —
cuma orang yang `card.createdBy`-nya cocok, diturunkan dari kamus
id→`UserBrief` yang sama dengan checklist Orang, karena pembuat kartu selalu
ikut jadi peserta — lihat `routes/cards.ts`), dan tiga sakelar jatuh tempo
(Terlambat / Minggu ini / Tanpa tanggal). Badge angka di tombol Filter saat
ada filter aktif, tombol "Bersihkan filter" muncul di kaki panel.

`ColumnView` menerima prop `filter`, menyaring `column.cards` sebelum
di-`map`-kan (bukan menyembunyikan `CardItem` yang sudah dirender) — supaya
kartu yang tersaring tidak ikut mendaftarkan drop target drag-and-drop.
`prevCardId`/`nextCardId` tetap dihitung dari `column.cards` asli (bukan
daftar yang sudah tersaring), supaya urutan drag-and-drop tidak rusak saat
filter aktif. Pesan kosong dibedakan dua kondisi: kolom yang sungguh kosong
tetap "Belum ada kartu", kolom berisi kartu tapi semuanya tersaring dapat
pesan baru "Tidak ada kartu yang cocok filter" — konsisten dengan pola yang
sama di `NotificationBell` dan `CardSearch`.

**Keputusan atas pertanyaan terbuka:** state filter disimpan ke
`localStorage` per board (bukan lokal-saja) — awalnya diimplementasikan
lokal-saja lalu diralat ke `localStorage` begitu diminta. Kategori "dibuat
oleh" (`card.createdBy`) ditambah di luar cakupan awal, atas permintaan
susulan.

Diuji langsung di browser (Playwright headless, akun baru, workspace→
board→satu kolom berisi 3 kartu: Kartu A tanpa label/tenggat, Kartu B
berlabel "Bug" dan tenggat lewat, Kartu C berlabel "Feature" dan tenggat
8 hari lagi): filter label=Bug menampilkan hanya B; menambah label Feature
(OR di kategori sama) menampilkan B dan C; filter label=Bug **DAN**
jatuh tempo=Terlambat tetap hanya B (AND antar kategori, keduanya cocok
di B); filter label=Feature **DAN** jatuh tempo=Terlambat tidak
menampilkan satu pun kartu — kolom masih berisi 3 kartu tapi menampilkan
pesan "Tidak ada kartu yang cocok filter"; filter dibuat-oleh=diri sendiri
menampilkan ketiga kartu (ketiganya memang dibuat sendiri), dikombinasikan
DENGAN label=Bug menyempit ke hanya B; "Bersihkan filter" mengembalikan
ketiga kartu; filter yang dipasang lalu halaman di-reload tetap bertahan
(badge angka di tombol Filter juga tetap benar) — mengonfirmasi
`localStorage` bekerja. Tidak ada error konsol React di sepanjang
pengujian. Filter "Orang" tidak sempat diuji hingga menyembunyikan kartu
(perlu akun kedua yang diundang ke sebagian kartu saja — di luar cakupan
pengujian solo ini), tapi checklist-nya sudah diverifikasi tampil benar
dengan avatar dan nama diri sendiri.

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

## 2. Arsip kartu / kolom — **selesai (kartu saja)**

Diimplementasikan **kartu saja** — kolom sengaja tidak ikut arsip di iterasi
ini (lihat "Keputusan atas pertanyaan terbuka" di bawah).

Skema: `cards.archivedAt` nullable (`src/db/schema.ts`, migrasi
`0012_faulty_newton_destine.sql`, `drizzle-kit generate` murni diff lokal —
tidak butuh akses D1 jaringan). Dua jenis aktivitas baru di
`ACTIVITY_KINDS`: `card_archived`/`card_restored`, dengan kalimatnya di
`src/shared/activity.ts` (`describeActivity` untuk lini masa kartu,
`describeNotification` untuk kotak masuk) — dipakai ulang tanpa kode baru
karena keduanya sudah generik atas `ActivityKind`.

Endpoint baru di `src/worker/routes/cards.ts`: `POST /cards/:id/archive`
dan `POST /cards/:id/restore`, mengikuti pola persis endpoint lain di file
yang sama (update kolom, `markCardActivity` dengan `touchCard: false`
karena `updatedAt`/`updatedBy` sudah ikut di-set di query utama,
`touchBoard`, `notifyCardActivity`) — bukan endpoint ad-hoc. `GET
/boards/:id` (`src/worker/routes/boards.ts`) diubah menyaring
`isNull(cards.archivedAt)` dari `allCards`, dan menambah
`archivedCount` (query `COUNT` terpisah, cukup untuk badge tanpa menarik
seluruh daftar). Endpoint baru `GET /boards/:id/archived-cards` menjawab
daftar arsipnya sendiri (id, judul, nama kolom asal, waktu arsip) — hanya
dipanggil saat panelnya benar-benar dibuka, sama seperti daftar gambar
latar di `BoardBackgroundPicker`.

Klien: tombol "Arsipkan" (ikon kotak) di kepala `CardModal`, sejajar
Pindahkan/Salin tautan — lewat `run()` yang sudah ada di situ (pola sama
seperti label/tenggat), bukan `UndoToasts`. Ini beda dari saran awal di
"Saran UI/UX" di bawah — lihat "Keputusan" untuk alasannya. Begitu
diarsipkan, kartu hilang dari `board.columns` (server sudah menyaring), dan
dialog kartunya **ikut menutup sendiri** lewat efek yang sudah ada di
`BoardView` (kartu yang tak lagi ketemu di board membuat alamat kembali ke
papan) — persis perilaku yang sudah ada untuk hapus permanen, tanpa kode
tambahan.

Komponen baru `ArchivePanel.tsx` — tombol chip + panel `.sheet` di kepala
papan, sejajar `BoardFilter`/`BoardBackgroundPicker` (pola yang sama:
`absolute`, tanpa portal, karena kepala papan bukan pane ber-frost). Badge
angka di tombol hanya muncul kalau `archivedCount > 0`. Baris per kartu:
judul, nama kolom asal + waktu relatif, tombol "Pulihkan" dan "Hapus
permanen". "Hapus permanen" dikonfirmasi lewat `ConfirmDialog` yang sudah
ada (dipasang lokal di `ArchivePanel`, bukan lewat `pending` milik
`BoardView` — kartu arsip tidak ada di `board.columns`, jadi alur
`askDeleteCard` yang mencari kartu dari situ tidak bisa dipakai ulang) lalu
memanggil `api.deleteCard` yang sama dengan hapus biasa. Baik Pulihkan
maupun Hapus permanen memanggil `refresh()` board setelahnya, supaya kartu
yang dipulihkan muncul lagi di papan dan badge arsip ikut akurat di kedua
kasus.

**Keputusan atas pertanyaan terbuka:**
- **Kartu saja, kolom tidak ikut arsip** — dikonfirmasi langsung saat mulai
  implementasi. Migrasi, endpoint, dan panel jadi jauh lebih sederhana
  (satu tabel, satu jenis baris di panel); kolom bisa disusulkan nanti
  kalau ternyata dibutuhkan. Ini juga membuat pertanyaan "kartu di kolom
  yang diarsipkan ikut tersembunyi atau independen?" jadi tidak relevan.
- **Realtime & notifikasi**: tidak perlu event granular baru —
  `touchBoard` yang sudah dipanggil membuat kolaborator lain menarik ulang
  board lewat `board:changed`, dan karena kartu terarsip sudah tersaring
  di query board, ia otomatis hilang dari layar mereka juga (mekanisme
  yang sama persis dengan hapus permanen, yang memang sudah begini sejak
  awal). `notifyCardActivity` dipanggil untuk archive/restore supaya
  keduanya tercatat di kotak masuk peserta kartu, sama seperti perubahan
  lain.
- **Tidak pakai `UndoToasts`** — beda dari saran awal. Alasannya: arsip
  itu sendiri *sudah* reversibel secara permanen lewat panel arsip (tombol
  "Pulihkan" kapan saja, tidak dibatasi jendela 6 detik seperti undo
  hapus/pindah). Menambah lapisan undo-toast di atas sesuatu yang sudah
  reversibel hanya menambah kerumitan tanpa manfaat baru bagi pengguna —
  `run()` (optimistik langsung + rollback kalau server menolak) sudah
  cukup dan konsisten dengan pola suntingan kartu lain di `CardModal`.

Diuji langsung di browser (Playwright headless, akun baru, workspace→
board→kolom→2 kartu): badge Arsip tidak tampil angka saat kosong; buka
Kartu 1 → klik Arsipkan → kartu hilang dari papan **dan** dialognya
menutup sendiri, badge Arsip berubah jadi "1"; buka panel Arsip →
menampilkan "Kartu 1" dengan nama kolom asal ("To Do") dan waktu relatif
("baru saja"); klik Pulihkan → Kartu 1 kembali muncul di papan, badge
kembali kosong; arsipkan Kartu 2, lalu "Hapus permanen" dari panel →
dikonfirmasi lewat dialog yang menyebut nama kartu dan menegaskan "beda
dari arsip, tidak bisa dipulihkan lagi" → kartu hilang dari panel arsip
untuk selamanya, badge tetap kosong. Tidak ada error konsol React di
sepanjang pengujian.

**Susulan yang belum dikerjakan:** arsip kolom (di luar cakupan yang
disepakati untuk iterasi ini).

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

## 3. Lampiran kecil di kartu — **selesai**

Diimplementasikan: tabel `cardAttachments` (`src/db/schema.ts`, migrasi
`0011_married_ronan.sql`) — base64 di D1, tanpa R2, persis pola
`userAvatars`. Endpoint `POST/DELETE /api/cards/.../attachments` dan
`GET /api/attachments/:id` (`src/worker/routes/cards.ts`,
`src/worker/guards.ts`) — yang terakhir tetap diperiksa sampai keanggotaan
workspace (beda dari avatar yang publik ke sesama user login), dan
`CardDetail` hanya membawa metadata lampiran, bukan `data`-nya — isi
berkas ditarik terpisah lewat URL itu, sama seperti `user.image`.
Di klien: `src/client/lib/attachment.ts` (resize gambar di browser,
mempertahankan rasio aspek — beda dari avatar yang dipotong persegi;
berkas non-gambar dikirim apa adanya), `CardAttachments.tsx` (daftar
lampiran + lightbox ringan), dipasang di `CardModal` setelah checklist.
Helper canvas→base64 avatar diekstrak ke `imageCodec.ts` supaya dipakai
ulang oleh keduanya.

**Keputusan atas pertanyaan terbuka:** tipe berkas gambar (webp/jpeg/png)
**+ berkas umum kecil** (`application/pdf`, `text/plain`,
`application/zip`) — bukan gambar saja; klik non-gambar mengunduh
(`Content-Disposition: attachment`), bukan dibuka inline. Batas: 500 KB
per berkas (base64) setelah diproses, maksimal 10 lampiran per kartu.
Base64/D1 dikonfirmasi (bukan R2). Pratinjau gambar: lightbox ringan
meniru `ConfirmDialog` (backdrop gelap, klik luar/Esc menutup), tanpa
zoom/pan.

Diuji langsung di browser (Playwright headless, akun baru, workspace→
board→kartu baru): unggah gambar kecil menampilkan thumbnail, klik
membuka lightbox, Esc dan klik backdrop sama-sama menutup lightbox
**tanpa ikut menutup dialog kartu**; unggah berkas non-gambar tampil
sebagai ikon+nama+ukuran dengan tautan unduh yang benar; unggah berkas
melebihi 500 KB ditolak di klien (tanpa panggilan jaringan) dengan pesan
galat yang jelas; hapus lampiran menghilangkannya dari daftar dan
tercatat di lini masa ("menambahkan lampiran …" / "menghapus lampiran
…"). Sanity check keamanan: `GET /api/attachments/:id` dikonfirmasi 401
tanpa sesi dan 404 untuk pengguna yang bukan anggota workspace pemilik
board (lintas dua akun uji). Tidak ada error konsol React di sepanjang
pengujian.

Bug yang ditemukan dan diperbaiki selagi menguji ini (bukan mengenai
lampiran secara khusus): `insert()` di `CardModal.tsx` memanggil `load()`
di blok catch-nya, yang begitu berhasil langsung memanggil
`setError(null)` — menghapus pesan galat yang baru saja diset oleh
catch-nya sendiri. Ini membuat pesan galat pada **semua** alur "tambah"
(checklist, followup baru, label baru, lampiran) nyaris tidak pernah
terlihat penggunanya. `load()` di situ juga tidak berguna: `insert()`
tidak pernah menerapkan apa pun secara optimistik sebelum `commit()`
selesai, jadi tidak ada yang perlu dipulihkan. Baris itu dihapus.

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

## 5. Profil publik: lihat kontribusi orang lain — **selesai**

Diimplementasikan: endpoint `GET /api/workspaces/:id/members/:userId/stats`
(`src/worker/routes/workspaces.ts`) — hanya mengembalikan statistik
(`commentCount`, `cardsCreated`) dibatasi ke board-board workspace itu,
bukan identitas (`UserBrief` sudah ada di tangan tiap titik pemicu, jadi
tidak perlu ditarik ulang). Panel di klien: `ProfilePopover.tsx` — context/
provider global (pola sama seperti `UndoProvider`), popover `fixed`
diposisikan dari `getBoundingClientRect()` elemen yang diklik lewat
`createPortal`, dipasang di `main.tsx`. Titik pemicu yang dipasangi klik:
`AvatarStack` (lewat prop baru `onSelect`) di footer `CardModal`, avatar &
nama penulis followup dan pelaku aktivitas di `CardFollowup.tsx`, chip
orang terundang di `CardPeople.tsx`, dan baris anggota (avatar baru
ditambahkan) di `MembersPage.tsx`. Sengaja **tidak** disentuh: avatar stack
di muka kartu papan (`CardItem.tsx`, sudah satu target klik besar untuk
membuka dialog) dan baris picker "Orang" di `CardPeople` (satu tombol besar
yang sudah dipakai penuh untuk toggle assign/unassign).

Bug yang ditemukan dan diperbaiki selagi menguji: fokus tetap berada di
tombol avatar yang diklik (di dalam `CardModal`) setelah popover terbuka,
sehingga Escape menembus lewat bubbling native ke handler dialog kartu di
baliknya dan ikut menutup seluruh kartu — persis pola bug lightbox lampiran
sebelumnya, tapi lewat jalur berbeda (fokus, bukan React event bubbling,
karena popover ini di-portal ke `document.body`). Diperbaiki dengan
memindah fokus ke panel popover saat terbuka, meniru `ConfirmDialog`.

Diuji langsung di browser (Playwright headless, akun baru, workspace→
board→kartu baru, tulis 2 followup, assign diri sendiri): kelima titik
pemicu semuanya membuka popover dengan nama dan statistik yang benar
(`[2 followup, 1 kartu dibuat]`), Escape dan klik-di-luar masing-masing
menutup popover **tanpa** ikut menutup dialog kartu, dan tombol silang
hapus chip di `CardPeople` tetap berfungsi (tidak ada regresi dari
menumpangi klik profil di baris yang sama). Sanity check keamanan:
endpoint statistik dikonfirmasi 401 tanpa sesi dan 404 untuk pengguna yang
bukan anggota workspace (lintas dua akun uji). Tidak ada error konsol.

**Susulan:** kapsul profil sendiri di navbar (`ProfileMenu.tsx`) dipasangi
statistik yang sama, dengan sumber angka yang beda alasannya — kapsul itu
dirender sekali untuk semua rute (tidak tahu workspace mana yang sedang
dibuka), jadi ditambah endpoint baru `GET /api/profile/stats`
(`src/worker/routes/profile.ts`) yang menghitung kontribusi **lintas
semua workspace** yang diikuti, bukan dibatasi satu workspace seperti
endpoint profil publik orang lain. Ditampilkan menyatu di panel menu yang
sudah ada (di bawah nama & email, sebelum daftar aksi), bukan lewat
`ProfilePopover` yang sama — kapsulnya sudah punya panelnya sendiri.

**Susulan lagi:** klik foto profil di dalam `ProfilePopover` membuka
lightbox berisi foto ukuran asli (256×256 — persis `AVATAR_SIZE`, karena
foto memang sudah dipangkas ke ukuran itu saat diunggah). Lightbox-nya
diekstrak jadi komponen bersama `Lightbox.tsx` dari yang sebelumnya
tertanam di `CardAttachments.tsx` (dulu `AttachmentLightbox`) — logic
fokus+`stopPropagation` Escape-nya identik, jadi dipakai ulang alih-alih
ditulis dua kali. Satu penyesuaian tambahan diperlukan: `useDismiss` milik
`ProfilePopover` (klik-di-luar & Escape untuk menutup popovernya sendiri)
dinonaktifkan sementara selagi lightbox foto terbuka — lightbox itu
di-portal terpisah ke `document.body`, jadi tanpa ini klik apa pun di
dalamnya (termasuk fotonya) salah terbaca sebagai "klik di luar popover"
dan ikut menutupnya.

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
