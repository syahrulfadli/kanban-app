import { useMemo } from "react";
import { renderMarkdown } from "../lib/markdown";
import { cn } from "../lib/cn";

/** Tampilan baca dari sumber markdown — deskripsi kartu dan isi followup. */
export function Markdown({ source, className }: { source: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);

  /* Amannya bergantung sepenuhnya pada renderMarkdown, yang menyaring
     HTML-nya lewat DOMPurify sebelum sampai di sini. */
  return <div className={cn("markdown-body", className)} dangerouslySetInnerHTML={{ __html: html }} />;
}
