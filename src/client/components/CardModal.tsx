import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CardAttachments } from "./CardAttachments";
import { CardChecklist } from "./CardChecklist";
import { CardDue } from "./CardDue";
import { CardFollowup } from "./CardFollowup";
import { CardLabels } from "./CardLabels";
import { CardPeople } from "./CardPeople";
import { Markdown } from "./Markdown";
import { MarkdownField } from "./MarkdownField";
import { EyeIcon } from "./WatchToggle";
import { AvatarStack } from "./Avatar";
import { CardDetailSkeleton, SkeletonLine } from "./Skeleton";
import { PencilIcon, TrashIcon } from "./icons";
import { useDismiss } from "../hooks/useDismiss";
import { useStoredFlag } from "../hooks/useStoredFlag";
import { useOpenProfile } from "./ProfilePopover";
import { api, ApiError } from "../lib/api";
import { optimisticActivity, type ActivityNote } from "../lib/activity";
import { prepareAttachment } from "../lib/attachment";
import { cn } from "../lib/cn";
import { formatDateTime, formatRelative } from "../lib/format";
import type { ChannelStatus } from "../lib/realtime";
import type {
  CardAttachmentDetail,
  CardCommentDetail,
  CardDetail,
  ChecklistItem,
  Label,
  LabelColor,
  UserBrief,
} from "../../shared/types";

/* Ukuran menu kartu — tidak bergantung pada props/state, jadi tinggal di luar
   komponen alih-alih dibuat ulang di setiap render. */
const MENU_MARGIN = 16;
const MENU_WIDTH = 208; // w-52

/** Kotak arsip — dipakai baik untuk tombol maupun chip keterangan di header. */
function ArchiveBoxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" />
      <path d="M10 12h4" />
    </svg>
  );
}

/** Kotak terbuka dengan anak panah keluar — kebalikan arsip, bukan kotak baru. */
function RestoreBoxIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 13v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6" />
      <path d="M12 15V3m0 0-3.5 3.5M12 3l3.5 3.5" />
    </svg>
  );
}

/** Dua mata rantai — menyalin tautan. */
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 13.5a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
      <path d="M14 10.5a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" />
    </svg>
  );
}

/** Tanda centang — konfirmasi tautan sudah tersalin. */
function CheckIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </svg>
  );
}

/** Anak panah yang keluar dari sebuah bidang — pindah ke papan lain. */
function MoveOutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
      <path d="m16 8 4 4-4 4M20 12H10" />
    </svg>
  );
}

/** Tong sampah — hapus kartu, tidak seperti arsip: tidak bisa dipulihkan. */
/** Tiga titik mendatar — menu kartu, bentuknya sama persis dengan menu kolom. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

/**
 * Satu butir di menu kartu. Bentuknya sengaja sama persis dengan butir menu
 * kolom dan menu profil — ikonnya diterima utuh, bukan sebagai isi sebuah
 * `<svg>` yang sudah ditentukan di sini, karena EyeIcon punya dua rupa dan
 * ketebalan garisnya sendiri.
 */
function MenuItem({
  icon,
  label,
  onClick,
  danger = false,
  disabled = false,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** Butir yang tetap digambar tapi belum bisa dipakai sekarang. Dipadamkan,
      bukan disembunyikan: menu yang butirnya berganti-ganti jumlah membuat
      orang mengira fiturnya hilang, padahal cuma sedang tidak berlaku. */
  disabled?: boolean;
  /** Sebaris alasan di bawah label — cuma terbaca selagi butirnya padam.
      Butir mati tanpa keterangan hanya memberi tahu bahwa sesuatu tidak
      bisa ditekan, tidak memberi tahu apa yang harus dilakukan dulu. */
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm transition-colors",
        disabled
          ? "cursor-not-allowed text-muted"
          : cn(
              "cursor-pointer text-ink-soft",
              danger
                ? "hover:bg-danger/10 hover:text-danger"
                : "hover:bg-accent-soft hover:text-accent-ink",
            ),
      )}
    >
      {icon}
      <span className="min-w-0">
        {label}
        {/* `text-muted`, bukan `text-faint`: sebelas piksel dengan kontras
            3,8:1 di tema gelap terbaca sebagai noda, bukan kalimat — dan
            alasan sebuah butir dipadamkan justru yang paling perlu terbaca
            di menu ini. */}
        {disabled && hint && (
          <span className="mt-0.5 block text-[0.6875rem] leading-tight text-muted">{hint}</span>
        )}
      </span>
    </button>
  );
}

