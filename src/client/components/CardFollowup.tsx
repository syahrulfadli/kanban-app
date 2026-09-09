import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { Markdown } from "./Markdown";
import { MarkdownField } from "./MarkdownField";
import { PencilIcon, TrashIcon } from "./icons";
import { useOpenProfile } from "./ProfilePopover";
import { useStoredFlag } from "../hooks/useStoredFlag";
import { describeActivity } from "../lib/activity";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import { formatDateTime, formatRelative } from "../lib/format";
import type { ChannelStatus } from "../lib/realtime";
import type { CardActivityDetail, CardCommentDetail } from "../../shared/types";

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
  return (
    <span className={className} title={formatDateTime(at)}>
      {formatRelative(at)}
    </span>
  );
}

/**
 * Satu catatan perubahan. Sengaja lebih kecil dan lebih redup daripada
 * followup yang ditulis orang: ia latar, bukan percakapan.
 */
function ActivityRow({ activity, workspaceId }: { activity: CardActivityDetail; workspaceId: string }) {
  const { verb, subject, color } = describeActivity(activity.kind, activity.detail);
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

      <p className="text-[0.6875rem] leading-relaxed text-faint">
        {actor ? (
          <button
            type="button"
            onClick={(e) => openProfile(actor, workspaceId, e.currentTarget)}
            className="font-semibold text-muted hover:text-ink hover:underline"
          >
            {actor.name}
          </button>
        ) : (
          <span className="font-semibold text-muted">Seseorang</span>
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
        <span className="text-faint"> · </span>
        <When at={activity.createdAt} />
      </p>
    </li>
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
}: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const openProfile = useOpenProfile();

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
        <span>Followup</span>
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
          title={
            details
              ? "Sembunyikan jejak perubahan kartu"
              : "Tampilkan jejak perubahan kartu"
          }
          className={cn(
            "ml-auto rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold tracking-normal normal-case transition-colors",
            details ? "bg-line-soft text-ink" : "text-faint hover:text-ink",
          )}
        >
          Detail
        </button>
      </div>

      <div ref={scroller} className="min-h-0 px-5 pb-2 md:flex-1 md:overflow-y-auto md:px-4">
        {entries.length === 0 ? (
          <p className="text-xs text-faint">
            {details
              ? "Belum ada jejak apa pun pada kartu ini."
              : "Belum ada followup. Tekan Detail untuk melihat perubahan kartu."}
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
                      <span className="text-[0.6875rem] text-faint">
                        <When at={comment.createdAt} />
                        {edited(comment) && " · disunting"}
                      </span>

                      
                    </div>

                    {editing === comment.id ? (
                      <MarkdownField
                        autoFocus
                        rows={3}
                        value={comment.body}
                        saveLabel="Simpan"
                        status={networkStatus}
                        onSave={(body) => commitEdit(comment, body)}
                        onCancel={() => setEditing(null)}
                        className="mt-1"
                      />
                    ) : (
                      <Markdown source={comment.body} className="mt-0.5 text-sm text-ink-soft" />
                    )}

                    {mine && editing !== comment.id && (
                        <span className="mt-1 flex gap-3">
                          <button
                            type="button"
                            onClick={() => setEditing(comment.id)}
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold text-faint transition-colors hover:bg-(--card-plate-hi) hover:text-ink"
                          >
                            <PencilIcon className="size-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(comment)}
                            className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[0.6875rem] font-semibold text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                          >
                            <TrashIcon className="size-3" />
                            Hapus
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
          placeholder="Tulis followup… (Mendukung format Markdown)"
          saveLabel="Kirim"
          status={networkStatus}
          onSave={submitNew}
          onCancel={resetComposer}
        />
      </div>
    </section>
  );
}
