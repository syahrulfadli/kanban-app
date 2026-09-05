# Kanban

Papan kanban kolaboratif dengan drag & drop, berjalan penuh di free tier Cloudflare.

Kartu bisa dibuka sebagai dialog: label berwarna, checklist dengan progress bar,
thread followup, orang yang diundang mengurusnya, tenggat, serta jejak siapa
membuat dan mengubahnya.

Bisa dipasang sebagai aplikasi (PWA) dan mengirim notifikasi push ke perangkat —
peserta sebuah kartu dikabari saat ada followup baru atau kartunya berubah,
meski aplikasinya sedang tertutup. Kabar yang sama juga menumpuk di kotak masuk
di dalam aplikasi, lengkap dengan penyaring per workspace dan per papan.

## Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Drag & drop | Pragmatic drag-and-drop (Atlassian) |
| Backend | Hono di Cloudflare Workers |
| Realtime | Durable Objects + WebSocket (hibernation) |
| Notifikasi | Web Push (VAPID + aes128gcm) langsung dari Worker |
| Auth | Better Auth (email/password + OAuth opsional) |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM |
| Validasi | Zod |

Frontend dan API di-deploy sebagai **satu Worker** — tidak ada CORS, tidak ada layanan terpisah.

## Menjalankan secara lokal

```bash
npm install

# Siapkan secret lokal
cp .dev.vars.example .dev.vars
# lalu isi BETTER_AUTH_SECRET dengan: openssl rand -base64 32

# Kunci notifikasi push — salin keluarannya ke .dev.vars (opsional)
npm run vapid:keys

npx wrangler d1 migrations apply kanban-db --local
npm run dev
```

Login email/password langsung berfungsi tanpa konfigurasi OAuth apa pun.
Tanpa kunci VAPID aplikasinya juga tetap jalan — sakelar notifikasinya saja yang
tidak muncul.

## Deploy ke Cloudflare

```bash
# 1. Login
npx wrangler login

# 2. Buat database, lalu salin database_id yang muncul ke wrangler.jsonc
npx wrangler d1 create kanban-db

# 3. Migrasi database produksi
npm run db:migrate:remote

# 4. Set secret produksi
npx wrangler secret put BETTER_AUTH_SECRET     # openssl rand -base64 32
npx wrangler secret put BETTER_AUTH_URL        # https://<nama>.workers.dev

# Notifikasi push (opsional) — sepasang kunci dari `npm run vapid:keys`
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY

# 5. Deploy
npm run deploy
```

### Mengaktifkan login Google / GitHub (opsional)

Daftarkan OAuth app dengan callback `https://<domain-anda>/api/auth/callback/<provider>`, lalu:

```bash
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
```

Tombolnya muncul otomatis di halaman login begitu kredensialnya terpasang —
endpoint `/api/config` yang memberi tahu klien provider mana yang aktif.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Dev server (Vite + Worker jadi satu) |
| `npm run build` | Typecheck + build produksi |
| `npm run deploy` | Build lalu deploy ke Cloudflare |
| `npm run typecheck` | Cek tipe seluruh project |
| `npm run db:generate` | Buat file migrasi dari perubahan schema |
| `npm run db:migrate:local` | Terapkan migrasi ke DB lokal |
| `npm run db:migrate:remote` | Terapkan migrasi ke DB produksi |
| `npm run vapid:keys` | Buat sepasang kunci VAPID untuk notifikasi push |
| `npm run auth:generate` | Regenerate schema Better Auth |
| `npm run cf-typegen` | Regenerate tipe binding Cloudflare |

## Model izin

```
workspace
 └── workspace_members (user, role)     ← sumber kebenaran hak akses
      └── boards
           └── columns
                └── cards
```

| Aksi | Peran minimum |
|---|---|
| Lihat & kelola kartu/kolom | `member` |
| Buat & ganti nama board | `member` |
| Hapus board, undang/keluarkan anggota | `admin` |
| Ubah peran, hapus workspace | `owner` |

Semua pemeriksaan izin ada di [src/worker/guards.ts](src/worker/guards.ts). Route tidak
pernah menyentuh tabel keanggotaan langsung — selalu lewat `requireBoard`,
`requireColumn`, `requireCard`, atau `requireMembership`.

Bukan anggota mendapat **404, bukan 403**, supaya keberadaan sebuah workspace atau
board tidak bocor ke orang luar.

## Struktur route

### API

