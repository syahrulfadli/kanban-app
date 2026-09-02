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
        className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-muted transition-colors hover:bg-line-soft hover:text-ink"
      >
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