interface Props {
  cardId: string;
  /** Palet label milik board — dipakai pemilih label di dalam dialog. */
  boardLabels: Label[];
  currentUser: UserBrief;
  /** Alamat kartu ini — yang sama dengan yang sedang dipakai bilah alamat. */
  shareUrl: string;
  /** Status koneksi realtime board — dipakai deskripsi & followup untuk
      memadamkan tombol Simpan/Kirim selagi tidak ada jalan ke server. */
  networkStatus: ChannelStatus;
  onClose: () => void;
  /** Buka pemilih papan tujuan. Perpindahannya sendiri milik papan, bukan
      dialog ini: kartunya akan hilang dari papan yang sedang dibuka. */
  onMove: () => void;
  /** Muat ulang board, supaya muka kartu di papan ikut berubah. */
  onBoardChange: () => void;
  /** Minta penegasan hapus permanen — dialognya sendiri milik papan, sama
      seperti pemilih papan tujuan; kartu ini hanya memintanya. */
  onDelete: () => void;
  /** Kartunya sungguh tak ada lagi (dihapus, atau bukan milik siapa yang
      membuka) — beda dari arsip, yang masih bisa ditarik dan dibuka biasa.
      Dialognya tidak tahu cara menutup dirinya sendiri lewat alamat; itu
      urusan pemanggil. */
  onNotFound: () => void;
}

/** Baris jejak waktu: "Dibuat oleh Rina · 2 Sep 2026, 17.40". */
function Trace({ verb, who, at }: { verb: string; who: UserBrief | null; at: Date | string }) {
  return (
    <p className="text-[0.6875rem] text-faint">
      {verb}
      {who && <> oleh <span className="font-medium text-muted">{who.name}</span></>}
      {" · "}
      <span title={formatDateTime(at)}>{formatRelative(at)}</span>
    </p>
  );
}