| Method | Route | Peran |
|---|---|---|
| `ALL` | `/api/auth/**` | publik (ditangani Better Auth) |
| `GET` | `/api/config` | publik |
| `GET` | `/api/invitations/:token` | publik (pratinjau undangan) |
| `GET POST` | `/api/workspaces` | login |
| `PATCH DELETE` | `/api/workspaces/:id` | admin / owner |
| `GET` | `/api/workspaces/:id/members` | member |
| `PATCH DELETE` | `/api/workspaces/:id/members/:userId` | owner / admin |
| `GET POST` | `/api/workspaces/:id/invitations` | admin |
| `POST` | `/api/invitations/:token/accept` | login |
| `DELETE` | `/api/invitations/:id` | admin |
| `GET POST` | `/api/boards` | member |
| `GET PATCH` | `/api/boards/:id` | member |
| `GET` | `/api/boards/:id/ws` | member (upgrade WebSocket) |
| `DELETE` | `/api/boards/:id` | admin |
| `GET` | `/api/boards/destinations` | member (papan tujuan untuk pindah kolom/kartu) |
| `POST PATCH DELETE` | `/api/columns`, `/api/columns/:id` | member |
| `POST` | `/api/columns/:id/move` | member |
| `POST` | `/api/columns/:id/transfer` | member (pindah ke papan lain) |
| `POST PATCH DELETE` | `/api/cards`, `/api/cards/:id` | member |
| `GET` | `/api/cards/search?q=` | member (cari kartu lintas papan) |
| `GET` | `/api/cards/:id` | member (isi lengkap kartu untuk dialog) |
| `POST` | `/api/cards/:id/move` | member |
| `POST` | `/api/cards/:id/transfer` | member (pindah ke papan lain) |
| `POST DELETE` | `/api/cards/:id/labels`, `/api/cards/:id/labels/:labelId` | member |
| `POST DELETE` | `/api/cards/:id/members`, `/api/cards/:id/members/:userId` | member (undang anggota workspace ke kartu) |
| `POST` | `/api/cards/:id/comments` | member |
| `PATCH` | `/api/cards/comments/:id` | penulisnya |
| `DELETE` | `/api/cards/comments/:id` | penulisnya / admin |
| `POST` | `/api/cards/:id/checklist` | member |
| `PATCH DELETE` | `/api/cards/checklist/:id` | member |
| `POST` | `/api/labels` | member |
| `PATCH DELETE` | `/api/labels/:id` | member |
| `GET` | `/api/push` | login (kunci publik + pilihan notifikasi) |
| `POST` | `/api/push/subscribe`, `/api/push/unsubscribe` | login |
| `PATCH` | `/api/push/prefs` | login |
| `POST` | `/api/push/test` | login (notifikasi percobaan ke perangkat ini) |
| `GET` | `/api/notifications` | login (kotak masuk; saring `workspaceId`/`boardId`) |
| `GET` | `/api/notifications/count` | login (angka lencana saja) |
| `POST` | `/api/notifications/read`, `/api/notifications/read-all` | login |
| `PUT DELETE` | `/api/profile/avatar` | login (foto profil sendiri) |
| `POST` | `/api/profile/password` | login (kata sandi pertama untuk akun sosial) |
| `GET` | `/api/avatars/:userId` | login (berkas foto profil) |

### Frontend

```
#/                      daftar workspace — atau halaman pengantar, kalau belum masuk
#/masuk, #/daftar       masuk & buat akun
#/w/:workspaceId        daftar board dalam workspace
#/w/:workspaceId/members anggota & undangan
#/settings              pengaturan akun & notifikasi
#/board/:boardId        papan kanban
#/board/:boardId/card/:cardId  papan dengan satu kartu terbuka (tujuan notifikasi)
#/invite/:token         terima undangan
```

Router-nya hash-based tanpa library ([src/client/lib/route.ts](src/client/lib/route.ts)).
Kalau halaman bertambah banyak, ganti ke TanStack Router.

## Struktur folder

```
src/
├── client/       React: komponen, hooks, api client
├── worker/       Hono: routes, auth, ownership guard, pengirim push
├── db/           Drizzle schema (auth-schema.ts di-generate)
└── shared/       Tipe, helper posisi, kalimat lini masa (dipakai kedua sisi)
public/           Manifest PWA, service worker, halaman offline, ikon
scripts/          Pembuat kunci VAPID & penggambar ikon
migrations/       SQL migrasi D1
```

## Catatan desain

