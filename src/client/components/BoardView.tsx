import { useEffect, useMemo, useRef, useState } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { ArchivePanel } from "./ArchivePanel";
import { BoardBackgroundPicker, PhotoCredit } from "./BoardBackgroundPicker";
import { BoardFilter } from "./BoardFilter";
import { CardModal } from "./CardModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { MoveDialog, type MoveSubject } from "./MoveDialog";
import { ColumnView } from "./ColumnView";
import { AddItemForm } from "./AddItemForm";
import { useBackdropInk } from "../hooks/useBackdropInk";
import { useBoard } from "../hooks/useBoard";
import { useBoardFilter } from "../hooks/useBoardFilter";
import { useCollapsedColumns } from "../hooks/useCollapsedColumns";
import { useT } from "../hooks/useLanguage";
import { playDropSound } from "../hooks/useSound";
import { useSession } from "../lib/auth-client";
import { navigate, paths } from "../lib/route";
import { backgroundPhoto, backgroundProps } from "../lib/background";
import { cn } from "../lib/cn";
import { cardFaces } from "../lib/people";
import type { ChannelStatus } from "../lib/realtime";
import type { UserBrief } from "../../shared/types";
import { Avatar } from "./Avatar";
import { AppHeader } from "./AppHeader";
import { BoardSkeleton } from "./Skeleton";

/**
 * Penanda kanal realtime, di ujung kanan kepala papan.
 *
 * Sendirian ia cuma keterangan: satu titik dan satu kata tentang koneksi.
 * Begitu ada orang lain di papan yang sama, keterangan itu punya isi yang
 * bisa ditanyakan — siapa — jadi ia berubah jadi tombol yang membuka
 * daftarnya. Tidak ada tombol tambahan yang muncul di kepala papan untuk itu:
 * yang menjawab "siapa yang di sini" adalah penanda yang sudah mengatakan
 * "ada yang di sini".
 */
