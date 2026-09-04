import { useState } from "react";

interface Props {
  placeholder: string;
  submitLabel: string;
  onSubmit: (value: string) => Promise<void> | void;
}

export function AddItemForm({ placeholder, submitLabel, onSubmit }: Props) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        /* .add-item mengambil rona dari kolomnya (--col). Tanpa rona ia jatuh
           ke nada netral yang sama seperti sebelumnya — lihat index.css. */
        className="add-item flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {submitLabel}
      </button>
    );
  }

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;

    setBusy(true);
    try {
      await onSubmit(trimmed);
      setValue("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-2"
    >
      <textarea
        autoFocus
        rows={2}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
        className="field resize-none"
      />
      <div className="flex gap-1.5">
        <button type="submit" disabled={busy} className="btn btn-primary">
          Tambah
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn btn-ghost">
          Batal
        </button>
      </div>
    </form>
  );
}