**Urutan kartu memakai fractional indexing.** Kolom `position` bertipe `real`, bukan
integer berurutan — memindahkan satu kartu cukup meng-update satu baris, bukan
menomori ulang seluruh kolom. Kalau dua tetangga jadi terlalu rapat (setelah ~50
sisipan di celah yang sama), server otomatis menomori ulang kolom tersebut.

**Posisi dihitung di server.** Klien hanya mengirim `{ columnId, index }`; server yang
menentukan angka `position`-nya.

**Pencarian mencakup label dan orang.** Kotak cari di kapsul navigasi menyaring
seluruh papan yang boleh dibuka — bukan hanya papan yang sedang terbuka — dan yang
dicocokkan bukan hanya judul dan deskripsi, tapi juga nama label dan nama peserta
kartunya: "kartu Rina yang Mendesak itu" adalah cara orang benar-benar mengingat
kartu. Baris hasilnya menandai potongan yang cocok, memotong cuplikan deskripsi di
sekitar kata yang ditemukan, dan memberi cincin pada label atau wajah yang jadi
alasan kartu itu muncul. Implementasinya `LIKE` biasa yang dibatasi keanggotaan
workspace, bukan FTS5: tabel bayangan FTS harus dijaga sinkron lewat trigger di
setiap tulis, dan pada papan sebesar yang muat di free tier ongkos merawatnya lebih
besar daripada pemindaiannya. Aturan "apa yang disebut cocok" tinggal di
[src/shared/search.ts](src/shared/search.ts) supaya server yang menyaring dan klien
yang menandai tidak pernah berbeda pendapat.

**Pindah papan membawa labelnya.** Kolom dan kartu bisa dipindahkan ke papan lain
(menu kolom, dan kenop pindah di kepala dialog kartu). Label dimiliki papan, jadi
label yang menempel dicarikan padanannya di papan tujuan lewat nama dan warna, dan
yang belum ada di sana dibuatkan — melepasnya begitu saja berarti membuang
keterangan yang tidak bisa dipulihkan siapa pun. Perpindahan ini bukan optimistik:
yang pindah lenyap dari papan yang sedang dibuka, dan dialognya menunggu jawaban
server sebelum menutup.

**Update optimistik.** Perubahan langsung terlihat di UI sebelum server merespons;
kalau request gagal, state ditarik ulang dari server.

**Realtime pakai sinyal, bukan diff.** Setiap mutasi menyiarkan satu event ringan
`board:changed` lewat Durable Object board tersebut; klien lain menarik ulang board
(digabung dengan debounce 200 ms). Mengirim diff memang lebih hemat bandwidth, tapi
menerapkannya di klien perlu penyelesaian konflik — dan untuk board dengan segelintir
kolaborator, tarik-ulang selalu benar dan jauh lebih sederhana.

Klien mengirim id koneksinya di header `X-Client-Id`, dan id itu ikut disiarkan balik,
sehingga tab asal bisa mengabaikan gema perubahannya sendiri — tanpa ini, state
optimistiknya akan ditimpa hasil tarik-ulang.

**Durable Object memakai WebSocket Hibernation** (`ctx.acceptWebSocket`, bukan
`addEventListener`). Koneksi yang menganggur tidak menahan objek tetap hidup, jadi
tidak menghabiskan kuota duration — ini yang membuatnya layak di free plan.

**Jangan pernah memakai ulang nama file migrasi.** D1 melacak migrasi yang sudah
diterapkan berdasarkan **nama file**, bukan isinya. Kalau `migrations/` di-regenerate
dan menghasilkan nama yang sama dengan yang pernah diterapkan (`0000_init.sql`),
`db:migrate:remote` akan melewatinya diam-diam — selesai tanpa error, tanpa
melakukan apa pun. Gejalanya menyesatkan: database lokal benar, produksi masih
memakai schema lama, dan aplikasi gagal dengan error 500 tanpa pesan.

Untuk mengubah schema, selalu buat migrasi **baru** (`npm run db:generate` tanpa
menghapus yang lama). Kalau memang perlu mereset, ledger produksi ikut harus
direset:

```bash
# Hanya kalau database produksi belum berisi data.
npx wrangler d1 execute kanban-db --remote --command \
  "DROP TABLE IF EXISTS cards; DROP TABLE IF EXISTS columns; DROP TABLE IF EXISTS boards; DROP TABLE IF EXISTS d1_migrations;"
npm run db:migrate:remote
```

