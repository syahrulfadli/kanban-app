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
Kartu 1 → klik Arsipkan → kartu hilang dari papan, badge Arsip berubah
jadi "1"; buka panel Arsip → menampilkan "Kartu 1" dengan nama kolom asal
("To Do") dan waktu relatif ("baru saja"); klik Pulihkan → Kartu 1 kembali
muncul di papan, badge kembali kosong; arsipkan Kartu 2, lalu "Hapus
permanen" dari panel → dikonfirmasi lewat dialog yang menyebut nama kartu
dan menegaskan "beda dari arsip, tidak bisa dipulihkan lagi" → kartu
hilang dari panel arsip untuk selamanya, badge tetap kosong. Tidak ada
error konsol React di sepanjang pengujian.

**Susulan: kartu terarsip tetap bisa dibuka lewat pencarian, dengan opsi
pulihkan dan timestamp di dalam dialognya.**

Awalnya dialog kartu **menutup sendiri** begitu diarsipkan (lihat catatan
lama di atas) — itu efek samping dari cara `BoardView` menentukan kartu
mana yang sah dibuka: dicari dari `board.columns`, dan kartu terarsip
memang sengaja disaring dari situ (lihat di atas), jadi ia selalu "tidak
ketemu" dan dialognya otomatis tertutup. Ternyata itu juga membuat kartu
terarsip **tidak bisa dibuka sama sekali** lewat jalur lain (pencarian,
alamat langsung) — cuma diketahui setelah diminta susulan ini secara
eksplisit.

Diperbaiki dengan memindahkan keabsahan "kartu ini boleh dibuka" dari
`BoardView` (yang cuma tahu kartu aktif) ke `CardModal` sendiri (yang
menariknya lewat `GET /cards/:id`, dan endpoint itu memang tidak pernah
menyaring kartu terarsip). `src/client/lib/api.ts` dapat `ApiError`
(membawa status HTTP — `Error` biasa membuangnya), dan `CardModal`
menerima prop `onNotFound` yang dipanggil hanya saat fetch-nya 404
sungguhan (kartu dihapus, atau bukan miliknya) — `BoardView` mengoperkan
`leaveCard` yang sudah ada ke situ. `open`/efek pengalih-alamat lama di
`BoardView` (yang mencari `openCardId` di `board.columns`) dihapus
seluruhnya; `CardModal` sekarang selalu dirender begitu ada `openCardId`,
tak peduli aktif atau terarsip. `CardDetail` juga dapat field
`columnTitle` baru (dikirim server, lewat `requireCard` yang sudah
menjoin `columns`) — chip nama kolom di kepala dialog dulu datang dari
`board.columns` lewat `BoardView`, yang sekarang tidak selalu punya kartu
itu.

**Konsekuensi yang disadari, bukan bug:** dialog yang sedang terbuka
tidak lagi otomatis tertutup kalau kolaborator lain menghapus kartu itu
secara bersamaan (perilaku lama, bergantung pada `board.columns` yang
sudah dihapus). Sekarang penutupannya baru terjadi reaktif — begitu ada
aksi berikutnya di dialog itu (mis. coba menyunting) yang gagal karena
kartunya sungguh sudah tidak ada, `run()` menarik ulang lewat `load()`,
dan itulah yang memicu `onNotFound`. Kasusnya jarang (dua orang
menghapus/melihat kartu yang sama nyaris bersamaan) dan akibatnya kecil
(dialog basi sampai disentuh, bukan galat atau kehilangan data) —
dipertimbangkan sepadan demi kartu terarsip yang sekarang bisa dibuka
dengan benar.

Perubahan lain: `CardModal` — chip "Diarsipkan · &lt;waktu relatif&gt;" di
kepala dialog (cuma muncul kalau `detail.archivedAt`, `title` chip-nya
membawa waktu persis lewat `formatDateTime`); tombol arsip yang sudah ada
sekarang **gantian** jadi "Pulihkan" (ikon beda, `RestoreBoxIcon`) saat
kartunya sudah terarsip — satu slot tombol, bukan tombol baru, karena
cuma satu dari dua aksi itu yang pernah masuk akal sekaligus.
`CardSearchHit` (dan endpoint `/cards/search`, yang sejak awal memang
tidak pernah menyaring kartu terarsip dari hasilnya) dapat field
`archived: boolean`; `CardSearch.tsx` menandainya dengan chip kecil "🗄
Diarsipkan" di sebelah judul hasil. Chip itu awalnya pil kecil custom
(10px, `text-faint`) yang diminta diperjelas — diganti pakai `.chip`
biasa (11px, `ink-soft`, garis tepi tipis), skala dan kontras yang sama
dengan "Diarsipkan" di kepala `CardModal`, supaya keduanya terbaca
sebagai penanda yang sama, bukan dua tingkat kepentingan berbeda.

Diuji langsung di browser (Playwright headless): arsipkan kartu dari
dalam dialognya → dialog **tetap terbuka**, menampilkan chip "Diarsipkan
· baru saja" dan tombol berganti jadi "Pulihkan"; kartu hilang dari
papan; tutup dialog, cari lewat pencarian global → hasilnya menampilkan
chip "Diarsipkan"; klik hasil → dialog kartu terarsip terbuka dengan
timestamp arsip yang sama terlihat; klik "Pulihkan" dari dalam dialog →
chip hilang, tombol kembali jadi "Arsipkan", dan begitu dialog ditutup
kartunya kembali terlihat di papan. Tidak ada error konsol React.

