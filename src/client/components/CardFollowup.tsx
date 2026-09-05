import { useEffect, useRef, useState } from "react";
import { Avatar } from "./Avatar";
import { useStoredFlag } from "../hooks/useStoredFlag";
import { describeActivity } from "../lib/activity";
import { cn } from "../lib/cn";
import { labelTint } from "../lib/people";
import { formatDateTime, formatRelative } from "../lib/format";
import type { CardActivityDetail, CardCommentDetail } from "../../shared/types";

interface Props {
  comments: CardCommentDetail[];
  /** Jejak perubahan kartu — dianyam ke lini masa yang sama dengan followup. */
  activities: CardActivityDetail[];
  /** Id user yang sedang login — hanya tulisannya sendiri yang boleh diubah. */
  currentUserId: string;
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
function ActivityRow({ activity }: { activity: CardActivityDetail }) {
  const { verb, subject, color } = describeActivity(activity.kind, activity.detail);

  return (
    <li className="timeline-item timeline-item-note">
      {activity.actor ? (
        <Avatar person={activity.actor} size="sm" className="justify-self-center" />
      ) : (
        <span className="timeline-dot" aria-hidden />
      )}

      <p className="text-[0.6875rem] leading-relaxed text-faint">
        <span className="font-semibold text-muted">{activity.actor?.name ?? "Seseorang"}</span>{" "}
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
  onAdd,
  onEdit,
  onDelete,
}: Props) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

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

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft("");
  };

  const commitEdit = (comment: CardCommentDetail, value: string) => {
    const body = value.trim();
    setEditing(null);
    if (body && body !== comment.body) onEdit(comment, body);
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
                return <ActivityRow key={entry.activity.id} activity={entry.activity} />;
              }

              const comment = entry.comment;
              const mine = comment.userId === currentUserId;

              return (
                <li key={comment.id} className="timeline-item group">
                  <Avatar person={comment.author} />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-semibold">{comment.author.name}</span>
                      <span className="text-[0.6875rem] text-faint">
                        <When at={comment.createdAt} />
                        {edited(comment) && " · disunting"}
                      </span>

                      {mine && editing !== comment.id && (
                        <span className="ml-auto flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <button
                            type="button"
                            onClick={() => setEditing(comment.id)}
                            className="text-[0.6875rem] font-semibold text-faint transition-colors hover:text-ink"
                          >
                            Ubah
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(comment)}
                            className="text-[0.6875rem] font-semibold text-faint transition-colors hover:text-danger"
                          >
                            Hapus
                          </button>
                        </span>
                      )}
                    </div>

                    {editing === comment.id ? (
                      <textarea
                        autoFocus
                        rows={3}
                        defaultValue={comment.body}
                        onBlur={(e) => commitEdit(comment, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            commitEdit(comment, e.currentTarget.value);
                          }
                          if (e.key === "Escape") {
                            e.stopPropagation();
                            setEditing(null);
                          }
                        }}
                        className="field mt-1 resize-none"
                      />
                    ) : (
                      <p className="mt-0.5 text-sm leading-relaxed text-ink-soft wrap-break-word whitespace-pre-wrap">
                        {comment.body}
                      </p>
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-2 border-t border-line-soft px-5 py-3 md:px-4"
      >
        <textarea
          rows={2}
          value={draft}
          placeholder="Tulis followup… (Enter untuk kirim)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") e.stopPropagation();
          }}
          className="field resize-none"
        />
        {draft.trim() && (
          <div className="flex gap-1.5">
            <button type="submit" className="btn btn-primary">
              Kirim
            </button>
            <button type="button" onClick={() => setDraft("")} className="btn btn-ghost">
              Batal
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
