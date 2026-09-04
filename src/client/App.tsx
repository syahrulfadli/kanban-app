import { useEffect } from "react";
import { AuthPage } from "./components/AuthPage";
import { BoardView } from "./components/BoardView";
import { InvitePage } from "./components/InvitePage";
import { LandingPage } from "./components/LandingPage";
import { MembersPage } from "./components/MembersPage";
import { SettingsPage } from "./components/SettingsPage";
import { BottomNav } from "./components/BottomNav";
import { WorkspacePage } from "./components/WorkspacePage";
import { WorkspacesPage } from "./components/WorkspacesPage";
import {
  BoardSkeleton,
  ListPageSkeleton,
  SettingsPageSkeleton,
} from "./components/Skeleton";
import { useSession } from "./lib/auth-client";
import { cn } from "./lib/cn";
import { navigate, paths, useRoute, type Route } from "./lib/route";

/* Kerangka halaman. Kapsul navigasi hidup di sini, sekali untuk semua rute,
   supaya profil dan pengatur tema selalu ada di tempat yang sama.

   `fill` membedakan dua mode tata letak: papan kanban mengunci diri setinggi
   viewport dan menggulir di dalam kolomnya sendiri, sedangkan halaman daftar
   tumbuh ke bawah seperti dokumen biasa. Halaman yang menggulir menyisakan
   ruang di bawah karena kapsulnya `fixed` — tanpa itu ia menutupi baris
   terakhir; papan mengatur jaraknya sendiri di BoardView. Jaraknya menghitung
   kredit yang bisa keluar di bawah kapsul, bukan cuma kapsulnya. */
function Shell({ children, fill = false }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <div className={cn("flex flex-col", fill ? "h-dvh overflow-hidden" : "min-h-dvh pb-28")}>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      <BottomNav locked={fill} />
    </div>
  );
}

/* Kerangka halaman yang SEDANG dituju, bukan satu layar tunggu untuk semua.

   Alamatnya sudah diketahui sebelum sesinya selesai diperiksa, jadi tidak ada
   alasan menampilkan sesuatu yang generik: halaman berdiri lebih dulu dalam
   bentuk yang benar, lalu isinya menyusul ke tempat yang sudah disediakan. */
function RouteSkeleton({ route }: { route: Route }) {
  switch (route.name) {
    case "board":
      return <BoardSkeleton />;
    case "settings":
      return <SettingsPageSkeleton />;
    case "workspace":
    case "members":
      return <ListPageSkeleton crumb />;
    default:
      return <ListPageSkeleton />;
  }
}

/* Tampilan untuk yang belum punya sesi.

   Alamat menentukan mana dari dua halaman yang muncul: akar adalah halaman
   pengantar — orang yang baru mendarat belum tentu tahu kanban itu apa,
   apalagi kenapa harus mendaftar — sedangkan alamat lain berarti ia memang
   sedang menuju sesuatu di dalam aplikasi, jadi yang ditampilkan langsung
   halaman masuk.

   Dipakai dua kali di App (selagi sesi diperiksa, dan setelah pasti tidak
   ada), jadi elemennya harus disusun di satu tempat: dengan bentuk yang
   sama persis React menahannya apa adanya dan tidak ada yang berkedip. */
function signedOut(route: Route) {
  if (route.name === "workspaces") return <LandingPage />;
  return <AuthPage initialMode={route.name === "auth" ? route.mode : "login"} />;
}

/* Petunjuk sesi.

   Sesi baru pasti setelah satu perjalanan ke server, dan selama itu App harus
   memutuskan mau menampilkan apa. Menampilkan kerangka isi aplikasi kepada
   orang yang justru akan mendarat di halaman masuk adalah janji yang tidak
   ditepati — jadi keadaan terakhir yang diketahui dicatat di perangkat ini,
   dan itulah yang menentukan tebakan sementara.

   Catatannya cuma satu bit dan tidak pernah dipercaya sebagai izin: yang
   memutuskan tetap sesi dari server. Salah tebak paling banter menukar satu
   kedipan dengan kedipan yang lain. */