function LiveIndicator({
  status,
  viewers,
  meId,
}: {
  status: ChannelStatus;
  viewers: UserBrief[];
  meId?: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const people = viewers.length;
  /* Sendirian, tidak ada daftar yang layak dibuka — "siapa saja di papan ini"
     yang jawabannya cuma diri sendiri bukan pertanyaan. */
  const shared = status === "live" && people > 1;

  const label =
    status === "live"
      ? people > 1
        ? t.boardView.peopleOnBoard(people)
        : t.boardView.connected
      : status === "connecting"
        ? t.boardView.connecting
        : t.boardView.disconnected;

  // Orang terakhir pergi selagi daftarnya terbuka: daftarnya ikut tutup,
  // bukan menggantung berisi satu nama.
  useEffect(() => {
    if (!shared) setOpen(false);
  }, [shared]);

  /* Pola yang sama dengan menu kolom dan menu profil: `pointerdown`, bukan
     `click`, supaya daftarnya sudah tertutup sebelum kliknya mendarat. */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const dot = (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "live" && "bg-ok",
        status === "connecting" && "animate-pulse bg-warn",
        status === "offline" && "bg-danger",
      )}
    />
  );

  if (!shared) {
    return (
      <span className="glass glass-liquid chip-glass shrink-0" title={label}>
        {dot}
        <span className="hidden sm:inline">{label}</span>
      </span>
    );
  }

  return (
  /* `flex`, bukan blok biasa: .chip itu inline-flex, dan sebuah tombol inline
     di dalam div blok ikut membentuk baris teks — tingginya jadi tinggi tombol
     ditambah sisa leading, dan sisa itu berubah mengikuti isi tombolnya. Yang
     disejajarkan `items-center` di kepala papan adalah pembungkus ini, jadi
     sisa yang berbeda-beda itu menggeser tombolnya sendiri. Dengan `flex`,
     pembungkusnya setinggi tombolnya persis. */
    <div ref={ref} className="relative flex shrink-0">
      {/* Di layar sempit kalimatnya tidak muat, dan sebuah titik sendirian
          tidak terbaca sebagai sesuatu yang bisa diketuk — jadi yang tersisa
          di sana angkanya, bukan tidak ada apa-apa. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={t.boardView.seeWhoSuffix(label)}
        title={label}
        className="glass glass-liquid chip-glass cursor-pointer transition-colors"
      >
        {dot}
        <span className="hidden sm:inline">{label}</span>
        <span className="tabular-nums sm:hidden">{people}</span>
      </button>

      {open && (
        /* Lahir di kepala papan, yang latarnya dibiarkan tembus — jadi lembar
           ini tidak bersarang di dalam pane ber-frost mana pun, dan kacanya
           boleh langsung mengaburkan papan di bawahnya. */
        <div className="sheet sheet-frost absolute top-full right-0 z-30 mt-2 w-56 rounded-2xl p-1.5">
          <p className="px-2.5 py-1.5 text-xs text-muted">{t.boardView.viewersHeading}</p>

          <ul className="flex flex-col">
            {viewers.map((viewer) => (
              <li key={viewer.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5">
                <Avatar person={viewer} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm">{viewer.name}</span>
                {viewer.id === meId && (
                  <span className="shrink-0 text-xs text-muted">{t.boardView.you}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Apa yang sedang ditanyakan dialog penegasan — sekaligus isi kalimatnya. */
type Pending =
  | { kind: "column"; id: string; title: string; cards: number }
  | { kind: "card"; id: string; title: string };

interface BoardProps {
  boardId: string;
  /** Kartu yang disebut alamat — dialog yang terbuka selalu berasal dari sini. */
  openCardId?: string;
}

export function BoardView({ boardId, openCardId }: BoardProps) {
  const t = useT();
  const { board, loading, error, refresh, actions, live } = useBoard(boardId);
  const { data: session } = useSession();

  /* Wadah gulir mendatar papan — dipakai untuk menggeser ke kolom baru begitu
     ia lahir, selalu paling kanan. */
  const mainRef = useRef<HTMLElement>(null);

  /* Tinta untuk teks yang duduk langsung di atas foto latar. Dipanggil dengan
     latar yang mungkin belum datang — sebelum itu ia tidak menuliskan apa pun,
     dan yang berlaku tetap tinta tema. */
  useBackdropInk(board?.background ?? { kind: "default" });

  /* Kolom mana yang disusutkan hanya urusan layar ini — simpanannya di
     peramban, bukan di papan. */
  const columnIds = useMemo(() => (board?.columns ?? []).map((c) => c.id), [board]);
  const { collapsed, toggle: toggleCollapse } = useCollapsedColumns(boardId, columnIds);

  /* Kartu yang terbuka tinggal di alamat, bukan di state: satu-satunya cara
     membuka dialog adalah pindah ke alamat kartunya. Harganya satu langkah
     riwayat per kartu — dan itu justru yang diinginkan, karena alamatnya jadi
     bisa disalin, dibagikan, dan ditutup dengan tombol kembali.

     Langkah yang dibuat sendiri itu dimakan kembali saat dialognya ditutup;
     kalau alamat kartunya datang dari luar — tautan yang dibagikan, notifikasi
     yang diketuk — tidak ada langkah yang boleh dimakan, jadi alamat papan
     menggantikannya di tempat. */
  const pushedCardId = useRef<string | null>(null);

  const openCard = (cardId: string) => {
    pushedCardId.current = cardId;
    navigate(paths.card(boardId, cardId));
  };

  const leaveCard = () => {
    const pushed = pushedCardId.current;
    pushedCardId.current = null;

    if (pushed && pushed === openCardId) history.back();
    else navigate(paths.board(boardId), { replace: true });
  };

  /* Tombol kembali juga menutup dialog — dan langkah yang tadi dibuat sudah
     habis terpakai, jadi catatannya ikut dibuang. */
  useEffect(() => {
    if (!openCardId) pushedCardId.current = null;
  }, [openCardId]);

  /* Satu dialog untuk seluruh papan, bukan satu per kartu: yang bisa ditanya
     hanya satu pada satu waktu. */
  const [pending, setPending] = useState<Pending | null>(null);

  /* Begitu juga pemilih papan tujuan — dan ia tinggal di sini, bukan di kolom
     atau di dialog kartu, karena yang berubah setelahnya adalah papan ini:
     yang dipindahkan lenyap dari layar. */
  const [moving, setMoving] = useState<MoveSubject | null>(null);

  /* Nama label dibuka sepapan sekaligus, bukan per kartu.

     Nama label baru berguna kalau bisa dibandingkan — "mana saja yang
     Mendesak" adalah pertanyaan tentang papan, bukan tentang satu kartu — dan
     satu kartu yang mekar sendirian di antara kartu-kartu berpotongan warna
     justru terbaca sebagai kartu yang sedang disorot, bukan sebagai nama yang
     sedang dibaca.

     Tinggal di sini, bukan di modul: papan yang ditinggalkan sebaiknya
     kembali ke keadaan istirahatnya, dan BoardView memang sudah dipasang
     ulang tiap ganti board. */
  const [labelsOpen, setLabelsOpen] = useState(false);

  /* Filter board: disimpan di peramban per papan (lihat useBoardFilter) —
     bertahan lewat reload, tapi lokal per perangkat, bukan disinkronkan ke
     kolaborator lain. */
  const { filter, setFilter } = useBoardFilter(boardId);

  /* Orang yang bisa disaring: siapa saja yang sudah tampil di wajah kartu
     manapun di board ini (diundang atau meninggalkan jejak), bukan seluruh
     anggota workspace — filter hanya berguna untuk orang yang benar-benar
     ada urusannya di sini, dan ini tidak butuh panggilan jaringan tambahan
     karena kartunya sudah termuat. Sekaligus jadi kamus nama untuk "dibuat
     oleh" di bawah — pembuat kartu selalu ikut jadi peserta (lihat
     routes/cards.ts), jadi tidak perlu ditarik dari tempat lain. */
  const peopleById = useMemo(() => {
    const map = new Map<string, UserBrief>();
    for (const column of board?.columns ?? []) {
      for (const card of column.cards) {
        for (const person of cardFaces(card.members, card.participants)) {
          if (!map.has(person.id)) map.set(person.id, person);
        }
      }
    }
    return map;
  }, [board]);

  const people = useMemo(() => [...peopleById.values()], [peopleById]);

  /* Siapa saja yang pernah membuat kartu di board ini — daftar lebih pendek
     dari `people`, dan itu memang yang diinginkan: "dibuat oleh" cuma
     berguna untuk orang yang benar-benar membuat sesuatu, bukan semua orang
     yang wajahnya pernah tampil di kartu. */
  const creators = useMemo(() => {
    const seen = new Map<string, UserBrief>();
    for (const column of board?.columns ?? []) {
      for (const card of column.cards) {
        const person = card.createdBy ? peopleById.get(card.createdBy) : undefined;
        if (person && !seen.has(person.id)) seen.set(person.id, person);
      }
    }
    return [...seen.values()];
  }, [board, peopleById]);

  const askDeleteCard = (cardId: string) => {
    const card = board?.columns.flatMap((col) => col.cards).find((c) => c.id === cardId);
    if (card) setPending({ kind: "card", id: card.id, title: card.title });
  };

  const askMoveCard = (cardId: string) => {
    const card = board?.columns.flatMap((col) => col.cards).find((c) => c.id === cardId);
    if (card) setMoving({ kind: "card", id: card.id, title: card.title });
  };

  const confirmMove = async (target: { boardId: string; columnId: string | null }) => {
    if (!moving) return;

    if (moving.kind === "column") await actions.transferColumn(moving.id, target.boardId);
    else await actions.transferCard(moving.id, target.columnId!);

    /* Dialognya baru ditutup setelah servernya menjawab — kalau ia menolak,
       kegagalannya harus terbaca di tempat pilihannya dibuat, bukan sebagai
       kalimat merah di kepala papan setelah dialognya lenyap. */
    setMoving(null);
  };

  const confirmDelete = () => {
    if (!pending) return;
    if (pending.kind === "card") {
      actions.deleteCard(pending.id);
      // Beda dari kartu yang sungguh 404 (lihat catatan `onNotFound` di
      // bawah): `deleteCard` optimistik dengan jendela urung (lihat
      // useBoard.ts), jadi GET /cards/:id masih menjawab 200 selama jendela
      // itu terbuka — dialognya tidak akan pernah tahu lewat 404-nya sendiri
      // kalau tidak ditutup di sini juga. Dua jalan berbeda untuk pertanyaan
      // yang sama, "kartunya masih ada?" — kalau salah satunya berubah,
      // periksa yang satunya lagi.
      if (pending.id === openCardId) leaveCard();
    } else {
      actions.deleteColumn(pending.id);
    }
    setPending(null);
  };

  /* Dulu dicari dari `board.columns` di sini, dan ditutup begitu tak
     ketemu — tapi kartu terarsip juga tak ada di sana padahal masih sah
     dibuka (lewat pencarian, lewat alamatnya). Keabsahannya sekarang
     ditentukan `CardModal` sendiri lewat `GET /cards/:id`: 404 sungguhan
     (dihapus, atau bukan miliknya) memanggil `onNotFound` di bawah, yang
     menutup dialog persis seperti dulu. */

  // Monitor DnD didaftarkan sekali; state terbaru dibaca lewat ref agar
  // listener tidak perlu dipasang ulang setiap render.
  const latest = useRef({ board, actions });
  latest.current = { board, actions };

  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const { board, actions } = latest.current;
        const target = location.current.dropTargets[0];
        if (!board || !target) return;

        /* Klik pendek begitu benda yang digenggam mendarat — jawaban atas
           gerakan tangan, bukan atas apa yang berubah di papan. Karena itu ia
           berbunyi juga saat kartunya dikembalikan ke tempatnya semula, dan
           tidak berbunyi sama sekali saat seretnya dibatalkan di luar papan:
           yang dijawab pertanyaan "sudah lepas?", bukan "jadi pindah?" —
           dan diam setelah melepas kartu terbaca sebagai aplikasi yang tidak
           menangkap gerakannya. */
        playDropSound();

        if (source.data.type === "card") {
          const cardId = source.data.cardId as string;
          const fromColumnId = source.data.columnId as string;

          const destColumnId =
            target.data.type === "card" || target.data.type === "column"
              ? (target.data.columnId as string)
              : null;
          if (!destColumnId) return;

          const rest = (board.columns.find((c) => c.id === destColumnId)?.cards ?? []).filter(
            (c) => c.id !== cardId,
          );

          let index: number;
          if (target.data.type === "card") {
            const at = rest.findIndex((c) => c.id === target.data.cardId);
            if (at === -1) return;
            index = extractClosestEdge(target.data) === "bottom" ? at + 1 : at;
          } else {
            index = rest.length;
          }

          const currentIndex = board.columns
            .find((c) => c.id === fromColumnId)
            ?.cards.findIndex((c) => c.id === cardId);
          if (destColumnId === fromColumnId && index === currentIndex) return;

          void actions.moveCard(cardId, destColumnId, index);
          return;
        }

        if (source.data.type === "column" && target.data.type === "column") {
          const columnId = source.data.columnId as string;
          const rest = board.columns.filter((c) => c.id !== columnId);

          const at = rest.findIndex((c) => c.id === target.data.columnId);
          if (at === -1) return;

          const index = extractClosestEdge(target.data) === "right" ? at + 1 : at;
          const currentIndex = board.columns.findIndex((c) => c.id === columnId);
          if (index === currentIndex) return;

          void actions.moveColumn(columnId, index);
        }
      },
    });
  }, []);

  // Kerangkanya membawa breadcrumb-nya sendiri, jadi kepala halaman tidak
  // muncul belakangan dan mendorong papan ke bawah.
  if (loading) return <BoardSkeleton />;

  if (!board) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="glass glass-frost rounded-2xl p-6 text-center">
          <p className="text-sm text-danger">{error ?? t.boardView.notFound}</p>
          <button
            onClick={() => navigate(paths.workspaces)}
            className="btn btn-glass mt-4"
          >
            {t.boardView.backToWorkspaces}
          </button>
        </div>
      </div>
    );
  }

  const photo = backgroundPhoto(board.background);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Lembar latar papan. Berdiri di luar aliran isi dan di belakangnya,
          jadi kaca di atasnya punya sesuatu untuk dikaburkan dan papan yang
          digeser mendatar tidak menyeretnya ikut bergerak. */}
      <div aria-hidden className="board-bg" {...backgroundProps(board.background)} />

      {/* Tinta kepala papan mengikuti bagian ATAS foto. Kelasnya selalu
          terpasang; yang menentukan ada tidaknya efeknya adalah atribut di
          <html>, yang cuma ada selagi papan ini berlatar foto. */}
      <AppHeader className="on-photo on-photo-top">
        <span className="text-faint">/</span>
        <button
          onClick={() => navigate(paths.workspace(board.workspaceId))}
          className="text-sm text-muted hover:text-ink"
        >
          {t.boardView.boardCrumb}
        </button>
        <span className="text-faint">/</span>
        <h1 className="min-w-0 truncate text-sm font-medium">{board.title}</h1>

        {/* Berlabuh di ujung kanan kepala papan, bukan menempel di belakang
            judul: tempatnya jadi tetap — tidak bergeser mengikuti panjang nama
            papan — dan sudut itu memang sudut keterangan, bukan sudut isi. */}
        {/* Ujung kanan kepala papan berdiri di atas bagian foto yang lain
            daripada breadcrumb di kiri, jadi ia menanyakan tintanya sendiri —
            satu foto boleh gelap di satu sisi dan terang di sisi lain. */}
        <span className="on-photo-top-end ml-auto flex min-w-0 items-center gap-2">
          {error && <span className="min-w-0 truncate text-xs text-danger">{error}</span>}
          <BoardFilter
            labels={board.labels}
            people={people}
            creators={creators}
            filter={filter}
            onChange={setFilter}
          />
          <ArchivePanel
            boardId={boardId}
            count={board.archivedCount}
            onChanged={() => void refresh()}
          />
          <BoardBackgroundPicker
            boardId={boardId}
            background={board.background}
            onChanged={() => void refresh()}
          />
          <LiveIndicator
            status={live.status}
            viewers={live.viewers}
            meId={session?.user.id}
          />
        </span>
      </AppHeader>

      {/* items-start: kolom setinggi isinya. Merentangkannya dulu punya alasan —
          cairan di dasar gelas harus berdiri di dasar papan — dan alasan itu
          sudah hilang bersama efeknya. `max-h-full` di kolom yang menahan
          kolom panjang supaya menggulir di dalam dirinya sendiri. */}
      <main ref={mainRef} className="flex flex-1 items-start gap-4 overflow-x-auto px-5 pt-1 pb-24">
        {board.columns.map((column, i) => (
          <ColumnView
            key={column.id}
            column={column}
            prevColumnId={board.columns[i - 1]?.id ?? null}
            nextColumnId={board.columns[i + 1]?.id ?? null}
            collapsed={collapsed.has(column.id)}
            onToggleCollapse={() => toggleCollapse(column.id)}
            onAddCard={(title) => actions.addCard(column.id, title)}
            onRenameColumn={(title) => actions.renameColumn(column.id, title)}
            onRecolorColumn={(color) => actions.recolorColumn(column.id, color)}
            onWatchColumn={(watching) => void actions.watchColumn(column.id, watching)}
            onMoveColumn={() =>
              setMoving({
                kind: "column",
                id: column.id,
                title: column.title,
                cards: column.cards.length,
              })
            }
            onDeleteColumn={() =>
              setPending({
                kind: "column",
                id: column.id,
                title: column.title,
                cards: column.cards.length,
              })
            }
            onOpenCard={openCard}
            onDeleteCard={askDeleteCard}
            labelsOpen={labelsOpen}
            onToggleLabels={() => setLabelsOpen((v) => !v)}
            filter={filter}
          />
        ))}

        {/* Gelas kosong: hanya garis, menunggu diisi. */}
        <div className="glass-column bg-white/50 dark:bg-zinc-700/70 h-fit w-72 shrink-0 border-2 border-dashed border-zinc-500/50 p-2">
          <AddItemForm
            placeholder={t.boardView.newColumnPlaceholder}
            submitLabel={t.boardView.newColumnSubmit}
            onSubmit={async (title) => {
              await actions.addColumn(title);
              /* Kolom baru selalu lahir paling kanan — gulir ke sana, sama
                 seperti kartu baru menggulir kolomnya sendiri ke bawah. */
              requestAnimationFrame(() => {
                const el = mainRef.current;
                if (el) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
              });
            }}
          />
        </div>
      </main>

      {/* Kredit fotografer. Di sudut kiri bawah, sejajar kapsul navigasi yang
          mengambang di tengah — tempat yang tidak ditempati apa pun, dan
          cukup jauh dari kolom terakhir supaya tidak terbaca sebagai bagian
          dari papan. `pointer-events-none` di pembungkusnya: yang boleh
          diketuk cuma tautannya sendiri, bukan pita kosong sepanjang layar. */}
      {photo && (
        <div className="on-photo-bottom-start pointer-events-none fixed bottom-1 md:bottom-6 right-1/2 translate-x-1/2 md:translate-0 md:left-5 z-30 md:max-w-[45vw]">
          <PhotoCredit image={photo} />
        </div>
      )}

      {pending && (
        <ConfirmDialog
          title={pending.kind === "card" ? t.boardView.deleteCardTitle : t.boardView.deleteColumnTitle}
          body={
            pending.kind === "card" ? (
              t.boardView.deleteCardBody(pending.title)
            ) : (
              <>
                “{pending.title}” akan dihapus
                {pending.cards > 0 && <> {t.boardView.deleteColumnBodyWithCards(pending.cards)}</>}.{" "}
                {t.boardView.deleteColumnBodySuffix}
              </>
            )
          }
          confirmLabel={pending.kind === "card" ? t.boardView.deleteCardConfirm : t.boardView.deleteColumnConfirm}
          onConfirm={confirmDelete}
          onCancel={() => setPending(null)}
        />
      )}

      {openCardId && session && (
        <CardModal
          key={openCardId}
          cardId={openCardId}
          boardLabels={board.labels}
          shareUrl={`${location.origin}${location.pathname}${paths.card(boardId, openCardId)}`}
          currentUser={{ ...session.user, image: session.user.image ?? null }}
          networkStatus={live.status}
          onClose={leaveCard}
          onMove={() => askMoveCard(openCardId)}
          onBoardChange={() => void refresh()}
          onDelete={() => askDeleteCard(openCardId)}
          onNotFound={leaveCard}
        />
      )}

      {moving && (
        <MoveDialog
          subject={moving}
          boardId={boardId}
          onCancel={() => setMoving(null)}
          onMove={confirmMove}
        />
      )}
    </div>
  );
}
