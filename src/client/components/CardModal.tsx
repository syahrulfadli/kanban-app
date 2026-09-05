import { useCallback, useEffect, useRef, useState } from "react";
import { CardChecklist } from "./CardChecklist";
import { CardDue } from "./CardDue";
import { CardFollowup } from "./CardFollowup";
import { CardLabels } from "./CardLabels";
import { CardPeople } from "./CardPeople";
import { WatchToggle } from "./WatchToggle";
import { AvatarStack } from "./Avatar";
import { CardDetailSkeleton, SkeletonLine } from "./Skeleton";
import { useStoredFlag } from "../hooks/useStoredFlag";
import { api } from "../lib/api";
import { optimisticActivity, type ActivityNote } from "../lib/activity";
import { formatDateTime, formatRelative } from "../lib/format";
import type {
  CardCommentDetail,
  CardDetail,
  ChecklistItem,
  Label,
  LabelColor,
  UserBrief,
} from "../../shared/types";

interface Props {
  cardId: string;
  /** Palet label milik board — dipakai pemilih label di dalam dialog. */
  boardLabels: Label[];
  columnTitle: string;
  currentUser: UserBrief;
  /** Alamat kartu ini — yang sama dengan yang sedang dipakai bilah alamat. */
  shareUrl: string;
  onClose: () => void;
  /** Buka pemilih papan tujuan. Perpindahannya sendiri milik papan, bukan
      dialog ini: kartunya akan hilang dari papan yang sedang dibuka. */
  onMove: () => void;
  /** Muat ulang board, supaya muka kartu di papan ikut berubah. */
  onBoardChange: () => void;
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
  columnTitle,
  currentUser,
  shareUrl,
  onClose,
  onMove,
  onBoardChange,
}: Props) {
  const [detail, setDetail] = useState<CardDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingDescription, setEditingDescription] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

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
    const t = setTimeout(() => setLinkCopied(false), 1800);
    return () => clearTimeout(t);
  }, [linkCopied]);

  const load = useCallback(async () => {
    try {
      setDetail(await api.getCard(cardId));
      setError(null);
    } catch (e) {
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
        setError(e instanceof Error ? e.message : "Perubahan gagal disimpan");
        await load();
      } finally {
        onBoardChange();
      }
    },
    [cardId, currentUser, load, onBoardChange],
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
    const text = value.trim();
    setEditingDescription(false);
    if (!detail) return;

    const description = text || null;
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
      (card) => ({ ...card, dueAt: after }),
      () => api.updateCard(cardId, { dueAt }),
      after
        ? {
            kind: "due_changed",
            detail: { from: before?.toISOString() ?? null, to: after.toISOString() },
          }
        : { kind: "due_cleared" },
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
        className="card-plain relative flex h-full w-full max-w-4xl flex-col overflow-hidden outline-none"
      >
        <header className="flex items-start gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0 flex-1">
            <span className="chip mb-2">{columnTitle}</span>

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

          {detail && (
            <WatchToggle
              watching={detail.watching}
              onChange={(watching) => void setWatching(watching)}
              subject="kartu ini"
              className="size-8 text-muted"
            />
          )}

          {/* Sakelar panel followup. Di kepala kartu bersama kenop lain yang
              bukan suntingan: yang diubahnya lebar bacaan, bukan isi kartu. */}
          <button
            type="button"
            onClick={toggleFollowup}
            aria-pressed={!followupHidden}
            aria-label={followupHidden ? "Tampilkan panel followup" : "Sembunyikan panel followup"}
            title={followupHidden ? "Tampilkan followup" : "Sembunyikan followup"}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-line-soft hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M15 4v16" />
              {followupHidden && <path d="m18 10-2 2 2 2" />}
            </svg>
          </button>

          {/* Pindah papan berdiri di deret kenop kepala kartu, bukan di dalam
              isinya: ia tidak mengubah apa pun tentang kartu ini, ia
              memindahkan kartunya — sekelas dengan menyalin tautan dan
              menutup, bukan dengan menyunting deskripsi. */}
          <button
            type="button"
            onClick={onMove}
            aria-label="Pindahkan kartu ke papan lain"
            title="Pindahkan ke papan lain"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-line-soft hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M13 4H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6" />
              <path d="m16 8 4 4-4 4M20 12H10" />
            </svg>
          </button>

          <button
            type="button"
            onClick={() => void copyLink()}
            aria-label="Salin tautan kartu"
            title={linkCopied ? "Tautan disalin" : "Salin tautan kartu"}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-line-soft hover:text-ink"
          >
            {linkCopied ? (
              <svg viewBox="0 0 24 24" className="size-5 text-ok" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M10 13.5a4 4 0 0 0 5.7.4l3-3a4 4 0 0 0-5.7-5.7l-1.6 1.6" />
                <path d="M14 10.5a4 4 0 0 0-5.7-.4l-3 3a4 4 0 0 0 5.7 5.7l1.6-1.6" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup kartu"
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-line-soft hover:text-ink"
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

                  <CardDue dueAt={detail.dueAt} onChange={setDue} />
                </div>

                <section className="flex flex-col gap-2">
                  <span className="section-label">Deskripsi</span>

                  {editingDescription ? (
                    <textarea
                      autoFocus
                      rows={4}
                      defaultValue={detail.description ?? ""}
                      placeholder="Jelaskan kartu ini…"
                      onBlur={(e) => commitDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          e.stopPropagation();
                          setEditingDescription(false);
                        }
                      }}
                      className="field resize-y"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDescription(true)}
                      className="rounded-lg text-left text-sm leading-relaxed wrap-break-word whitespace-pre-wrap transition-colors hover:text-ink"
                    >
                      {detail.description || (
                        <span className="text-faint">Klik untuk menambah deskripsi…</span>
                      )}
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
              </div>

              {!followupHidden && (
              <div className="flex flex-col border-t border-line-soft md:min-h-0 md:w-80 md:shrink-0 md:border-t-0 md:border-l">
                <CardFollowup
                  comments={detail.comments}
                  activities={detail.activities}
                  currentUserId={currentUser.id}
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
              <AvatarStack people={detail.participants} max={6} size="md" />

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
