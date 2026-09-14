import { useState } from "react";
import { useT } from "../hooks/useLanguage";

interface Props {
  id?: string;
  required?: boolean;
  minLength?: number;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
}

/** Field kata sandi dengan sakelar lihat/sembunyikan. Bukan hiasan — tanpa
    ini, satu salah ketik di kolom yang seluruhnya titik-titik hanya
    ketahuan setelah formulir ditolak server. */
export function PasswordField({
  id,
  required,
  minLength,
  value,
  onChange,
  placeholder,
  autoComplete,
}: Props) {
  const t = useT();
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        id={id}
        required={required}
        minLength={minLength}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="field pr-9"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t.common.hidePassword : t.common.showPassword}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-faint transition-colors hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {visible ? (
            <>
              <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
              <circle cx="12" cy="12" r="2.5" />
              <path d="M3.5 3.5l17 17" />
            </>
          ) : (
            <>
              <path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
              <circle cx="12" cy="12" r="2.5" />
            </>
          )}
        </svg>
      </button>
    </div>
  );
}
