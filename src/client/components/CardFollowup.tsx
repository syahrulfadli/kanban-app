import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { ConfirmDialog } from "./ConfirmDialog";
import { Markdown } from "./Markdown";
import { MarkdownField } from "./MarkdownField";
import { PencilIcon, TrashIcon } from "./icons";
import { useOpenProfile } from "./ProfilePopover";
import { useDismiss } from "../hooks/useDismiss";
import { useStoredFlag } from "../hooks/useStoredFlag";
import { useLanguage, useT } from "../hooks/useLanguage";
import { describeActivity } from "../lib/activity";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import { formatDateTime, formatRelative } from "../lib/format";
import type { ChannelStatus } from "../lib/realtime";
import {
  REACTION_EMOJIS,
  type CardActivityDetail,
  type CardCommentDetail,
  type ReactionEmoji,
} from "../../shared/types";

interface Props {
  comments: CardCommentDetail[];
  /** Jejak perubahan kartu — dianyam ke lini masa yang sama dengan followup. */
  activities: CardActivityDetail[];
  /** Id user yang sedang login — hanya tulisannya sendiri yang boleh diubah. */
  currentUserId: string;
  /** Workspace pemilik kartu — dibutuhkan untuk membuka profil publik pelaku. */
  workspaceId: string;
  /** Status koneksi realtime board — memadamkan Kirim/Simpan selagi offline. */
  networkStatus: ChannelStatus;
  onAdd: (body: string) => void;
  onEdit: (comment: CardCommentDetail, body: string) => void;
  onDelete: (comment: CardCommentDetail) => void;
  /** Siapa pun anggota workspace boleh bereaksi, bukan cuma penulisnya. */
  onReact: (comment: CardCommentDetail, emoji: ReactionEmoji) => void;
}

/** Followup dianggap tersunting kalau jaraknya dari pembuatan lebih dari sedetik. */
const edited = (comment: CardCommentDetail) =>
  new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000;

const stamp = (value: Date | string) => new Date(value).getTime();

/**
 * Dua sumber, satu urutan waktu. Yang ditulis orang dan yang terjadi pada
 * kartu berdiri di garis yang sama — karena begitulah keduanya dialami:
 * berselang-seling, bukan di dua daftar terpisah.
 */
type Entry =
  | { at: number; note: false; comment: CardCommentDetail }
  | { at: number; note: true; activity: CardActivityDetail };

function weave(comments: CardCommentDetail[], activities: CardActivityDetail[]): Entry[] {
  const entries: Entry[] = [
    ...comments.map((comment) => ({ at: stamp(comment.createdAt), note: false as const, comment })),
    ...activities.map((activity) => ({
      at: stamp(activity.createdAt),
      note: true as const,
      activity,
    })),
  ];

  return entries.sort((a, b) => a.at - b.at);
}

/** Waktu kejadian: relatif di layar, persis di tooltip. */
function When({ at, className }: { at: Date | string; className?: string }) {
  const t = useT();
  const { language } = useLanguage();
  return (
    <span className={className} title={formatDateTime(at, language)}>
      {formatRelative(at, language, t)}
    </span>
  );
}

/**
 * Satu catatan perubahan. Sengaja lebih kecil dan lebih redup daripada
 * followup yang ditulis orang: ia latar, bukan percakapan.
 */
function ActivityRow({ activity, workspaceId }: { activity: CardActivityDetail; workspaceId: string }) {
  const t = useT();
  const { verb, subject, color } = describeActivity(activity.kind, activity.detail, t.activity);
  const openProfile = useOpenProfile();
  const actor = activity.actor;

  return (
    <li className="timeline-item timeline-item-note">
      {actor ? (
        <button
          type="button"
          onClick={(e) => openProfile(actor, workspaceId, e.currentTarget)}
          className="justify-self-center rounded-full transition-opacity hover:opacity-80"
        >
          <Avatar person={actor} size="sm" />
        </button>
      ) : (
        <span className="timeline-dot" aria-hidden />
      )}

      <p className="text-[0.6875rem] leading-relaxed text-muted">
        {actor ? (
          <button
            type="button"
            onClick={(e) => openProfile(actor, workspaceId, e.currentTarget)}
            className="font-semibold text-muted hover:text-ink hover:underline"
          >
            {actor.name}
          </button>
        ) : (
          <span className="font-semibold text-muted">{t.common.someone}</span>
        )}{" "}
        {verb}
        {subject &&
          (color ? (
            <>
              {" "}
              <span className="label-chip align-middle" style={labelTint(color)}>
                {subject}
              </span>
            </>
          ) : (
            <> <span className="font-medium text-muted">{subject}</span></>
          ))}
        <span className="text-muted"> · </span>
        <When at={activity.createdAt} />
      </p>
    </li>
  );
}

