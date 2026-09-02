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
        className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-slate-500 hover:bg-slate-500/10"
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
      className="flex flex-col gap-1.5"
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
        className="w-full resize-none rounded-lg border border-border-subtle bg-surface-raised p-2 text-sm outline-none focus:border-blue-500"
      />
      <div className="flex gap-1.5">
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Tambah
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-2 py-1 text-sm text-slate-500 hover:bg-slate-500/10"
        >
          Batal
        </button>
      </div>
    </form>
  );
}