**Susulan: panel arsip jadi dialog modal, barisnya bisa diklik untuk
membuka kartunya.**

`ArchivePanel` awalnya popover kecil berlabuh di tombolnya (`sheet
sheet-frost absolute top-full right-0`, pola sama dengan `BoardFilter`) —
diminta diganti jadi dialog modal terpusat: `fixed inset-0` + `scrim` +
panel di tengah layar, Escape dan klik scrim untuk menutup. `useDismiss`
(pointerdown-di-luar) tidak lagi dipakai — begitu jadi modal sungguhan,
mekanismenya sama seperti `ConfirmDialog`: scrim yang menutup, bukan
mendeteksi klik di luar elemen tertentu.

Pelatnya sempat memakai `glass glass-lens card-dialog` (kaca tembus
pandang, gaya `ConfirmDialog`) — lalu diminta ganti jadi `card-plain`
(pekat, gaya `CardModal`), karena refraksi kaca di atas latar papan yang
warna-warni membuat teksnya kalah kontras, terutama di tema gelap
(`--dialog-fill` cuma `rgb(20 23 29 / 0.62)` — tembus 38%, sedangkan
`--card-fill` gelap pekat `#171A21`, terlepas dari apa pun di baliknya).
Scrim-nya ikut disamakan jadi `scrim-dim` (dipakai `CardModal`) alih-alih
`scrim` polos (dipakai `ConfirmDialog`) — pelat pekat butuh latar yang
lebih gelap untuk tetap terpisah dari papan, karena tidak ada lagi kaca
yang mengaburkan papan di belakangnya untuk melakukan pemisahan itu.
Diuji ulang di tema gelap: teks di panel arsip dan `CardModal` yang
dibuka darinya sama-sama terbaca jelas, tanpa kontras yang hilang.

Judul tiap baris sekarang tombol tersendiri yang membuka kartunya lewat
`CardModal` biasa (`navigate(paths.card(boardId, item.id))`, pola sama
dengan `openHit` di `CardSearch`) — dialog arsip menutup diri dulu sebelum
pindah alamat, supaya tidak ada dua dialog modal bertumpuk. Tombol
"Pulihkan"/"Hapus permanen" tetap ada di baris yang sama sebagai aksi
cepat tanpa perlu membuka kartunya dulu; keduanya `stopPropagation()`
supaya tidak ikut memicu klik pembuka kartu di belakangnya.

Diuji langsung di browser (Playwright headless, 2 kartu diarsipkan):
dialog arsip terbuka di tengah layar dengan scrim; klik judul salah satu
baris membuka `CardModal` kartu itu (dengan chip "Diarsipkan" di
headernya) **dan** dialog arsip ikut tertutup otomatis; buka lagi panel
arsip, klik "Pulihkan" pada baris yang lain → kartu langsung hilang dari
daftar arsip **tanpa** ikut menutup dialog arsip atau membuka
`CardModal`-nya (aksi cepatnya berdiri sendiri dari aksi buka-kartu);
tombol X menutup dialog; kartu yang belum dipulihkan tetap hilang dari
papan, yang sudah dipulihkan-cepat sudah kembali terlihat. Tidak ada
error konsol React.

**Susulan: "Pindahkan ke papan lain…" dipadamkan untuk kartu terarsip.**

Butir itu bukan cuma tidak berlaku — ia **gagal diam-diam**: `askMoveCard`
di `BoardView` mencari kartunya di `board.columns`, dan kartu terarsip
sengaja disaring dari situ (lihat `isNull(archivedAt)` di atas), jadi
mengkliknya menutup menu tanpa membuka dialog apa pun dan tanpa pesan.
`MenuItem` di `CardModal` karenanya dapat dua prop baru — `disabled` dan
`hint` (sebaris alasan di bawah label, hanya tampil selagi padam) — dan
butir Pindahkan memakai keduanya dengan bunyi "Pulihkan dulu dari arsip".

Dipilih **dipadamkan**, bukan disembunyikan (menu yang butirnya
berganti-ganti jumlah membuat orang mengira fiturnya hilang) dan bukan
dibuat benar-benar bekerja — yang terakhir sebenarnya mungkin, karena
`POST /cards/:id/transfer` tidak menyentuh `archivedAt` sama sekali dan
kartunya akan mendarat di arsip papan tujuan; itu disimpan sebagai opsi
lanjutan, bukan yang dikerjakan sekarang.

Diuji di browser (Playwright headless): kartu terarsip → butir padam
(`isDisabled()` true) dengan keterangannya terbaca; kartu yang sama
setelah dipulihkan → butir hidup lagi (`isDisabled()` false).

**Susulan: kontras teks panel arsip di tema gelap.**