/**
 * Satu keping penghitung (bukan satu keping per emoji) plus tombol
 * tambahnya, keduanya bersandar ke kanan.
 *
 * Penghitung menampilkan emoji yang dipakai (tanpa diulang) dan jumlah
 * orangnya, dan itulah satu-satunya cara membaca deretan reaksi — ditekan
 * untuk membuka daftar siapa saja yang memberinya, bukan langsung menyalin
 * emoji tertentu (beda dari rancangan pertama, tempat tiap keping emoji
 * bisa ditekan siapa saja untuk toggle miliknya sendiri). Tombol tambahnya
 * (😊) sendiri hanya muncul sebelum orang yang sedang melihat bereaksi —
 * begitu sudah, satu-satunya jalan mengubahnya adalah melepas dulu lewat
 * "Hapus reaksi" di daftar, lalu tombolnya muncul lagi. Konsisten dengan
 * aturan server: satu orang paling banyak satu reaksi per komentar.
 */
function ReactionBar({
  comment,
  currentUserId,
  workspaceId,
  onReact,
}: {
  comment: CardCommentDetail;
  currentUserId: string;
  workspaceId: string;
  onReact: (comment: CardCommentDetail, emoji: ReactionEmoji) => void;
}) {
  const t = useT();
  const openProfile = useOpenProfile();
  const [listOpen, setListOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const counterRef = useRef<HTMLDivElement>(null);
  const listPanelRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const pickerPanelRef = useRef<HTMLDivElement>(null);
  useDismiss(listOpen, () => setListOpen(false), [counterRef, listPanelRef]);
  useDismiss(pickerOpen, () => setPickerOpen(false), [pickerRef, pickerPanelRef]);

  const total = comment.reactions.length;
  const mine = comment.reactions.find((r) => r.user.id === currentUserId);

  // Emoji yang dipakai, tanpa diulang, urut kemunculan pertama —
  // comment.reactions sendiri sudah datang terurut waktu dipasang dari server.
  const distinctEmojis: ReactionEmoji[] = [];
  for (const r of comment.reactions) {
    if (!distinctEmojis.includes(r.emoji)) distinctEmojis.push(r.emoji);
  }

  return (
    <div className="-mt-0.5 flex items-center justify-end gap-1.5">
      {total > 0 && (
        <div ref={counterRef} className="relative">
          <button
            type="button"
            onClick={() => setListOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={listOpen}
            aria-label={t.cardFollowup.reactionsListAria(total)}
            title={t.cardFollowup.reactionsListAria(total)}
            className={cn(
              "chip cursor-pointer transition-colors hover:bg-line-soft",
              mine && "outline-2 outline-offset-1 outline-accent",
            )}
          >
            <span>{distinctEmojis.join("")}</span>
            <span className="tabular-nums">{total}</span>
          </button>

          {listOpen && (
            <div
              ref={listPanelRef}
              role="dialog"
              aria-label={t.cardFollowup.reactionsListAria(total)}
              className="sheet absolute top-full right-0 z-20 mt-1.5 w-60 rounded-2xl p-1.5"
            >
              <ul className="flex flex-col">
                {comment.reactions.map((r) => (
                  <li key={r.user.id} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5">
                    <button
                      type="button"
                      onClick={(e) => openProfile(r.user, workspaceId, e.currentTarget)}
                      className="rounded-full transition-opacity hover:opacity-80"
                    >
                      <Avatar person={r.user} size="sm" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => openProfile(r.user, workspaceId, e.currentTarget)}
                      className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
                    >
                      {r.user.name}
                    </button>
                    <span aria-hidden>{r.emoji}</span>
                    {r.user.id === currentUserId && (
                      <button
                        type="button"
                        onClick={() => {
                          onReact(comment, r.emoji);
                          setListOpen(false);
                        }}
                        aria-label={t.cardFollowup.removeReaction}
                        title={t.cardFollowup.removeReaction}
                        className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                      >
                        <TrashIcon className="size-3.5" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!mine && (
        <div ref={pickerRef} className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            aria-label={t.cardFollowup.reactAria}
            title={t.cardFollowup.reactAria}
            className="grid size-6 cursor-pointer place-items-center rounded-full text-sm transition-colors hover:bg-line-soft"
          >
            😊
          </button>

          {pickerOpen && (
            <div
              ref={pickerPanelRef}
              role="dialog"
              aria-label={t.cardFollowup.reactAria}
              className="sheet absolute top-full right-0 z-20 mt-1.5 flex gap-0.5 rounded-2xl p-1.5"
            >
              {REACTION_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    onReact(comment, emoji);
                    setPickerOpen(false);
                  }}
                  aria-label={emoji}
                  className="grid size-8 cursor-pointer place-items-center rounded-full text-lg transition-transform hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CardFollowup({
  comments,
  activities,
  currentUserId,
  workspaceId,
  networkStatus,
  onAdd,
  onEdit,
  onDelete,
  onReact,
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CardCommentDetail | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const openProfile = useOpenProfile();
  const t = useT();

  /**
   * Lini masa lengkap, atau percakapannya saja.
   *
   * Defaultnya percakapan. Jejak perubahan berguna ketika sedang ditanyakan —
   * "sejak kapan ini di kolom itu", "siapa yang melepas labelnya" — tapi ia
   * jauh lebih banyak daripada followup yang ditulis orang, dan di kartu yang
   * ramai satu kalimat yang perlu dibaca tenggelam di antara belasan baris
   * pencentangan checklist. Yang lebih sering dicari yang ditulis orang, jadi
   * itulah yang berdiri di depan; sisanya sejauh satu ketukan.
   */
  const [details, toggleDetails] = useStoredFlag("card:timeline-details", false);

  const entries = weave(comments, details ? activities : []);

  // Lini masa dibaca dari ujung terbaru: begitu ada baris baru, panel
  // menggulir sendiri ke bawah — persis kebiasaan membaca utas percakapan.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  /* MarkdownField mengelola draf di dalam dirinya sendiri dan tidak pernah
     mendapat `value` baru selain saat dipasang ulang — jadi kunci ini yang
     memaksa komposer lahir kembali dengan draf kosong setelah followup
     terkirim atau dibatalkan. */
  const [composerKey, setComposerKey] = useState(0);
  const resetComposer = () => setComposerKey((k) => k + 1);

  const submitNew = (body: string) => {
    onAdd(body);
    resetComposer();
  };

  const commitEdit = (comment: CardCommentDetail, body: string) => {
    setEditing(null);
    onEdit(comment, body);
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="section-label px-5 pt-4 pb-2 md:px-4 md:pt-0">
        <span>{t.cardFollowup.heading}</span>
        {comments.length > 0 && (
          <span className="tabular-nums normal-case text-muted">{comments.length}</span>
        )}

        {/* Sakelarnya duduk di kepala panel, bukan di kaki daftar: yang
            diubahnya adalah apa yang sedang dibaca, dan pertanyaannya muncul
            sebelum orang menggulir, bukan setelah sampai dasar. */}
        <button
          type="button"
          aria-pressed={details}
          onClick={toggleDetails}
          title={details ? t.cardFollowup.hideDetailTitle : t.cardFollowup.showDetailTitle}
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold tracking-normal normal-case transition-colors",
            details ? "bg-line-soft text-ink" : "text-faint hover:text-ink",
          )}
        >
          {t.cardFollowup.detailToggle}
        </button>
      </div>

      <div ref={scroller} className="min-h-0 px-5 pb-2 md:flex-1 md:overflow-y-auto md:px-4">
        {entries.length === 0 ? (
          <p className="text-xs text-faint">
            {details ? t.cardFollowup.emptyDetails : t.cardFollowup.emptyComments}
          </p>
        ) : (
          <ol className="timeline">
            {entries.map((entry) => {
              if (entry.note) {
                return (
                  <ActivityRow
                    key={entry.activity.id}
                    activity={entry.activity}
                    workspaceId={workspaceId}
                  />
                );
              }

              const comment = entry.comment;
              const mine = comment.userId === currentUserId;

              return (
                <li key={comment.id} className="timeline-item group items-start">
                  <button
                    type="button"
                    onClick={(e) => openProfile(comment.author, workspaceId, e.currentTarget)}
                    className="rounded-full transition-opacity hover:opacity-80"
                  >
                    <Avatar person={comment.author} />
                  </button>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <button
                        type="button"
                        onClick={(e) => openProfile(comment.author, workspaceId, e.currentTarget)}
                        className="text-sm font-semibold hover:underline"
                      >
                        {comment.author.name}
                      </button>
                      <span className="text-[0.6875rem] text-muted">
                        <When at={comment.createdAt} />
                        {edited(comment) && ` · ${t.cardFollowup.edited}`}
                      </span>

                      
                    </div>

                    {editing === comment.id ? (
                      <MarkdownField
                        autoFocus
                        rows={3}
                        value={comment.body}
                        saveLabel={t.common.save}
                        status={networkStatus}
                        onSave={(body) => commitEdit(comment, body)}
                        onCancel={() => setEditing(null)}
                        className="mt-1"
                      />
                    ) : (
                      <Markdown source={comment.body} className="mt-0.5 text-sm text-ink-soft" />
                    )}

                    {editing !== comment.id && (
                      <ReactionBar
                        comment={comment}
                        currentUserId={currentUserId}
                        workspaceId={workspaceId}
                        onReact={onReact}
                      />
                    )}

                    {mine && editing !== comment.id && (
                        <span className="mt-1 flex gap-3">
                          <button
                            type="button"
                            onClick={() => setEditing(comment.id)}
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted transition-colors hover:bg-(--card-plate-hi) hover:text-ink"
                          >
                            <PencilIcon className="size-3" />
                            {t.cardFollowup.editLabel}
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(comment)}
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            <TrashIcon className="size-3" />
                            {t.cardFollowup.deleteLabel}
                          </button>
                        </span>
                      )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {/* Kolom tulis tetap di kaki panel, tidak ikut menggulir: dari mana pun
          lini masa sedang dibaca, tempat menjawabnya selalu di tempat sama. */}
      <div className="border-t border-line-soft px-5 py-3 md:px-4">
        <MarkdownField
          key={composerKey}
          value=""
          rows={2}
          placeholder={t.cardFollowup.composerPlaceholder}
          saveLabel={t.common.send}
          status={networkStatus}
          onSave={submitNew}
          onCancel={resetComposer}
        />
      </div>

      {/* Beda dari pemakaian `ConfirmDialog` lain di aplikasi ini (selalu
          bertetangga dengan dialog induknya, bukan anaknya): di sini ia lahir
          di dalam `CardModal`, yang punya penjaga Escape sendiri. Tanpa
          `stopPropagation`, Escape yang membatalkan konfirmasi ini akan terus
          menembus ke atas dan ikut menutup seluruh kartu — persis alasan yang
          sama dengan `Lightbox`. */}
      {pendingDelete && (
        <div onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}>
          <ConfirmDialog
            title={t.cardFollowup.deleteConfirmTitle}
            body={t.cardFollowup.deleteConfirmBody}
            confirmLabel={t.cardFollowup.deleteConfirmLabel}
            onConfirm={() => {
              onDelete(pendingDelete);
              setPendingDelete(null);
            }}
            onCancel={() => setPendingDelete(null)}
          />
        </div>
      )}
    </section>
  );
}
