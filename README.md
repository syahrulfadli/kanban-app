# Kanban

Papan kanban kolaboratif dengan drag & drop, berjalan penuh di free tier Cloudflare.

## Stack

| Layer | Teknologi |
|---|---|
| Frontend | React 19 + Vite + TypeScript |
| Styling | Tailwind CSS v4 |
| Drag & drop | Pragmatic drag-and-drop (Atlassian) |
| Backend | Hono di Cloudflare Workers |
| Realtime | Durable Objects + WebSocket (hibernation) |
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

npx wrangler d1 migrations apply kanban-db --local
npm run dev
```

Login email/password langsung berfungsi tanpa konfigurasi OAuth apa pun.

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
| `POST PATCH DELETE` | `/api/columns`, `/api/columns/:id` | member |
| `POST` | `/api/columns/:id/move` | member |
| `POST PATCH DELETE` | `/api/cards`, `/api/cards/:id` | member |
| `POST` | `/api/cards/:id/move` | member |

### Frontend

```
#/                      daftar workspace
#/w/:workspaceId        daftar board dalam workspace
#/w/:workspaceId/members anggota & undangan
#/board/:boardId        papan kanban
#/invite/:token         terima undangan
```

Router-nya hash-based tanpa library ([src/client/lib/route.ts](src/client/lib/route.ts)).
Kalau halaman bertambah banyak, ganti ke TanStack Router.

## Struktur folder

```
src/
├── client/       React: komponen, hooks, api client
├── worker/       Hono: routes, auth, ownership guard
├── db/           Drizzle schema (auth-schema.ts di-generate)
└── shared/       Tipe & helper posisi (dipakai kedua sisi)
migrations/       SQL migrasi D1
```

## Catatan desain

**Urutan kartu memakai fractional indexing.** Kolom `position` bertipe `real`, bukan
integer berurutan — memindahkan satu kartu cukup meng-update satu baris, bukan
menomori ulang seluruh kolom. Kalau dua tetangga jadi terlalu rapat (setelah ~50
sisipan di celah yang sama), server otomatis menomori ulang kolom tersebut.

**Posisi dihitung di server.** Klien hanya mengirim `{ columnId, index }`; server yang
menentukan angka `position`-nya.

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

**Lain-lain:** deskripsi & due date kartu, undo, verifikasi email.
