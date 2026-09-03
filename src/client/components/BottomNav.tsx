import { CreditFooter } from "./CreditFooter";
import { NotificationBell } from "./NotificationBell";
import { ProfileMenu } from "./ProfileMenu";
import { ThemeSwitch } from "./ThemeSwitch";
import { useCreditReveal } from "../hooks/useCreditReveal";

/* Kapsul navigasi. Mengambang: tidak menyentuh sisi mana pun, jadi latar
   halaman lewat di keempat tepinya dan kapsul terbaca sebagai benda di atas
   halaman, bukan potongan dari halaman.

   Kapsul dan kredit disusun sebagai satu tumpukan yang berlabuh di dasar
   layar. Karena kreditnya anak terakhir, laci yang membuka mendorong kapsul
   naik dengan sendirinya — persis sebanyak yang dibutuhkan supaya kapsul
   tidak menghalangi barisan kreditnya.

   `locked` diteruskan apa adanya ke pengungkap kredit: papan kanban tidak
   punya gulir dokumen, jadi di sana kreditnya selalu harus ditarik. */
export function BottomNav({ locked = false }: { locked?: boolean }) {
  const open = useCreditReveal(locked);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex flex-col items-center px-4 pb-5">
      <nav className="glass glass-frost pointer-events-auto flex items-center gap-2 rounded-full p-1.5">
        <NotificationBell />
        <ProfileMenu />
        <ThemeSwitch />
      </nav>

      <CreditFooter open={open} />
    </div>
  );
}
