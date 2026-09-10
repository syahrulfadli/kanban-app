import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { HelpIcon } from "./icons";
import { useDismiss } from "../hooks/useDismiss";
import { useT } from "../hooks/useLanguage";
import { cn } from "../lib/cn";
import type { ChannelStatus } from "../lib/realtime";

/**
 * Tanda tanya kecil di samping tab Tulis/Pratinjau — buka lembar ringkas
 * berisi sintaks markdown yang dipakai (tebal, miring, daftar, dst). Dipakai
 * bersama oleh deskripsi kartu dan followup lewat `MarkdownField`, jadi
 * cukup ditaruh sekali di sini, bukan di masing-masing pemanggilnya.
 */
function MarkdownTipsButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useDismiss(open, () => setOpen(false), [anchorRef, panelRef]);

  /* Arahnya menyesuaikan ruang yang ada, bukan dipatok satu arah: tombol ini
     dipakai di deskripsi (dekat puncak panel kartu, ruang di bawahnya luas)
     maupun di followup (dekat dasar panel, ruang di bawahnya nyaris tidak
     ada). Dipatok ke bawah saja lembar ini terpotong tepi panel di
     followup; dipatok ke atas saja ia terpotong tepi panel di deskripsi.
     Diukur lewat `useLayoutEffect` supaya baris salah tidak sempat kelihatan
     sebelum browser menggambar bingkai berikutnya. */
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    const panel = panelRef.current;
    if (!anchor || !panel) return;
    const anchorRect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    setOpenUpward(spaceBelow < panel.offsetHeight + 12 && spaceAbove > spaceBelow);
  }, [open]);

  return (
    <div className="relative ml-auto">
      <button
        ref={anchorRef}
        type="button"
        aria-label={t.markdownTips.triggerAria}
        aria-pressed={open}
        onClick={() => setOpen((v) => !v)}
        className="grid size-5 place-items-center rounded-full text-faint transition-colors hover:bg-line-soft hover:text-ink"
      >
        <HelpIcon className="size-3.5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={t.markdownTips.title}
          className={cn(
            "sheet absolute right-0 z-30 w-60 rounded-2xl p-3 text-left",
            openUpward ? "bottom-full mb-1.5" : "top-full mt-1.5",
          )}
        >
          <p className="mb-2 text-xs font-semibold tracking-tight">{t.markdownTips.title}</p>
          <div className="space-y-1">
            {t.markdownTips.rows.map((row) => (
              <div key={row.markup} className="flex items-center justify-between gap-3 text-xs">
                <code className="rounded bg-line-soft px-1 py-0.5 font-mono text-[0.6875rem]">
                  {row.markup}
                </code>
                <span className="text-muted">{row.result}</span>
              </div>
            ))}
          </div>
          <p className="mt-2.5 text-[0.6875rem] text-muted">{t.markdownTips.newline}</p>
        </div>
      )}
    </div>
  );
}

interface Props {
  /** Nilai tersimpan saat ini — dipakai sebagai draf awal dan pembanding "berubah". */
  value: string;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
  /** "Simpan" untuk deskripsi/penyuntingan, "Kirim" untuk followup baru. */
  saveLabel?: string;
  /** Draf kosong boleh disimpan (mengosongkan deskripsi) atau tidak (followup). */
  allowEmpty?: boolean;
  /** Tinggi mengikuti isi alih-alih dijerat gagang seret — dipakai deskripsi,
   *  yang naskahnya sering jauh lebih panjang daripada `rows` awalnya. */
  autoGrow?: boolean;
  status: ChannelStatus;
  onSave: (value: string) => void;
  onCancel: () => void;
  className?: string;
}

/**
 * Editor markdown dua tab — Tulis dan Pratinjau — dipakai bersama oleh
 * deskripsi kartu dan followup. Menggantikan pola lama "simpan saat blur":
 * perubahan hanya terkirim lewat tombol Simpan/Kirim, supaya markdown yang
 * sedang ditulis (list, blok kode berbaris banyak) tidak keburu tersimpan
 * separuh jalan hanya karena fokus berpindah.
 *
 * Enter selalu menyisipkan baris baru di sini — beda dari textarea lama yang
 * langsung mengirim saat Enter — karena markdown multi-baris (list, kutipan)
 * butuh Enter untuk komposisinya sendiri. Ctrl/Cmd+Enter jadi jalan pintas
 * kirim cepat, tombolnya tetap satu-satunya cara yang wajib ada.
 */
export function MarkdownField({
  value,
  placeholder,
  autoFocus,
  rows = 4,
  saveLabel,
  allowEmpty = false,
  autoGrow = false,
  status,
  onSave,
  onCancel,
  className,
}: Props) {
  const t = useT();
  const [draft, setDraft] = useState(value);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const offline = status !== "live";
  const trimmed = draft.trim();
  const changed = trimmed !== value.trim();
  const canSave = !offline && changed && (allowEmpty || trimmed.length > 0);

  const submit = () => {
    if (!canSave) return;
    onSave(trimmed);
  };

  // Tinggi dihitung ulang dari kontennya sendiri tiap ketikan — dilepas ke
  // "auto" dulu supaya scrollHeight tidak ikut terjebak di tinggi lama saat
  // teksnya justru menyusut (mis. baris dihapus).
  useEffect(() => {
    if (!autoGrow) return;
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [autoGrow, draft, mode]);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center gap-1">
        {(["write", "preview"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={mode === tab}
            onClick={() => setMode(tab)}
            className={cn(
              "rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold transition-colors",
              mode === tab ? "bg-line-soft text-ink" : "text-faint hover:text-ink",
            )}
          >
            {tab === "write" ? t.markdownField.write : t.markdownField.preview}
          </button>
        ))}
        <MarkdownTipsButton />
      </div>

      {mode === "write" ? (
        <textarea
          ref={textareaRef}
          autoFocus={autoFocus}
          rows={rows}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              onCancel();
            }
          }}
          className={cn("field", autoGrow ? "resize-none overflow-hidden" : "resize-y")}
        />
      ) : trimmed ? (
        <Markdown source={draft} className="field min-h-24" />
      ) : (
        <p className="field min-h-24 text-faint">{t.markdownField.nothingWritten}</p>
      )}

      <div className="flex items-center gap-2">
        <button type="button" onClick={submit} disabled={!canSave} className="btn btn-primary">
          {saveLabel ?? t.common.save}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-ghost">
          {t.common.cancel}
        </button>
        {offline && <span className="text-xs text-faint">{t.markdownField.waitingForNetwork}</span>}
      </div>
    </div>
  );
}
