import { useRef, useState } from "react";
import { isAttachmentImage, MAX_ATTACHMENT_BASE64 } from "../../shared/types";
import type { CardAttachmentDetail } from "../../shared/types";
import { ATTACHMENT_ACCEPT } from "../lib/attachment";
import { cn } from "../lib/cn";
import { Lightbox } from "./Lightbox";

interface Props {
  attachments: CardAttachmentDetail[];
  uploading: boolean;
  onAdd: (file: File) => void;
  onDelete: (attachment: CardAttachmentDetail) => void;
}

const attachmentUrl = (id: string) => `/api/attachments/${id}`;

/** "500 KB", "1,2 MB" — cukup kasar untuk label ukuran berkas. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Klip kertas — bentuk yang sudah dikenal sebagai lampiran. */
export function AttachmentIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.48" />
    </svg>
  );
}

function AttachmentRow({
  attachment,
  onOpen,
  onDelete,
}: {
  attachment: CardAttachmentDetail;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const image = isAttachmentImage(attachment.mime);

  const thumb = image ? (
    <span className="block size-10 shrink-0 overflow-hidden rounded-lg bg-line-soft">
      <img src={attachmentUrl(attachment.id)} alt="" className="size-full object-cover" />
    </span>
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-line-soft text-muted">
      <AttachmentIcon />
    </span>
  );

  const label = (
    <span className="min-w-0 flex-1 truncate text-left text-sm leading-snug text-ink-soft">
      {attachment.filename}
      <span className="ml-1.5 text-xs text-faint">{formatBytes(attachment.size)}</span>
    </span>
  );

  return (
    <li className="group flex items-center gap-2.5 rounded-lg py-1.5">
      {image ? (
        <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:text-ink">
          {thumb}
          {label}
        </button>
      ) : (
        <a
          href={attachmentUrl(attachment.id)}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left hover:text-ink"
        >
          {thumb}
          {label}
        </a>
      )}

      <button
        type="button"
        aria-label={`Hapus lampiran ${attachment.filename}`}
        onClick={onDelete}
        className="grid size-6 shrink-0 place-items-center rounded-full text-faint opacity-0 transition-[opacity,color] group-hover:opacity-100 hover:bg-danger/10 hover:text-danger focus-visible:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
          <path d="M6 6 18 18M18 6 6 18" />
        </svg>
      </button>
    </li>
  );
}

export function CardAttachments({ attachments, uploading, onAdd, onDelete }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CardAttachmentDetail | null>(null);

  return (
    <section className="flex flex-col gap-2.5">
      <div className="section-label">
        <span>Lampiran</span>
        {attachments.length > 0 && (
          <span className="tabular-nums normal-case text-muted">{attachments.length}</span>
        )}
      </div>

      {attachments.length > 0 && (
        <ul className="flex flex-col">
          {attachments.map((a) => (
            <AttachmentRow
              key={a.id}
              attachment={a}
              onOpen={() => setPreview(a)}
              onDelete={() => onDelete(a)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn("btn btn-glass self-start px-3 py-1.5 text-muted hover:text-ink", uploading && "opacity-50")}
        >
          <AttachmentIcon />
          {uploading ? "Memproses…" : "Tambah lampiran"}
        </button>
        <span className="text-xs text-faint">
          maks {Math.round(MAX_ATTACHMENT_BASE64 / 1000)} KB per berkas
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        hidden
        accept={ATTACHMENT_ACCEPT}
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Dikosongkan supaya memilih berkas yang sama dua kali tetap memicu perubahan.
          e.target.value = "";
          if (file) onAdd(file);
        }}
      />

      {preview && (
        <Lightbox label={preview.filename} onClose={() => setPreview(null)}>
          <img
            src={attachmentUrl(preview.id)}
            alt={preview.filename}
            className="glass relative max-h-full max-w-full rounded-xl object-contain shadow-2xl"
          />
        </Lightbox>
      )}
    </section>
  );
}
