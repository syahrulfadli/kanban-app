import { cn } from "../lib/cn";
import { avatarTint, initials } from "../lib/people";
import type { UserBrief } from "../../shared/types";

type Size = "sm" | "md" | "lg";

const SIZE: Record<Size, string> = {
  sm: "avatar-sm",
  md: "",
  lg: "avatar-lg",
};

interface AvatarProps {
  person: UserBrief;
  size?: Size;
  className?: string;
  title?: string;
}

export function Avatar({ person, size = "md", className, title }: AvatarProps) {
  /* Rona hanya dipasang kalau inisialnya yang terlihat. Foto menutupi seluruh
     keping, jadi mewarnai bawahnya cuma menaruh warna di tempat yang tidak
     pernah terlihat — kecuali sepersekian detik sebelum gambarnya mendarat,
     dan kedipan warna di situ justru mengganggu. */
  const photo = person.image;

  return (
    <span
      className={cn("avatar shrink-0 items-center overflow-hidden", !photo && "avatar-tinted", SIZE[size], className)}
      style={photo ? undefined : avatarTint(person.name, person.email)}
      title={title ?? `${person.name} · ${person.email}`}
    >
      {photo ? (
        <img src={photo} alt="" loading="lazy" />
      ) : (
        initials(person.name, person.email)
      )}
    </span>
  );
}

interface StackProps {
  people: UserBrief[];
  /** Sisanya diringkas jadi satu keping "+n" agar tidak mendorong isi kartu. */
  max?: number;
  size?: Size;
  className?: string;
  /** Kalau diisi, tiap avatar (bukan keping "+n") jadi tombol pembuka profil. */
  onSelect?: (person: UserBrief, anchor: HTMLElement) => void;
}

/**
 * Deretan orang yang menyentuh sebuah kartu — pembuatnya di depan, lalu
 * siapa pun yang menyunting atau menulis followup, urut waktu.
 */
export function AvatarStack({ people, max = 4, size = "sm", className, onSelect }: StackProps) {
  if (people.length === 0) return null;

  const shown = people.length > max ? people.slice(0, max - 1) : people;
  const rest = people.length - shown.length;

  return (
    <span className={cn("avatar-stack flex items-center", className)}>
      {shown.map((person) =>
        onSelect ? (
          <button
            key={person.id}
            type="button"
            onClick={(e) => onSelect(person, e.currentTarget)}
            className="rounded-full transition-opacity hover:opacity-80"
          >
            <Avatar person={person} size={size} />
          </button>
        ) : (
          <Avatar key={person.id} person={person} size={size} />
        ),
      )}

      {rest > 0 && (
        <span
          className={cn("avatar shrink-0 tabular-nums", SIZE[size])}
          title={people
            .slice(shown.length)
            .map((p) => p.name)
            .join(", ")}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