export function CardModal({
  cardId,
  boardLabels,
  currentUser,
  shareUrl,
  networkStatus,
  onClose,
  onMove,
  onBoardChange,
  onDelete,
  onNotFound,
}: Props) {
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const openProfile = useOpenProfile();

  /* Menu kartu: Awasi, salin tautan, pindah, arsip, dan hapus — dikumpulkan
     jadi satu menu tiga titik, sama seperti menu kolom. Dipasang di <body>
     lewat portal supaya tidak terpotong `overflow-hidden` dialognya sendiri. */
  const [menuOpen, setMenuOpen] = useState(false);
  const menuAnchorRef = useRef<HTMLDivElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  useDismiss(menuOpen, () => setMenuOpen(false), [menuAnchorRef, menuPanelRef]);

  const [menuAnchor, setMenuAnchor] = useState<
    { mode: "end"; right: number; top: number } | { mode: "center"; top: number } | null
  >(null);
  useLayoutEffect(() => {
    if (!menuOpen) return;

    const place = () => {
      const rect = menuAnchorRef.current?.getBoundingClientRect();
      if (!rect) return;

      const top = rect.bottom + 8;
      const panelWidth = Math.min(MENU_WIDTH, window.innerWidth - MENU_MARGIN * 2);
      const leftIfEndAligned = rect.right - panelWidth;

      setMenuAnchor(
        leftIfEndAligned >= MENU_MARGIN
          ? { mode: "end", right: window.innerWidth - rect.right, top }
          : { mode: "center", top },
      );
    };

    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [menuOpen]);

  /* Panel followup boleh disembunyikan, dan pilihannya diingat peramban —
     bukan server. Yang diatur di sini cara satu orang membaca kartu, dan
     kartu yang sama harus tetap tampil utuh bagi rekannya. */
  const [followupHidden, toggleFollowup] = useStoredFlag("card:followup-hidden", false);

  /* Menyalin alamat kartu. Kartunya sudah punya alamat sendiri sejak dibuka,
     jadi tombol ini cuma memindahkannya ke clipboard — tidak ada tautan
     khusus yang dibuat, yang dibagikan persis yang terbaca di bilah alamat. */
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
    } catch {
      setError("Tautan gagal disalin — salin saja dari bilah alamat");
    }
  };

  useEffect(() => {
    if (!linkCopied) return;
    const t = setTimeout(() => {
      setLinkCopied(false);
      // Menu ditutup bersamaan dengan tanda centangnya pudar, supaya orang
      // sempat melihat konfirmasinya sebelum menunya lenyap.
      setMenuOpen(false);
    }, 1800);
    return () => clearTimeout(t);
  }, [linkCopied]);

  /* Dibaca lewat ref, bukan kebergantungan `load` langsung: `onNotFound`
     lahir baru setiap kali BoardView digambar ulang, dan menaruhnya di
     larik kebergantungan berarti `load` — dan efek yang memanggilnya —
     ikut dipasang ulang di setiap render, bukan cuma sekali per kartu. */
  const onNotFoundRef = useRef(onNotFound);
  onNotFoundRef.current = onNotFound;

  const load = useCallback(async () => {
    try {
      setDetail(await api.getCard(cardId));
      setError(null);
    } catch (e) {
      // 404 bukan kegagalan biasa: kartunya sungguh tak ada lagi (dihapus,
      // atau bukan milik siapa yang membuka), dan dialognya menyerahkan
      // penutupan ke pemanggil alih-alih menampilkan pesan galat di sini.
      if (e instanceof ApiError && e.status === 404) {
        onNotFoundRef.current();
        return;
      }
      setError(e instanceof Error ? e.message : "Gagal memuat kartu");
    }
  }, [cardId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Fokus pindah ke dialog begitu terbuka: Escape harus bekerja tanpa
  // pengguna perlu mengklik apa pun dulu.
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  /**
   * Awasi kartu ini, atau berhenti mengawasinya.
   *
   * Sengaja tidak lewat `run`: Awasi bukan suntingan kartu. Ia tidak mengubah
   * "diubah oleh", tidak menambahkan siapa pun ke deretan avatar, dan tidak
   * meninggalkan apa-apa di lini masa — yang berubah hanya kabar apa yang
   * sampai ke satu orang.
   */
  const setWatching = async (watching: boolean) => {
    setDetail((prev) => (prev ? { ...prev, watching } : prev));

    try {
      await api.watchCard(cardId, watching);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Perubahan gagal disimpan");
      await load();
    } finally {
      // Muka kartu di papan punya matanya sendiri untuk digambar ulang.
      onBoardChange();
    }
  };

  /**
   * Terapkan perubahan di layar dulu, lalu kirim ke server. Kalau server
   * menolak, kartunya ditarik ulang — persis pola optimistik di useBoard,
   * hanya sebatas satu kartu.
   *
   * Setiap aksi juga menandai diri sendiri sebagai peserta dan penyunting
   * terakhir, sama seperti yang dilakukan server, supaya deretan avatar dan
   * baris "diubah oleh" tidak menunggu perjalanan pulang-pergi.
   *
   * `note` adalah bayangan lokal dari baris lini masa yang sedang ditulis
   * server — bentuknya sengaja dijaga sama, dan versi aslinya menggantikannya
   * pada pembacaan berikutnya.
   */
  const run = useCallback(
    async (
      next: (card: CardDetail) => CardDetail,
      commit: () => Promise<unknown>,
      note?: ActivityNote | ActivityNote[],
    ) => {
      setDetail((prev) => {
        if (!prev) return prev;
        const updated = next(prev);
        const notes = note ? [note].flat() : [];
        return {
          ...updated,
          activities: [
            ...updated.activities,
            ...notes.map((n) => optimisticActivity(cardId, currentUser, n)),
          ],
          updatedAt: new Date(),
          updatedBy: currentUser.id,
          updatedByUser: currentUser,
          participants: updated.participants.some((p) => p.id === currentUser.id)
            ? updated.participants
            : [...updated.participants, currentUser],
        };
      });

      try {
        await commit();
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Perubahan gagal disimpan");
        await load();
      } finally {
        onBoardChange();
      }
    },
    [cardId, currentUser, load, onBoardChange],
  );

  /**
   * Arsipkan atau pulihkan kartu ini — lewat `run`, sama seperti suntingan
   * lain. Dialognya sengaja **tidak** menutup diri sendiri setelah
   * mengarsipkan: kartu terarsip tetap bisa dibuka (lewat pencarian, lewat
   * alamatnya) dan harus menampilkan keadaan arsipnya, bukan menghilang —
   * beda dari hapus permanen, yang memang mengakhiri kartunya.
   * `onBoardChange` tetap dipanggil supaya muka kartu di papan ikut
   * digambar ulang (hilang saat diarsipkan, muncul lagi saat dipulihkan).
   */
  const setArchived = (archived: boolean) =>
    run(
      (card) => ({ ...card, archivedAt: archived ? new Date() : null }),
      () => (archived ? api.archiveCard(cardId) : api.restoreCard(cardId)),
      { kind: archived ? "card_archived" : "card_restored" },
    );

  /** Penambahan menunggu server dulu: id butir dan followup lahir di sana. */
  const insert = useCallback(
    async <T,>(
      commit: () => Promise<T>,
      apply: (card: CardDetail, created: T) => CardDetail,
      note?: (created: T) => ActivityNote,
    ) => {
      try {
        const created = await commit();
        setDetail((prev) => {
          if (!prev) return prev;
          const updated = apply(prev, created);
          return note
            ? {
                ...updated,
                activities: [
                  ...updated.activities,
                  optimisticActivity(cardId, currentUser, note(created)),
                ],
              }
            : updated;
        });
        setError(null);
      } catch (e) {
        // Beda dengan `run`: belum ada apa pun yang diterapkan secara
        // optimistik di atas, jadi tidak ada yang perlu dipulihkan lewat
        // `load()` — memanggilnya di sini hanya akan langsung menghapus
        // pesan error ini lewat `setError(null)`-nya sendiri begitu berhasil.
        setError(e instanceof Error ? e.message : "Perubahan gagal disimpan");
      } finally {
        onBoardChange();
      }
    },
    [cardId, currentUser, onBoardChange],
  );

  const commitTitle = (value: string) => {
    const title = value.trim();
    setEditingTitle(false);
    if (!detail || !title || title === detail.title) return;
    void run((card) => ({ ...card, title }), () => api.updateCard(cardId, { title }), {
      kind: "title_changed",
      detail: { from: detail.title, to: title },
    });
  };

  const commitDescription = (value: string) => {
    setEditingDescription(false);
    if (!detail) return;

    const description = value || null;
    if (description === (detail.description || null)) return;
    void run(
      (card) => ({ ...card, description }),
      () => api.updateCard(cardId, { description }),
      { kind: "description_changed", detail: { to: description } },
    );
  };

  const toggleLabel = (label: Label, attach: boolean) =>
    void run(
      (card) => ({
        ...card,
        labels: attach
          ? [...card.labels, label]
          : card.labels.filter((l) => l.id !== label.id),
      }),
      () => (attach ? api.attachLabel(cardId, label.id) : api.detachLabel(cardId, label.id)),
      {
        kind: attach ? "label_added" : "label_removed",
        detail: { text: label.name, color: label.color },
      },
    );

  /* Label yang baru dibuat langsung dipasang ke kartu ini — orang menekan
     "buat label" saat sedang memberi label pada kartu, bukan saat merapikan
     palet board. */
  const createLabel = (name: string, color: LabelColor) =>
    void insert(
      async () => {
        const label = await api.createLabel(detail!.boardId, name, color);
        await api.attachLabel(cardId, label.id);
        return label;
      },
      (card, label) => ({ ...card, labels: [...card.labels, label] }),
      (label) => ({ kind: "label_added", detail: { text: label.name, color: label.color } }),
    );

  const renameLabel = (id: string, patch: { name?: string; color?: LabelColor }) =>
    void run(
      (card) => ({
        ...card,
        labels: card.labels.map((l) => (l.id === id ? { ...l, ...patch } : l)),
      }),
      () => api.updateLabel(id, patch),
    );

  const deleteLabel = (id: string) =>
    void run(
      (card) => ({ ...card, labels: card.labels.filter((l) => l.id !== id) }),
      () => api.deleteLabel(id),
    );

  const patchItem = (id: string, patch: Partial<ChecklistItem>) => (card: CardDetail) => ({
    ...card,
    checklistItems: card.checklistItems.map((i) => (i.id === id ? { ...i, ...patch } : i)),
  });

  const toggleItem = (item: ChecklistItem, done: boolean) =>
    void run(patchItem(item.id, { done }), () => api.updateChecklistItem(item.id, { done }), {
      kind: done ? "checklist_checked" : "checklist_unchecked",
      detail: { text: item.text },
    });

  const renameItem = (item: ChecklistItem, text: string) =>
    void run(patchItem(item.id, { text }), () => api.updateChecklistItem(item.id, { text }), {
      kind: "checklist_renamed",
      detail: { from: item.text, to: text },
    });

  const deleteItem = (item: ChecklistItem) =>
    void run(
      (card) => ({
        ...card,
        checklistItems: card.checklistItems.filter((i) => i.id !== item.id),
      }),
      () => api.deleteChecklistItem(item.id),
      { kind: "checklist_removed", detail: { text: item.text } },
    );

  const addItem = (text: string) =>
    void insert(
      () => api.addChecklistItem(cardId, text),
      (card, item) => ({ ...card, checklistItems: [...card.checklistItems, item] }),
      (item) => ({ kind: "checklist_added", detail: { text: item.text } }),
    );

  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const addAttachment = (file: File) => {
    setUploadingAttachment(true);
    void insert(
      async () => {
        const upload = await prepareAttachment(file);
        return api.uploadAttachment(cardId, upload);
      },
      (card, attachment) => ({ ...card, attachments: [...card.attachments, attachment] }),
      (attachment) => ({ kind: "attachment_added", detail: { text: attachment.filename } }),
    ).finally(() => setUploadingAttachment(false));
  };

  const deleteAttachment = (attachment: CardAttachmentDetail) =>
    void run(
      (card) => ({
        ...card,
        attachments: card.attachments.filter((a) => a.id !== attachment.id),
      }),
      () => api.deleteAttachment(attachment.id),
      { kind: "attachment_removed", detail: { text: attachment.filename } },
    );

  /* Mengundang seseorang bukan menyunting kartu, tapi tetap lewat `run`:
     berbeda dengan Awasi, undangan mengubah kartunya untuk semua orang —
     wajahnya muncul di muka kartu dan namanya masuk lini masa. */
  const addPerson = (person: UserBrief) =>
    void run(
      (card) => ({ ...card, members: [...card.members, person] }),
      () => api.addCardMember(cardId, person.id),
      { kind: "member_added", detail: { text: person.name } },
    );

  const removePerson = (person: UserBrief) =>
    void run(
      (card) => ({ ...card, members: card.members.filter((m) => m.id !== person.id) }),
      () => api.removeCardMember(cardId, person.id),
      { kind: "member_removed", detail: { text: person.name } },
    );

  const setDue = (dueAt: string | null) => {
    if (!detail) return;

    const before = detail.dueAt ? new Date(detail.dueAt) : null;
    const after = dueAt ? new Date(dueAt) : null;
    if ((before?.getTime() ?? null) === (after?.getTime() ?? null)) return;

    void run(
      /* Tanda selesai ikut gugur di sini, meniru aturan server (lihat PATCH
         /cards/:id): tanggal baru adalah tagihan baru, dan tanggal yang
         dihapus tidak menyisakan apa pun untuk diselesaikan. Kalau tidak
         ditiru, kartunya sesaat tampil hijau dengan tenggat yang sudah
         berpindah — sampai jawaban server datang dan meralatnya sendiri. */
      (card) => ({ ...card, dueAt: after, dueDoneAt: null }),
      () => api.updateCard(cardId, { dueAt }),
      after
        ? {
            kind: "due_changed",
            detail: { from: before?.toISOString() ?? null, to: after.toISOString() },
          }
        : { kind: "due_cleared" },
    );
  };

  /**
   * Menandai tenggat selesai — atau membukanya lagi. Tanggalnya tidak
   * disentuh: yang berubah cuma apakah ia masih menagih sesuatu, dan itulah
   * yang membuat kartu berhenti terhitung terlambat.
   */
  const setDueDone = (done: boolean) => {
    if (!detail?.dueAt) return;

    void run(
      (card) => ({ ...card, dueDoneAt: done ? new Date() : null }),
      () => api.updateCard(cardId, { dueDone: done }),
      { kind: done ? "due_done" : "due_undone" },
    );
  };

  const addComment = (body: string) =>
    void insert(
      () => api.addComment(cardId, body),
      (card, comment) => ({
        ...card,
        comments: [...card.comments, comment],
        participants: card.participants.some((p) => p.id === currentUser.id)
          ? card.participants
          : [...card.participants, currentUser],
      }),
    );

  const editComment = (comment: CardCommentDetail, body: string) =>
    void run(
      (card) => ({
        ...card,
        comments: card.comments.map((c) =>
          c.id === comment.id ? { ...c, body, updatedAt: new Date() } : c,
        ),
      }),
      () => api.updateComment(comment.id, body),
    );

  const deleteComment = (comment: CardCommentDetail) =>
    void run(
      (card) => ({ ...card, comments: card.comments.filter((c) => c.id !== comment.id) }),
      () => api.deleteComment(comment.id),
      { kind: "comment_deleted" },
    );

  return (
    /* Pembungkus sengaja tidak menggulir: kalau ia menggulir, kelam di
       dalamnya ikut tergeser dan menyisakan pita terang di tepi. Yang
       menggulir adalah isi dialognya sendiri. */
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden p-4 sm:p-6">
      {/* Elemen tersendiri, bukan latar pembungkusnya — pembungkus tidak boleh
          menangkap klik di luar kartu untuk dirinya sendiri. */}
      <div className="scrim scrim-dim" onClick={onClose} aria-hidden />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={detail ? `Kartu ${detail.title}` : "Memuat kartu"}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        /* Tingginya dipatok penuh, bukan mengikuti isi. Dialog yang tumbuh
           setinggi isinya berpindah-pindah ukuran tiap kali kartu lain dibuka —
           dan yang paling sering dibuka justru kartu yang isinya sedikit, jadi
           deskripsi dan lini masa berdesakan di jendela sempit padahal layarnya
           kosong. Dengan tinggi tetap, tiap kartu terbuka di bingkai yang sama
           dan ruang bacanya selalu selebar-lebarnya yang ada. */
        className="card-plain relative flex h-full w-full max-w-6xl flex-col overflow-hidden outline-none"
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <span className="chip">
                {detail ? detail.columnTitle : <SkeletonLine className="h-4 w-14" />}
              </span>

              {/* Cuma muncul untuk kartu terarsip — keterangan kapan, bukan
                  cuma bahwa itu terjadi, karena "diarsipkan" tanpa waktu
                  memaksa orang menebak sudah berapa lama kartu ini disimpan. */}
              {detail?.archivedAt && (
                <span
                  className="chip text-muted"
                  title={formatDateTime(detail.archivedAt)}
                >
                  <ArchiveBoxIcon className="size-3" />
                  Diarsipkan · {formatRelative(detail.archivedAt)}
                </span>
              )}
            </div>

            {detail && editingTitle ? (
              <textarea
                autoFocus
                rows={2}
                defaultValue={detail.title}
                onBlur={(e) => commitTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    commitTitle(e.currentTarget.value);
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditingTitle(false);
                  }
                }}
                className="field resize-none text-base font-semibold"
              />
            ) : (
              <h2
                onClick={() => detail && setEditingTitle(true)}
                title="Klik untuk mengubah judul"
                className="cursor-text text-base leading-snug font-semibold wrap-break-word whitespace-pre-wrap"
              >
                {detail?.title ?? <SkeletonLine className="my-2 w-56" />}
              </h2>
            )}
          </div>

          {/* Sakelar panel followup. Di kepala kartu bersama kenop lain yang
              bukan suntingan: yang diubahnya lebar bacaan, bukan isi kartu. */}
          <button
            type="button"
            onClick={toggleFollowup}
            aria-pressed={!followupHidden}
            aria-label={followupHidden ? "Tampilkan panel followup" : "Sembunyikan panel followup"}
            title={followupHidden ? "Tampilkan followup" : "Sembunyikan followup"}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-(--card-plate-hi) hover:text-ink"
          >
            <svg viewBox="0 -960 960 960" className="size-5" fill="currentColor" aria-hidden>
              {/* Anak panahnya menunjuk ke arah panelnya akan bergerak: ke
                  kiri saat masih tersembunyi (menarik panel masuk), ke kanan
                  saat terbuka (mendorongnya keluar). */}
              {followupHidden ? (
                <path d="M461.92-379.92v-200.16q0-12.46-11.04-17.07-11.03-4.62-19.88 4.23l-87.61 87.61q-10.85 10.85-10.85 25.31 0 14.46 10.85 25.31L431-367.08q8.85 8.85 19.88 4.23 11.04-4.61 11.04-17.07Z" />
              ) : (
                <path d="M318.08-379.92q0 12.46 11.04 17.07 11.04 4.62 19.88-4.23l87.62-87.61q10.84-10.85 10.84-25.31 0-14.46-10.84-25.31L349-592.92q-8.84-8.85-19.88-4.23-11.04 4.61-11.04 17.07v200.16Z" />
              )}
              <path d="M212.31-140q-29.92 0-51.12-21.19Q140-182.39 140-212.31v-535.38q0-29.92 21.19-51.12Q182.39-820 212.31-820h535.38q29.92 0 51.12 21.19Q820-777.61 820-747.69v535.38q0 29.92-21.19 51.12Q777.61-140 747.69-140H212.31ZM640-200h120v-547.69q0-4.62-3.85-8.46-3.84-3.85-8.46-3.85H640v560Zm-60 0v-560H212.31q-4.62 0-8.46 3.85-3.85 3.84-3.85 8.46v535.38q0 4.62 3.85 8.46 3.84 3.85 8.46 3.85H580Z" />
            </svg>
          </button>

          {/* Awasi, salin tautan, pindah, arsip, dan hapus — semuanya jarang
              ditekan dibanding menyunting isi kartu, dan dikumpulkan jadi satu
              menu tiga titik supaya kepala kartu tidak berderet kenop yang
              sebagian besar menganggur. Pola dan penempatannya sama persis
              dengan menu kolom: Awasi dan salin tautan dulu (sekadar
              membaca/membagikan), lalu pindah dan arsip (memindahkan kartu
              pergi dari papan), lalu hapus paling akhir dengan warna bahaya —
              satu-satunya yang tidak bisa diurungkan. */}
          {detail && (
            <div ref={menuAnchorRef} className="relative shrink-0">
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-label="Menu kartu"
                title="Menu kartu"
                onClick={() => setMenuOpen((v) => !v)}
                className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-(--card-plate-hi) hover:text-ink"
              >
                <MoreIcon />
              </button>

              {menuOpen &&
                menuAnchor &&
                createPortal(
                  <div
                    ref={menuPanelRef}
                    role="menu"
                    aria-label="Menu kartu"
                    style={
                      menuAnchor.mode === "end"
                        ? { right: menuAnchor.right, top: menuAnchor.top }
                        : { left: "50%", top: menuAnchor.top, transform: "translateX(-50%)" }
                    }
                    className="sheet sheet-frost glass-lens fixed z-55 w-52 max-w-[calc(100vw-2rem)] rounded-2xl p-1.5"
                  >
                    <MenuItem
                      icon={<EyeIcon watching={detail.watching} className="size-4 shrink-0" />}
                      label={detail.watching ? "Berhenti mengawasi" : "Awasi kartu ini"}
                      onClick={() => {
                        void setWatching(!detail.watching);
                        setMenuOpen(false);
                      }}
                    />

                    <MenuItem
                      icon={
                        linkCopied ? (
                          <CheckIcon className="size-4 shrink-0 text-ok" />
                        ) : (
                          <LinkIcon className="size-4 shrink-0" />
                        )
                      }
                      label={linkCopied ? "Tautan disalin" : "Salin tautan kartu"}
                      onClick={() => void copyLink()}
                    />

                    <span className="my-1 block h-px bg-line-soft" />

                    {/* Pindah papan tidak mengubah apa pun tentang isi kartu
                        ini, ia memindahkan kartunya — sekelas dengan Arsipkan
                        di bawahnya, bukan dengan menyunting deskripsi.

                        Padam selagi kartunya terarsip. Yang dipindahkan pemilih
                        papan adalah kartu yang berdiri di sebuah kolom, dan
                        kartu terarsip sudah tidak berdiri di mana pun: ia
                        disaring dari papan (lihat `isNull(archivedAt)` di
                        worker/routes/boards.ts), jadi papan asalnya sendiri
                        tidak akan menemukannya lagi untuk dipindahkan.
                        Pulihkan dulu, lalu pindahkan seperti kartu biasa. */}
                    <MenuItem
                      icon={<MoveOutIcon className="size-4 shrink-0" />}
                      label="Pindahkan ke papan lain…"
                      disabled={detail.archivedAt !== null}
                      hint="Pulihkan dulu dari arsip"
                      onClick={() => {
                        setMenuOpen(false);
                        onMove();
                      }}
                    />

                    {/* Arsipkan/Pulihkan — butir yang sama gantian jadi
                        Pulihkan begitu kartunya terarsip, bukan butir
                        terpisah. Hapus permanen tinggal di bawahnya sendiri
                        supaya tetap terasa lebih "berbahaya" daripada arsip
                        yang reversibel. */}
                    <MenuItem
                      icon={
                        detail.archivedAt ? (
                          <RestoreBoxIcon className="size-4 shrink-0" />
                        ) : (
                          <ArchiveBoxIcon className="size-4 shrink-0" />
                        )
                      }
                      label={detail.archivedAt ? "Pulihkan dari arsip" : "Arsipkan"}
                      onClick={() => {
                        setMenuOpen(false);
                        void setArchived(!detail.archivedAt);
                      }}
                    />

                    <span className="my-1 block h-px bg-line-soft" />

                    <MenuItem
                      icon={<TrashIcon className="size-4 shrink-0" />}
                      label="Hapus kartu"
                      danger
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete();
                      }}
                    />
                  </div>,
                  document.body,
                )}
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kartu"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-(--card-plate-hi) hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
              <path d="M6 6 18 18M18 6 6 18" />
            </svg>
          </button>
        </header>

        {error && (
          <p className="mx-5 mb-2 rounded-lg bg-danger/10 px-3 py-2 text-xs text-danger">
            {error}
          </p>
        )}

        {!detail ? (
          <CardDetailSkeleton />
        ) : (
          <>
            {/* Dua pilar. Isi kartu di kiri, lini masanya di kanan — masing-masing
                menggulir sendiri, jadi membaca jejak panjang tidak menghanyutkan
                deskripsi dan checklist ke luar layar. Di lebar sempit keduanya
                kembali bertumpuk jadi satu kolom yang menggulir bersama. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
              <div className="flex flex-col gap-5 px-5 pb-5 md:min-h-0 md:flex-1 md:overflow-y-auto">
                <CardLabels
                  boardLabels={boardLabels}
                  cardLabels={detail.labels}
                  onToggle={toggleLabel}
                  onCreate={createLabel}
                  onRename={renameLabel}
                  onDelete={deleteLabel}
                />

                {/* Orang dan tenggat berdampingan: keduanya jawaban atas
                    pertanyaan yang sama — siapa, dan kapan — dan masing-masing
                    isinya cuma sebaris. Di layar sempit mereka kembali
                    bertumpuk. */}
                <div className="grid gap-5 sm:grid-cols-2">
                  <CardPeople
                    members={detail.members}
                    workspaceId={detail.workspaceId}
                    onAdd={addPerson}
                    onRemove={removePerson}
                  />

                  <CardDue
                    dueAt={detail.dueAt}
                    dueDoneAt={detail.dueDoneAt}
                    onChange={setDue}
                    onDoneChange={setDueDone}
                  />
                </div>

                <section className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="section-label">Deskripsi</span>

                    {!editingDescription && (
                      <button
                        type="button"
                        onClick={() => setEditingDescription(true)}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold text-faint transition-colors hover:bg-(--card-plate-hi) hover:text-ink"
                      >
                        <PencilIcon className="size-3" />
                        Edit
                      </button>
                    )}
                  </div>

                  {editingDescription ? (
                    <MarkdownField
                      autoFocus
                      rows={4}
                      value={detail.description ?? ""}
                      placeholder="Jelaskan kartu ini… (Mendukung format Markdown)"
                      allowEmpty
                      status={networkStatus}
                      onSave={commitDescription}
                      onCancel={() => setEditingDescription(false)}
                    />
                  ) : detail.description ? (
                    <Markdown source={detail.description} className="text-sm" />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDescription(true)}
                      className="rounded-lg text-left text-sm text-faint transition-colors hover:text-ink"
                    >
                      Klik untuk menambah deskripsi…
                    </button>
                  )}
                </section>

                <CardChecklist
                  items={detail.checklistItems}
                  onToggle={toggleItem}
                  onRename={renameItem}
                  onDelete={deleteItem}
                  onAdd={addItem}
                />

                <CardAttachments
                  attachments={detail.attachments}
                  uploading={uploadingAttachment}
                  onAdd={addAttachment}
                  onDelete={deleteAttachment}
                />
              </div>

              {!followupHidden && (
              <div className="flex flex-col border-t border-line-soft md:min-h-0 md:w-3/8 md:shrink-0 md:border-t-0 md:border-l">
                <CardFollowup
                  comments={detail.comments}
                  activities={detail.activities}
                  currentUserId={currentUser.id}
                  workspaceId={detail.workspaceId}
                  networkStatus={networkStatus}
                  onAdd={addComment}
                  onEdit={editComment}
                  onDelete={deleteComment}
                />
              </div>
              )}
            </div>

            {/* Kaki kartu: siapa yang terlibat, di kiri — lalu kapan kartu ini
                dibuat dan terakhir diubah. Keduanya hanya muncul di sini,
                tidak di muka kartu. */}
            <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft px-5 py-3">
              <AvatarStack
                people={detail.participants}
                max={6}
                size="md"
                onSelect={(person, anchor) => openProfile(person, detail.workspaceId, anchor)}
              />

              <div className="ml-auto text-right">
                <Trace verb="Dibuat" who={detail.createdByUser} at={detail.createdAt} />
                {new Date(detail.updatedAt).getTime() -
                  new Date(detail.createdAt).getTime() >
                  1000 && (
                  <Trace verb="Diubah" who={detail.updatedByUser} at={detail.updatedAt} />
                )}
              </div>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