const SIGNED_IN_HINT = "kanban:pernah-masuk";

function wasSignedIn() {
  try {
    return localStorage.getItem(SIGNED_IN_HINT) === "1";
  } catch {
    // Penyimpanan bisa ditolak (mode privat, izin situs). Tanpa petunjuk,
    // tebakannya jatuh ke halaman masuk.
    return false;
  }
}

function rememberSignedIn(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(SIGNED_IN_HINT, "1");
    else localStorage.removeItem(SIGNED_IN_HINT);
  } catch {
    /* biarkan — ini cuma kenyamanan */
  }
}

export default function App() {
  const route = useRoute();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending) rememberSignedIn(Boolean(session));
  }, [isPending, session]);

  /* Halaman masuk tidak punya arti bagi yang sudah masuk. Alamatnya ditukar,
     bukan ditambahkan ke riwayat — kalau tidak, tombol kembali memantul ke
     halaman masuk yang langsung mengalihkan lagi. Cabang "auth" di bawah
     jatuh ke halaman workspace, elemen yang sama dengan tujuan pengalihan
     ini, jadi tidak ada yang berkedip selagi alamatnya menyusul. */
  useEffect(() => {
    if (!isPending && session && route.name === "auth") {
      navigate(paths.workspaces, { replace: true });
    }
  }, [isPending, session, route.name]);

  // Halaman undangan menangani sendiri kondisi belum-login, karena penerima
  // perlu melihat konteks undangan sebelum diminta membuat akun.
  if (route.name === "invite") {
    return (
      <Shell>
        <InvitePage token={route.token} />
      </Shell>
    );
  }

  /* Halaman pengantar tidak menunggu sesi dan tidak dihalangi olehnya.

     Isinya menjelaskan kanban dan aplikasinya — itu tidak berhenti berlaku
     begitu seseorang punya akun, dan tautan ke halaman ini yang dibuka orang
     yang kebetulan sudah masuk tidak boleh mendarat di tempat lain. Yang
     berubah cuma ajakannya: yang sudah masuk tidak perlu ditawari mendaftar.

     Selagi sesinya masih diperiksa, catatan di perangkat ini yang menebak —
     sama seperti yang dipakai cabang di bawah — supaya tombolnya tidak
     sempat berganti kata di depan mata. */
  if (route.name === "landing") {
    return (
      <Shell>
        <LandingPage signedIn={isPending ? wasSignedIn() : Boolean(session)} />
      </Shell>
    );
  }

  if (isPending) {
    /* Halaman masuk tidak menunggu apa pun, jadi ia langsung dipasang —
       elemennya sama persis dengan cabang di bawah, jadi React menyimpannya
       apa adanya begitu sesinya pasti dan tidak ada yang berkedip. */
    if (!wasSignedIn()) {
      return <Shell>{signedOut(route)}</Shell>;
    }

    return (
      <Shell fill={route.name === "board"}>
        <RouteSkeleton route={route} />
      </Shell>
    );
  }

  if (!session) {
    return <Shell>{signedOut(route)}</Shell>;
  }

  switch (route.name) {
    case "board":
      return (
        <Shell fill>
          {/* `key` memaksa remount saat pindah board, jadi state lama tidak terbawa. */}
          <BoardView key={route.boardId} boardId={route.boardId} openCardId={route.cardId} />
        </Shell>
      );
    case "workspace":
      return (
        <Shell>
          <WorkspacePage key={route.workspaceId} workspaceId={route.workspaceId} />
        </Shell>
      );
    case "members":
      return (
        <Shell>
          <MembersPage key={route.workspaceId} workspaceId={route.workspaceId} />
        </Shell>
      );
    case "settings":
      return (
        <Shell>
          <SettingsPage />
        </Shell>
      );
    default:
      return (
        <Shell>
          <WorkspacesPage />
        </Shell>
      );
  }
}