**Simpan BETTER_AUTH_SECRET sebagai secret, bukan environment variable.** Keduanya
sama-sama terbaca oleh Worker, tapi environment variable tersimpan plaintext dan
terlihat di dashboard, di `wrangler versions view`, dan lewat API. Siapa pun yang
bisa membacanya bisa memalsukan sesi login siapa saja. Pakai
`npx wrangler secret put BETTER_AUTH_SECRET`.

**Muka kartu digambar tanpa membuka kartunya.** `GET /api/boards/:id` sudah membawa
label, progress checklist, jumlah followup, dan peserta setiap kartu — kalau tidak,
papan berisi 60 kartu akan menembak 60 request tambahan hanya untuk menggambar
progress bar. Semuanya diambil dalam enam query tetap yang menyaring lewat subquery
`card_id IN (SELECT …)`, bukan daftar id yang dibentangkan, supaya jumlah kartu tidak
pernah menabrak batas parameter terikat D1. Isi penuh kartu (butir checklist, isi
followup) baru ditarik lewat `GET /api/cards/:id` saat dialognya dibuka.

**Avatar pada kartu diturunkan dari aksi, bukan ditugaskan.** Tabel `card_participants`
diisi setiap kali seseorang membuat, menyunting, memberi label, mencentang checklist,
atau menulis followup pada kartu itu. Urutannya memakai `first_active_at` — pembuat
kartu selalu berdiri paling depan. Menghapus followup terakhir seseorang juga
melepasnya dari deretan avatar, kecuali ia masih tercatat sebagai pembuat atau
penyunting terakhir.

**Undangan ke kartu tinggal di tabelnya sendiri.** `card_members` menyimpan orang
yang *dinyatakan* mengurus sebuah kartu, terpisah dari `card_participants` yang
*disimpulkan* dari aksi. Menggabungnya berarti mengundang seseorang meninggalkan
jejak palsu bahwa ia pernah mengerjakan kartunya. Yang boleh diundang hanya anggota
workspace pemilik papan — undangan tidak memberi akses apa pun (akses tetap lahir
dari `workspace_members`), ia memberi perhatian: kartunya jadi diawasi dan wajah
orangnya muncul di muka kartu, di depan para peserta.

**Tenggat disimpan sebagai satu titik waktu, bukan tanggal.** `cards.due_at` berisi
stempel waktu, dan yang berpindah tangan antara klien dan server selalu ISO beserta
zonanya — tidak pernah tulisan di jam dinding. Kartu dan lini masa memformatnya di
zona perambannya sendiri; kalimat notifikasi disusun di worker, yang berjalan di UTC,
jadi ia memformat memakai `APP_TIME_ZONE` di [src/shared/datetime.ts](src/shared/datetime.ts)
— tanpa itu tenggat pukul tujuh malam dikabarkan sebagai pukul dua siang. Ronanya
hanya muncul saat waktunya menuntut sesuatu (lewat tenggat, atau kurang dari sehari
lagi); tenggat yang masih jauh tetap berhuruf biasa, supaya yang mendesak tidak
tenggelam di antara tanggal berwarna.

**Warna label adalah kunci simbolik, bukan hex.** Yang tersimpan di database cuma
`"red"`, `"violet"`, dan seterusnya; peta ke warna sesungguhnya tinggal di token CSS
(`--label-red`) yang punya nada berbeda untuk tema terang dan gelap. Menyimpan hex
akan mengunci label ke satu tema.

**Web Push dikirim langsung dari Worker, tanpa pustaka.** Dua spesifikasi yang
dipakai — RFC 8291 (enkripsi isi dengan `aes128gcm`) dan RFC 8292 (VAPID, tanda
tangan pengirim) — seluruhnya bisa dikerjakan WebCrypto yang sudah ada di runtime
Workers, jadi tidak ada layanan pihak ketiga, tidak ada biaya, dan tidak ada kunci
yang dititipkan ke siapa pun. Implementasinya di
[src/worker/push.ts](src/worker/push.ts), ±240 baris. Hasil enkripsinya cocok
persis dengan contoh resmi di RFC 8291 §5.

Push service milik Google atau Mozilla hanya meneruskan amplop: isinya dienkripsi
dengan kunci milik perangkat penerima, dan mereka tidak punya kuncinya.

