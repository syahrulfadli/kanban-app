import { useEffect, useRef, useState } from "react";
import { Markdown } from "./Markdown";
import { useT } from "../hooks/useLanguage";
import { cn } from "../lib/cn";
import type { ChannelStatus } from "../lib/realtime";

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
