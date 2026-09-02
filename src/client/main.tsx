import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { UndoProvider } from "./components/UndoToasts";
import { startGlassTracker } from "./lib/glass";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* Toast urung dipasang di akar: penghapusan boleh terjadi di halaman
        mana pun, dan jendela urungnya harus selamat melewati pindah rute. */}
    <UndoProvider>
      <App />
    </UndoProvider>
  </StrictMode>,
);

// Di luar React: pelacak ini menulis custom property langsung ke elemen kaca,
// jadi tidak ada gunanya melewati render.
startGlassTracker();

/* Service worker: penerima notifikasi push saat aplikasinya tidak terbuka,
   sekaligus yang membuat aplikasi ini bisa dipasang ke layar utama.

   Didaftarkan setelah halaman selesai memuat supaya tidak berebut jaringan
   dengan permintaan pertama papan. Gagal mendaftar bukan perkara besar —
   aplikasinya jalan seperti biasa, notifikasinya saja yang tidak ada. */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