**Yang dikabari adalah peserta kartu, bukan seluruh anggota board.** Daftar
penerimanya diambil dari `card_participants` — tabel yang sama yang menggambar
deretan avatar di muka kartu — ditambah orang yang diundang lewat `card_members`.
Jadi "anggota sebuah kartu" tidak harus ditugaskan manual: siapa pun yang pernah
menyentuh kartu itu ikut mendengar kabarnya, dan mengundang seseorang adalah cara
memasukkannya sebelum ia menyentuh apa pun. Pelakunya sendiri selalu dikecualikan. Kanal `newCards` adalah satu-satunya yang menyapa
seluruh anggota workspace, dan karena itu defaultnya mati.

**Kotak masuk mencatat semuanya; preferensi hanya mengatur perangkat.** Sakelar
Followup / Perubahan kartu / Kartu baru di halaman pengaturan menentukan apa yang
membuat ponsel bergetar — bukan apa yang tercatat. Kotak masuk tetap menjadi
riwayat lengkap, karena kabar yang tidak sempat dilihat di ponsel justru itulah
yang dicari orang saat membuka aplikasinya. Keramaiannya diatur penyaring
workspace/papan, bukan dengan membuang kabarnya.

**Kalimat notifikasi menyebut kartunya, kalimat lini masa tidak.** Baris lini
masa sudah berdiri di dalam kartunya, jadi "memindahkan dari Backlog ke Selesai"
di sana sudah jelas objeknya. Notifikasi dibaca di layar kunci dan di kotak
masuk, jauh dari kartunya — kalimat tanpa objek memaksa orang menebak apa yang
berpindah. Karena itu `describeNotification` di
[src/shared/activity.ts](src/shared/activity.ts) menyusun kalimat yang utuh
sendiri ("Budi memindahkan “Kartu A” dari “ABC” ke “XYZ”"), dan baris pertama
notifikasinya diisi nama papan — bukan judul kartu, yang akan jadi pengulangan.

**Isi notifikasi didenormalisasi.** Judul dan kalimatnya disalin ke baris
`notifications` saat kejadian, bukan dirujuk ke kartunya. Baris ini justru
sering dibaca ketika yang diceritakannya sudah berubah nama atau dihapus — dan
`card_id`-nya sengaja tanpa foreign key supaya kabar "kartu ini dihapus" selamat
dari kartunya sendiri. Riwayatnya disimpan 60 hari, dibuang di kiriman berikutnya.

**Lencana ditanyakan berkala, bukan disiarkan.** Papan punya Durable Object-nya
sendiri, tapi kotak masuk mengikuti orangnya ke halaman mana pun; membuka DO
kedua per orang hanya demi satu angka tidak sepadan di plan gratis. Jadi
`/api/notifications/count` ditanyakan tiap menit — hanya selagi tabnya terlihat —
dan service worker mendorong pembaruan seketika lewat `postMessage` setiap kali
ada push yang mendarat, jadi perangkat yang mengizinkan notifikasi tidak pernah
menunggu detik ke-60.

**Peserta yang sudah keluar dari tim berhenti dikabari.** Jejak seseorang di
`card_participants` tidak ikut terhapus saat ia dikeluarkan dari workspace —
lini masa kartu memang harus tetap utuh — jadi pencarian penerima ikut memeriksa
keanggotaan. Tanpa itu, mantan anggota terus menerima kabar tentang papan yang
sudah tidak boleh ia buka.

**Bunyi notifikasi dipinjam dari lini masa kartu.** `describeActivity` di
[src/shared/activity.ts](src/shared/activity.ts) dipakai dua sisi: klien
menggambarnya sebagai baris riwayat, server merangkainya jadi kalimat notifikasi.
Tanpa itu, kejadian yang sama akan diceritakan dengan dua kata kerja berbeda.

**Satu tag per kartu.** Notifikasi memakai `tag: "card:<id>"`, jadi sepuluh perubahan
beruntun pada satu kartu meninggalkan satu notifikasi di layar kunci, bukan sepuluh.
Penggabungan ini dilakukan perangkat, gratis, dan tidak perlu state apa pun di server.

**Pengiriman tidak menahan respons.** Semuanya berjalan di `waitUntil` — mencari
penerima, mengenkripsi, menembak push service. Orang yang menulis followup tidak
menunggu Google menjawab. Kalau kunci VAPID belum dipasang, tidak ada satu query pun
yang jalan untuk menemukan itu.