Diukur, bukan dikira-kira — di atas `--card-fill` tema gelap (#171A21):
`--color-ink` 16,1:1, `ink-soft` 11,3:1, `muted` 6,6:1, `faint` 3,8:1
(satu-satunya yang gagal AA untuk teks kecil, dan memang sudah tidak
dipakai di panel ini sejak putaran sebelumnya). Yang diubah: judul kartu
`text-ink-soft` → `text-ink` (ia teks utama daftar, harus sekuat judul di
dialog kartu), dan tombol "Pulihkan"/"Hapus permanen" `text-muted` →
`text-ink-soft` — keduanya aksi, dan pada `text-muted` mereka terbaca
sederajat dengan baris nama kolom di sebelahnya. Baris meta (kolom asal +
waktu) sengaja tetap `text-muted`, supaya hierarki dua baris itu tidak
ikut mendatar. Sekalian: keterangan butir menu yang dipadamkan (susulan di
atas) ikut naik dari `text-faint` ke `text-muted`, dengan alasan yang sama.

**Susulan: penyebab sesungguhnya "masih susah dilihat" — bukan kontras,
tapi tinta yang diracuni foto latar.**

Perbaikan kontras di atas benar tapi tidak menyentuh akar masalahnya, dan
pengguna melaporkan panel masih sulit dibaca. Penyebabnya baru ketahuan
setelah pengguna sendiri menunjuk arahnya: "ketika menggunakan mode
background, ia otomatis menyesuaikan dengan kecerahan dari background".

`ArchivePanel` dipasang di `BoardView` di dalam
`<span className="on-photo-top-end">` ([BoardView.tsx:444](src/client/components/BoardView.tsx#L444)) — petak yang tintanya (`--color-ink`,
`--color-ink-soft`, `--color-muted`, `--color-faint`, `--color-line`,
`--color-line-soft`, dst.) ditimpa `useBackdropInk`/`backdrop.ts` mengikuti
kecerahan FOTO LATAR papan di petak itu, bukan mengikuti temanya (lihat
blok "Tinta di atas foto" di `index.css`). Itu mekanisme yang disengaja —
breadcrumb dan chip di kepala papan memang duduk langsung di atas foto dan
butuh tintanya menyesuaikan. Masalahnya: `ArchivePanel`, walau lahir di
petak yang sama, isinya sendiri (dialog modal `.card-plain`, pelat pekat)
sama sekali tidak duduk di atas foto — ia duduk di atas `--card-fill`
pekat. Tapi karena CSS custom property mewarisi ke bawah, dan tiap kelas
`text-ink`/`text-muted`/dst. di dalam dialog itu menulis `color:
var(--color-ink)` yang meng-resolve ulang di titik itu, mereka ikut
membaca tinta yang ditimpa untuk fotonya — bukan tinta tema yang benar
untuk pelat pekatnya sendiri. Kombinasi tema gelap + foto terang di sudut
kanan-atas memilih tinta GELAP (untuk kontras dengan foto terang itu), dan
tinta gelap itu lantas terbaca di atas `--card-fill` yang SUDAH gelap
sendiri — nyaris tak terlihat. Arah sebaliknya (tema terang + foto gelap)
sama rusaknya: tinta TERANG terbaca di atas `--card-fill` yang sudah putih.

**Diperbaiki di root cause**, mengikuti pola yang sudah ada untuk masalah
sejenis (`.sheet` sudah memulihkan tangga tintanya sendiri dari racun rona
kolom berwarna, lewat token `--color-ink-base` dkk. yang dibekukan di
`:root` — lihat komentarnya di `index.css`). Ditambah dua token beku baru,
`--color-line-base`/`--color-line-soft-base` (belum ada sebelumnya, dan
`.card-plain`/`.card-dialog` butuh keduanya untuk cincin tepinya sendiri).
`.card-plain` dan `.card-dialog` (dua kelas pelat "berdiri sendiri,
terlepas dari apa pun di baliknya" — dipakai `ArchivePanel`, dan
`ConfirmDialog`/`MoveDialog` yang memakai `card-dialog`) masing-masing
memulihkan `--color-ink`, `--color-ink-soft`, `--color-muted`,
`--color-faint`, `--color-line`, `--color-line-soft` ke token `-base`-nya
begitu masuk, plus `color: var(--color-ink)` eksplisit di root-nya sendiri
— memutus warisan racun dari leluhur mana pun, foto atau kolom berwarna.
`ConfirmDialog` ikut diperbaiki karena "Hapus permanen" dari dalam
`ArchivePanel` memanggilnya sebagai anak dari petak yang sama — bug yang
identik, ditemukan sambil menguji.

Ini juga membatalkan patch sebelumnya (`dark:text-white` ditempel manual
di tiap baris teks `ArchivePanel`) yang sempat dicoba sesaat sebelum
penyebab sesungguhnya ketahuan — dibalikkan lagi, karena (1) tidak
lengkap: cuma menutup satu arah (tema gelap), sedangkan arah sebaliknya
(tema terang + foto gelap) tetap rusak, dan (2) meratakan hierarki
judul/meta yang sengaja dibedakan lewat rona.

Diuji dengan menyuntik `document.documentElement.dataset.inkTopEnd`
langsung (meniru apa yang `useBackdropInk` tulis, tanpa perlu foto
sungguhan) di kedua arah: tema gelap + `inkTopEnd="dark"` (kasus yang
dilaporkan) dan tema terang + `inkTopEnd="light"` (arah sebaliknya).
Warna komputasi diperiksa lewat `getComputedStyle` sebelum dan sesudah:
keduanya sekarang membaca token `-base` yang benar (dark: `#F3F6FC` di
atas `#171A21`; light: `#0B1220` di atas `#FFFFFF`), bukan lagi nilai yang
diracuni (`#0B1220`/`#F7F9FC`). Diuji juga dialog "Hapus permanen" yang
dipanggil dari dalam panel arsip — sama-sama pulih. Tidak ada error
konsol React.

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

## 6. Edit judul dan warna untuk workspace & board — **selesai**

Skema: `workspaces.color` dan `boards.color`, keduanya nullable dengan enum
`LABEL_COLORS` (migrasi `0014_nifty_fantastic_four.sql`). Deklarasi
`LABEL_COLORS`/`COLUMN_COLORS` **dipindah ke pucuk `schema.ts`**, di atas
tabel pertama: `enum` dibaca saat tabelnya dirakit, bukan nanti saat
barisnya ditulis, jadi `workspaces` yang memakainya tidak bisa berdiri di
atas konstanta yang dideklarasikan seratus baris di bawahnya
(`drizzle-kit generate` langsung gagal dengan "Cannot access 'LABEL_COLORS'
before initialization" — bukan kesalahan yang menunggu sampai runtime).

Endpoint: bukan endpoint baru, dua yang sudah ada tinggal diperluas seperti
dugaan di "Pertimbangan" di bawah. `PATCH /workspaces/:id` — `name` jadi
opsional dan `color` ditambahkan (`z.enum(LABEL_COLORS).nullish()`, null
menghapus warnanya, jadi ia harus benar-benar terkirim — pola yang sama
dengan warna kolom); izinnya tetap admin, tidak diubah. `PATCH /boards/:id`
dapat `color` di sebelah `title` dan cabang `background` yang sudah ada;
izinnya juga tidak diubah — papan memang boleh disunting anggota biasa,
sama seperti mengganti latarnya dari dalam papan. Di klien
`renameWorkspace`/`renameBoard` diganti `updateWorkspace`/`updateBoard`
yang menerima `{ name?, color? }` — satu pintu, karena keduanya memang
disunting bersama di satu popover.

Komponen baru `NameColorPopover.tsx`, dipakai baris workspace **dan** baris
board (`subject` cuma mengganti katanya): input nama + `ColorSwatches`
(`clearable`, komponen yang sudah ada, dipakai ulang tanpa perubahan) +
Simpan/Batal, ditutup lewat `useDismiss` (klik luar & Escape), Enter
menyimpan. Popover berlabuh `right-0` ke barisnya, bukan dialog terpusat —
menutup seluruh layar untuk dua isian kecil akan membuat mengubah nama
terasa lebih berat daripada menghapusnya.

**Keputusan yang diambil saat implementasi:** warnanya **ikut tombol
Simpan**, tidak tersimpan seketika seperti warna kolom di menu `ColumnView`.
Di sana pemilih warna berdiri sendiri; di sini ia bertetangga dengan kolom
isian yang memang harus ditutup dengan Simpan, dan satu panel yang setengah
isinya menyimpan sendiri sementara setengah lagi menunggu tombol tidak bisa
ditebak dari melihatnya. Penyimpanannya optimistik dengan salinan keadaan
lama sebagai jalan pulang — **tanpa** `useUndo` seperti hapus, karena
mengubah nama sudah bisa dibatalkan dengan mengubahnya kembali, dan toast
urung untuk sesuatu yang tidak hilang cuma menambah bunyi.

Penanda di baris: titik `label-dot` (`labelTint`, sama persis dengan titik
label dan titik warna kolom) di kiri nama, dan **cuma digambar kalau ada
warnanya** — baris tanpa warna tidak menyisakan titik kosong, supaya daftar
tetap tenang saat tidak ada satu pun yang ditandai. Tombol pensil muncul di
antara chip peran dan tombol hapus; di daftar workspace ia hanya untuk
`role !== "member"` (mengikuti `assertRole(admin)` di server), di daftar
board untuk semua anggota (mengikuti izin server yang memang lebih longgar
di sana).

Diuji langsung di browser (Playwright headless, tema gelap, akun baru, 2
workspace + 2 board): popover terbuka dari baris "Tim Produk", ganti nama
jadi "Tim Produk Inti" + warna teal → baris langsung berubah dan titik teal
muncul; **reload** → keduanya bertahan (tersimpan di server, bukan cuma di
state); popover baris board "Rilis Q4" + warna violet → titik violet muncul
di barisnya. Tidak ada error konsol React.

**Dua bug pada popover ini, ditemukan dan diperbaiki di putaran berikutnya
(keduanya soal `useDismiss`, dan keduanya baru terlihat saat diuji, bukan
saat dibaca):**

1. **Escape di dalam kolom isian tidak menutup apa-apa.** `stopPropagation`
   pada peristiwa sintetis React ikut menghentikan peristiwa aslinya di
   wadah akar, jadi pendengar `keydown` milik `useDismiss` — yang duduk di
   `document` — tidak pernah kebagian. Menahannya tetap perlu (Escape tidak
   boleh menembus ke apa pun di belakang popover), jadi penutupannya
   dikerjakan di tempat yang sama, persis seperti popover tenggat di
   `CardDue` yang sejak awal memang begitu.
2. **Menekan tombol pensil untuk kedua kalinya tidak menutup popovernya.**
   `pointerdown` di tombol itu terbaca sebagai ketukan di luar → popover
   ditutup, lalu `click`-nya menyalakan lagi seketika; hasilnya terlihat
   seperti tombolnya tidak berfungsi. Diperbaiki dengan meneruskan ref
   tombol pemicunya ke `useDismiss` lewat prop `anchorRef` — memang itu
   alasan hook itu menerima BEBERAPA ref sejak awal (lihat catatannya di
   `useDismiss.ts`), dan pemakaian pertama ini justru melewatkannya. Satu
   ref untuk seluruh daftar, dipasang hanya di baris yang sedang disunting:
   cuma ada satu popover terbuka pada satu waktu.

Diuji ulang sesudahnya: Escape di dalam input menutup (tadinya tidak),
tombol pensil kedua kali menutup (tadinya tidak), klik di luar tetap
menutup, dan simpan nama+warna masih bertahan setelah reload.

**Belum dikerjakan (di luar cakupan yang disepakati):** warna board belum
dipakai di tempat lain selain baris daftarnya — kepala papan, breadcrumb,
dan daftar workspace di navbar masih tak berwarna.

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

## 7. Tenggat bisa ditandai "Selesai" — **selesai**

Diminta di luar batch yang direncanakan: tenggat yang pekerjaannya sudah
beres harus berhenti terhitung terlambat, dan tanggalnya berubah hijau.

Skema: `cards.dueDoneAt` timestamp nullable (migrasi
`0013_clammy_molecule_man.sql`) — timestamp, bukan boolean, dengan alasan
yang sama seperti `archivedAt`: "sudah selesai" hampir selalu disusul
"sejak kapan", dan chip di dialog kartu memang menampilkan keduanya
("Selesai · baru saja"). Dua `ACTIVITY_KINDS` baru, `due_done` dan
`due_undone`, dengan kalimatnya di `shared/activity.ts` — terpisah dari
`due_changed` karena tanggalnya tidak berubah sama sekali; yang berubah
cuma apakah ia masih menagih.

Server: bukan endpoint baru — `PATCH /cards/:id` menerima `dueDone:
boolean` (keadaan, bukan waktu; kapannya dicatat server, karena jam klien
bisa meleset). Tiga hal bisa menggerakkan tandanya, dan urutannya
disengaja: (1) klien menyatakannya langsung — paling berhak; (2) tenggatnya
**dipindahkan** ke tanggal lain → tanda selesai gugur, karena tanggal baru
adalah tagihan baru (tanpa aturan ini, kartu yang tenggatnya digeser ke
pekan depan lahir sudah "selesai" tanpa ada yang mengerjakannya); (3)
tenggatnya **dihapus** → tidak ada lagi yang bisa diselesaikan. Catatan
lini masa hanya ditulis untuk yang dinyatakan langsung: yang gugur karena
(2) atau (3) itu akibat, dan mencatat keduanya membuat satu gerakan
dikabarkan dua kali. Aturan yang sama ditiru di state optimistik klien
(`setDue` di `CardModal`), supaya kartunya tidak sempat tampil hijau
dengan tenggat yang sudah berpindah sebelum jawaban server datang.

Klien: `dueState(value, doneAt?)` di `format.ts` dapat keadaan keempat
`"done"` yang **menang atas `"overdue"`** — ia tidak diukur dari jam tapi
dinyatakan orang. Dari situ ronanya mengalir ke dua tempat: chip tanggal di
`CardDue` dan angka tenggat di muka kartu (`CardItem`) sama-sama jadi
`text-ok`. Sakelarnya sendiri chip di sebelah tanggal ("Tandai selesai" →
"Selesai · <waktu relatif>"), bukan butir di dalam popover pengatur
tanggal: menyelesaikan tenggat itu ketukan sambil lalu, sedangkan popover
itu tempat memilih tanggal. Silang "hapus tenggat" duduk di antara
keduanya, menempel pada chip tanggal yang memang jadi miliknya.

Filter board (`boardFilter.ts`): kartu yang tenggatnya selesai keluar dari
**ketiga** kategori — bukan pindah ke "Tanpa tanggal", yang berarti hal
lain (belum dijadwalkan sama sekali). Ketiga saringan itu menanyakan
pekerjaan mana yang masih menagih waktu, dan yang ini sudah tidak.

**Catatan atas "tidak lagi memicu notifikasi":** aplikasi ini **belum
punya** notifikasi tenggat terlewat — tidak ada cron/`scheduled` di
`wrangler.jsonc` maupun alarm Durable Object, dan satu-satunya kabar
bertema tenggat yang ada (`due_changed`/`due_cleared`) dipicu saat
seseorang mengubah tanggalnya, bukan saat waktunya lewat. Jadi yang
sungguh dipadamkan sekarang adalah penanda terlambatnya: rona merah di
kartu & dialog, kalimat "Lewat tenggat", dan kategori "Terlambat" di
filter. `dueDoneAt` sudah jadi tempat bertanya yang benar kalau pengingat
terjadwal ditambahkan nanti.

Diuji langsung di browser (Playwright headless, tema gelap, akun baru, dua
kartu bertenggat 36 jam lalu): kartu yang belum ditandai tampil merah
dengan "Lewat tenggat"; kartu yang ditandai selesai lewat API tampil hijau
di papan maupun di dialognya; menandai kartu kedua lewat tombolnya
mengubah chip jadi "Selesai · baru saja" (hijau) seketika dan angka
tenggatnya di papan ikut hijau; filter "Terlambat" yang tadinya memuat
keduanya berubah jadi "Tidak ada kartu yang cocok filter". Tidak ada error
konsol React.

Ketiga aturan server yang saling berkaitan itu diuji terpisah lewat API
(delapan skenario, semuanya lulus), karena yang lewat UI cuma menyentuh
jalur bahagianya: (1) ditandai selesai → `dueDoneAt` terisi, lini masa
`due_done` sekali; (2) tenggat **dipindah** ke tanggal lain → tanda selesai
gugur dan lini masanya cuma mencatat `due_changed` — **tidak** ada
`due_undone` palsu; (3) tenggat **dihapus** → tanda selesai ikut kosong,
cuma `due_cleared`; (4) tanggal yang sama dikirim ulang → tanda selesai
bertahan (bukti `dueChanged` membandingkan nilai, bukan kehadiran field);
(5) `dueDone: false` → null, dan `due_undone` tercatat; (6) kartu tanpa
tenggat ditandai selesai → diabaikan diam-diam, tanpa catatan palsu di
lini masa; (7) `dueAt` + `dueDone` dalam satu permintaan → langsung
selesai, `due_done` tercatat; (8) payload `GET /boards/:id` membawa
`dueDoneAt` (yang dibaca muka kartu untuk ronanya).

## 8. Readabilitas: penekanan (emphasis) dan ukuran teks di seluruh papan — **selesai**

Diimplementasikan persis rencana di bawah, lewat perubahan warna/ukuran
saja — tidak ada tata letak yang berubah:

- `.section-label` ([index.css:1414](src/client/index.css#L1414)):
  `--color-faint` → `--color-muted`, `uppercase`+`tracking` dipertahankan
  (efeknya menjalar otomatis ke tujuh titik pakainya: `CardModal`,
  `CardChecklist`, `CardLabels`, `CardPeople`, `CardDue`).
- `CardItem`: judul kartu `text-ink-soft` → `text-ink`; baris meta
  (tenggat/checklist/lampiran/komentar) `text-[0.6875rem]` → `text-xs`,
  dan wrapper-nya `text-faint` → `text-muted` (termasuk fraksi checklist
  yang belum selesai, `item.done ? ... : "text-faint"` →  `"text-muted"`).
- `BoardFilter`/`BoardBackgroundPicker`: baris isi yang dibaca sungguhan
  (nama orang, label due, deskripsi latar, label swatch gambar, pesan
  galat) naik dari `text-[11px]` ke `text-xs`; badge angka murni
  dibiarkan di ukuran lamanya.
- `LiveIndicator`: label "Anda" `text-faint` → `text-muted`.
- Disapu ulang seluruh `text-faint` yang menempel pada teks yang memang
  dibaca (bukan ikon tombol dekoratif) di `CardModal` (jejak "Dibuat
  oleh…"/"Diubah oleh…", naik juga ke `text-xs`), `CardFollowup` (baris
  aktivitas linimasa, timestamp & tombol Edit/Hapus komentar),
  `CardPeople` (email di baris orang, pesan kosong), `CardLabels` (pesan
  kosong), `CardAttachments` (ukuran berkas, keterangan "maks 500 KB"),
  dan `MarkdownField` (tip baris baru) — semuanya `text-faint` →
  `text-muted`, ukuran dipertahankan kecuali disebut naik di atas.
  Ikon tombol dekoratif (hapus/silang) sengaja **tidak** disentuh —
  presedennya sudah ada di `CardModal.tsx:153` (komentar yang
  membedakan teks-yang-dibaca dari afordansi ikon), jadi diikuti, bukan
  ditemukan ulang.
- `.markdown-body` (`index.css:844`) diperiksa dan **tidak diubah** —
  sudah `line-height: 1.625` (setara `leading-relaxed`), poin #6 di
  rencana ternyata sudah terpenuhi sebelum rencana ini ditulis.

`npx tsc --noEmit` bersih. Diuji langsung di browser (Playwright headless,
akun baru, kedua tema — skrip mendaftar, bikin workspace, board dengan
kolom bawaan, tiga kartu, lalu pada satu kartu menambah label, checklist,
dan komentar): judul kartu di muka papan tampil putih penuh (bukan lagi
abu-abu redup) di kedua tema; label bagian di dalam `CardModal`
("LABEL"/"ORANG"/"DESKRIPSI"/"BATAS WAKTU"/"CHECKLIST"/"LAMPIRAN"/
"KOMENTAR") terbaca jelas sebagai abu-abu sedang, bukan lagi nyaris
tak-kelihatan; baris "Dibuat oleh Rani Pratama · baru saja" di kaki
dialog dan baris komentar (nama, waktu, tombol Edit/Hapus) semuanya
terbaca; panel Filter (checklist Label/Orang/Dibuat oleh/Batas waktu) dan
panel Latar (label tiap swatch gambar, keterangan "Berlaku untuk semua
anggota papan ini") terbaca jelas di kedua tema tanpa terasa penuh-sesak;
panel Arsip (tak tersentuh perubahan ini) tetap seperti semula sebagai
pembanding. Tidak ada error konsol React di sepanjang pengujian, tidak
ada tata letak yang pecah/terpotong akibat ukuran font yang naik.

**Belum sempat diuji visual** (perubahan warna sejenis, pola sama dengan
yang sudah diverifikasi di atas, risiko rendah): status "selesai"
checklist bercoret (`text-muted line-through`), tenggat terlambat
(warna status tetap menang atas perubahan ini, tidak disentuh), dan
label "Anda" di daftar penampil `LiveIndicator` (butuh dua sesi
sekaligus di board yang sama untuk memunculkannya).

---

**Masalah:** diminta perbaikan keterbacaan dan kenyamanan baca di tampilan
papan secara umum — bukan bug fungsional, tapi banyak teks di sana memang
kecil dan pudar sekaligus. Disurvei langsung ke kode sebelum menulis
rencana ini, bukan dikira-kira:

- `.section-label` ([index.css:1414](src/client/index.css#L1414)) — kelas
  bersama untuk judul tiap bagian di dalam `CardModal` (Deskripsi, Label,
  Orang, Tenggat, Checklist, dan seterusnya — dipakai di tujuh titik:
  `CardModal`, `CardChecklist`, `CardLabels`, `CardPeople`, `CardDue`, dst).
  11px, `uppercase`, `letter-spacing` lebar, tebal (700), tapi warnanya
  `--color-faint` — tingkat kontras terendah di tangga tinta, yang sudah
  didokumentasikan di catatan Arsip di atas gagal AA untuk teks kecil di
  kedua tema. Kapital-kecil-tipis itu kombinasi yang dikenal lebih lambat
  dipindai dibanding judul bagian biasa.
- Judul kartu di muka papan (`CardItem.tsx:275`) memakai `text-ink-soft`,
  bukan `text-ink` — padahal itu satu-satunya teks yang paling ingin dibaca
  orang saat memindai kolom, dan judul yang sama di dalam `CardModal`
  ([CardModal.tsx:783](src/client/components/CardModal.tsx#L783)) sudah
  `text-ink` penuh. Baris meta di bawahnya (tenggat/checklist/komentar,
  `CardItem.tsx:308,361,390,400`) 11px `font-semibold`, mewarisi
  `text-faint` dari wrapper-nya (baris 299) — angka yang justru ingin
  dilirik cepat (berapa lama lagi tenggat, berapa checklist tersisa) malah
  kecil dan pudar sekaligus.
- Panel kecil di kepala papan — `BoardFilter`, `ArchivePanel`,
  `BoardBackgroundPicker` — semuanya punya baris isi 11px
  (`text-[11px]`/`text-[0.6875rem]`) untuk konten yang *sungguh dibaca*
  (nama orang di checklist filter, label, deskripsi latar), bukan sekadar
  badge angka dekoratif.
- `LiveIndicator` (informasi koneksi/jumlah terhubung,
  [BoardView.tsx:39](src/client/components/BoardView.tsx#L39)) memakai
  `.chip` 11px untuk status & badge jumlah — konsisten dengan chip lain di
  app, kemungkinan tidak perlu diubah; tapi label "Anda" di daftar penampil
  (`BoardView.tsx:149`) `text-xs text-faint` sementara nama di baris yang
  sama sudah `text-sm` tanpa warna pudar — dua baris yang berdekatan dengan
  bobot berbeda tanpa alasan jelas.
- Judul kolom (`ColumnView.tsx:406,489`) sudah `text-sm font-semibold`
  (14px) — relatif sehat; badge jumlah kartu (`ColumnView.tsx:510`) 11px
  lewat `.chip-plain`, murni angka, kemungkinan tidak perlu diubah.

**Cakupan:**
- `CardModal` dan sub-komponennya (`CardLabels`, `CardPeople`, `CardDue`,
  `CardChecklist`, `CardAttachments`, `CardFollowup`) — terutama kelas
  bersama `.section-label`, dan warna/ukuran baris isi di masing-masing.
- Muka kartu di papan (`CardItem`) — judul kartu dan baris meta
  (tenggat/checklist/komentar/lampiran).
- Kepala kolom (`ColumnView`) — ditinjau, kemungkinan perubahan kecil saja.
- Panel kecil di kepala papan: `BoardFilter`, `ArchivePanel`,
  `BoardBackgroundPicker`, `LiveIndicator`.
- Di luar cakupan (kecuali diminta menyusul): halaman di luar tampilan
  papan itu sendiri (`WorkspacesPage`, `MembersPage`, `AdminPage`, dst) —
  permintaan eksplisit berbunyi "kanban board itu sendiri secara
  keseluruhan", jadi difokuskan ke pengalaman papan.

**Pertimbangan:**
- Tegangan dengan [[desain-halus-bukan-mencolok]] — solusinya harus tetap
  tenang: menaikkan kontras/ukuran secukupnya untuk nyaman dibaca, bukan
  membuat semuanya besar dan tebal sekaligus. Prioritas: perbaiki kontras
  warna dulu (faint → muted untuk apa pun yang merupakan ISI, bukan
  dekorasi), baru naikkan ukuran satu tingkat kalau kontras saja belum
  cukup — bukan lompat besar dari 11px ke 14px sekaligus.
- `.section-label` itu satu kelas bersama dipakai di banyak tempat —
  mengubahnya sekali menaikkan seluruh dialog kartu sekaligus (efisien,
  konsisten), tapi berarti perlu diuji ulang di semua titik pakainya
  (tujuh komponen), bukan cuma satu.
- `--color-faint` dipakai luas juga di luar cakupan ini (placeholder
  input, hint yang memang tersier) — perubahan harus dibedakan per kasus:
  tetap pakai `faint` untuk yang benar-benar dekoratif/tersier, naikkan ke
  `muted` untuk apa pun yang merupakan isi yang mesti terbaca (nama orang,
  judul bagian, angka meta kartu).
- Menaikkan ukuran font baris meta di muka kartu menambah tinggi tiap
  kartu — mengurangi jumlah kartu yang muat sekali pandang per kolom.
  Trade-off yang harus disadari; condong ke satu tingkat naik saja
  (11px→12px) bukan lompatan besar, supaya kepadatan papan tidak berubah
  drastis.
- Perubahan dikerjakan bertahap per area (bukan satu commit raksasa),
  supaya tiap langkah gampang diuji visual di kedua tema (terang/gelap)
  sebelum lanjut — pola yang sama seperti batch-batch sebelumnya di
  berkas ini.

**Saran UI/UX (rencana konkret, urutan diusulkan):**
1. `.section-label`: warna `--color-faint` → `--color-muted`; `uppercase`
   dan `letter-spacing` **dipertahankan** — lihat "Keputusan atas
   pertanyaan terbuka" di bawah, dua-duanya sudah dijawab lewat riset,
   bukan ditebak.
2. Judul kartu di `CardItem`: `text-ink-soft` → `text-ink`, menyamakan
   dengan judul di `CardModal` yang sudah penuh — judul adalah target
   baca utama saat memindai kolom.
3. Baris meta kartu (tenggat/checklist/komentar) di `CardItem`: naikkan
   dari 11px ke `text-xs` (12px) **dan** warnanya dari `text-faint` ke
   `text-muted` — bukan salah satu saja, lihat "Keputusan" di bawah; meta
   yang memang harus menonjol (mis. tenggat terlambat) sudah menang lewat
   warna status (`text-danger`/`text-ok`), jadi kombinasi ukuran+kontras
   ini hanya berlaku untuk meta yang netral.
4. `BoardFilter`, `ArchivePanel`, `BoardBackgroundPicker`: baris isi yang
   dibaca sungguhan (nama orang, label filter, deskripsi latar) naik dari
   11px ke `text-xs`/`text-sm` sesuai konteks; badge angka murni (jumlah
   filter aktif, jumlah arsip) boleh tetap 11px karena itu dilirik, bukan
   dibaca kata per kata.
5. `LiveIndicator`: kemungkinan dibiarkan (chip 11px konsisten dengan
   chip lain di app) — cukup samakan label "Anda" dari `text-faint` ke
   `text-muted` supaya sederajat dengan nama di baris yang sama.
6. Deskripsi kartu & followup (`Markdown` body, `text-sm`): cek
   `line-height`-nya untuk paragraf panjang — mungkin perlu
   `leading-relaxed`, bukan default, supaya nyaman dibaca bukan cuma
   cukup besar.
7. Kerjakan satu per satu, diuji langsung di browser tiap area (kedua
   tema) sebelum lanjut ke area berikutnya.

**Keputusan atas pertanyaan terbuka — digali dari literatur
typography/UX, bukan ditebak (diminta eksplisit oleh pengguna: "gali dari
pendapat ilmu para ahli typography desain web"):**

- **`.section-label` tetap `uppercase` + `letter-spacing` lebar — cuma
  warnanya yang naik.** Riset word-shape klasik (dirujuk di
  [Stanford Accessibility](https://uit.stanford.edu/accessibility/learn-about/typography/all-caps),
  [UX Movement](https://uxmovement.com/content/all-caps-hard-for-users-to-read/))
  memang menunjukkan huruf kapital menghilangkan kontur naik-turun
  (ascender/descender) yang dipakai otak mengenali *bentuk kata* — tapi
  efek itu berlaku untuk **kalimat/paragraf panjang**. Untuk label pendek
  (1–2 kata: "Deskripsi", "Checklist", "Orang") yang tidak dibaca kata per
  kata tapi dipindai sebagai satu potongan, [Butterick's Practical
  Typography](https://practicaltypography.com/all-caps.html) secara
  eksplisit menyebut caps cocok untuk "headings shorter than one line,
  headers, footers, captions, atau label lain" — persis kategori
  `.section-label`. Letter-spacing 0.06em (6%) yang sudah dipakai juga
  sudah benar menurut kaidah yang sama: Butterick merekomendasikan tambah
  5–12% letterspacing tiap kali huruf kapital dipakai berderet, karena
  jarak antar-huruf kapital yang dirancang untuk berdampingan dengan huruf
  kecil (awal kalimat) terasa terlalu rapat kalau dipakai berturut-turut
  sendirian. Jadi `uppercase`+`tracking` **bukan** sumber masalahnya —
  warna `--color-faint`-lah yang gagal AA di ukuran 11px (ambang "large
  text" WCAG yang cuma butuh 3:1 adalah 18.66px-tebal ke atas — jauh di
  atas 11px kita), itu satu-satunya yang perlu diperbaiki di kelas ini.
- **Baris meta muka kartu (`CardItem`) naik ukuran DAN kontras, bukan
  kontras saja.** [NN/g — "Typography for Glanceable Reading: Bigger Is
  Better"](https://www.nngroup.com/articles/glanceable-fonts/) meneliti
  persis skenario ini — teks yang dibaca sekilas/dipindai cepat (dasbor,
  metadata kartu — bukan dibaca kata per kata) dan menyimpulkan **ukuran
  lebih berpengaruh daripada yang diduga** untuk kenyamanan baca sekilas,
  bukan cuma kontras. Ini juga konsisten dengan panduan
  [Refactoring UI](https://www.refactoringui.com/) (Wathan & Schoger) yang
  dipakai sebagai rujukan poin lain di rencana ini: jangan andalkan **satu**
  pengungkit hierarki saja (cuma ukuran, atau cuma warna) — kombinasikan
  ukuran, bobot, dan warna secukupnya. Karena trade-off kepadatan kolom
  yang disebut di "Pertimbangan" tetap nyata, kenaikan ukurannya dibatasi
  satu tingkat (11px→12px, bukan lompat ke 14px) — cukup untuk memenuhi
  saran "bigger is better" tanpa mengorbankan berapa banyak kartu yang
  muat sekali pandang.