**Langganan mati dibuang saat ketahuan.** Push service menjawab 404 atau 410 untuk
perangkat yang langganannya sudah dicabut; barisnya dihapus saat itu juga. Tidak ada
tempat lain yang akan pernah tahu, karena perangkat yang hilang tidak mengirim kabar
perpisahan. Service worker juga menangani `pushsubscriptionchange` — browser boleh
mengganti endpoint kapan saja, dan tanpa itu perangkatnya diam-diam berhenti menerima
apa pun.

**Di iOS, notifikasi baru hidup setelah aplikasinya dipasang.** Safari hanya
memberikan `PushManager` kepada web app yang sudah ditambahkan ke Layar Utama — itu
sebabnya manifest dan ikonnya bukan pemanis. Dialog pengaturan mendeteksi kondisi ini
dan menjelaskan langkahnya, alih-alih menyodorkan sakelar yang tidak akan berfungsi.

**Service worker tidak menyimpan aset aplikasi.** Berkas hasil build punya nama
ber-hash dan sudah dilayani Cloudflare dengan caching-nya sendiri; menyalinnya lagi ke
Cache Storage cuma menambah satu tempat lagi yang bisa menyajikan versi basi. Yang
dicache hanya [public/offline.html](public/offline.html).

**Ikon aplikasi digambar oleh skrip.** [scripts/make-icons.mjs](scripts/make-icons.mjs)
melukis PNG-nya langsung (rounded rect + zlib + CRC32), tanpa satu pun dependensi
gambar, dan warnanya diambil dari token `--color-accent` yang sama dengan CSS.

**Foto profil tinggal di D1, dan yang tersimpan di `user.image` hanya URL-nya.**
Klien memangkas gambarnya jadi persegi 256 piksel lalu mengencode WebP di browser
(puluhan kilobita), barisnya masuk ke tabel `user_avatars`, dan Worker melayaninya di
`/api/avatars/:userId`. Object storage sengaja tidak dipakai — batasannya nol biaya —
dan data URL juga tidak, karena `user.image` terbawa di setiap sesi dan di setiap
peserta kartu yang dikirim board: satu foto akan membengkakkan payload papan
berkali-kali lipat. Query `?v=` berganti tiap unggahan, jadi responsnya boleh
di-cache selamanya tanpa pernah menyajikan foto yang sudah diganti.

**Ganti email hanya untuk akun yang belum terverifikasi.** Memindahkan email dengan
benar butuh surat verifikasi, dan tidak ada layanan email yang gratis — jadi
`updateEmailWithoutVerification` dinyalakan dan yang bisa berganti hanya akun yang
mendaftar sendiri dengan email dan kata sandi. Akun Google/GitHub datang dengan
`emailVerified: true`; halaman pengaturan menampilkan emailnya terkunci beserta
alasannya, bukan tombol yang akan ditolak server.

**Schema Better Auth di-generate, jangan diedit manual.** `src/db/auth-schema.ts` dibuat
oleh `npm run auth:generate`. Versi CLI harus cocok dengan versi `better-auth` di
`package.json` — CLI yang lebih tua menghasilkan schema tanpa kolom yang dibutuhkan
versi baru, dan gejalanya membingungkan (user terbuat, tapi login selalu gagal).

## Yang belum ada

**Undangan lewat email.** Tidak ada layanan email yang benar-benar gratis, jadi
undangan berupa tautan yang disalin ke clipboard lalu dikirim manual. Tautannya
terikat ke satu alamat email, sekali pakai, dan kedaluwarsa dalam 7 hari.
Kalau nanti mau otomatis, Resend punya free tier.

**Penyuntingan bersamaan yang halus.** Kalau rekan mengubah sesuatu tepat saat Anda
sedang menyeret kartu, tarik-ulang bisa menyentak posisi kartu tersebut. Perlu diff
per-entitas atau CRDT untuk benar-benar mulus.

**Presence per-orang.** Sekarang hanya jumlah penonton, belum menampilkan siapa saja
yang sedang membuka board.

**Pengingat tenggat yang berbunyi sendiri.** Tenggat sudah tersimpan dan terbaca di
kartu, tapi tidak ada yang mengetuk bahu siapa pun saat waktunya tiba: itu butuh Cron
Trigger (gratis di Workers) yang memindai kartu jatuh tempo, plus satu kolom penanda
supaya kabarnya tidak dikirim dua kali. Sekarang tenggat mengingatkan lewat mata —
ronanya berubah — bukan lewat perangkat.

**Lain-lain:** lampiran, undo, verifikasi email, hapus akun.
