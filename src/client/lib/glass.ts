/* Pelacak cahaya kaca.

   Setiap pane menerima arah cahaya yang sama dari satu "sumber" — posisi
   kursor — jadi cincin spekular dan kilau permukaannya kompak, seolah
   seluruh halaman diterangi lampu yang sama. Tanpa ini kaca terlihat mati:
   gradient statis membuat semua pane tampak identik dan datar.

   Yang ditulis hanya custom property di pseudo-element (--glass-ang,
   --glass-hx, --glass-hy). Isian dan backdrop-filter pane tidak pernah
   disentuh, supaya backdrop yang mahal itu tetap ter-cache. */

const SELECTOR = ".glass";


export function startGlassTracker(): () => void {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  // Tanpa pointer presisi tidak ada kursor untuk diikuti; nilai default di CSS
  // sudah memberi pencahayaan yang masuk akal.
  if (!matchMedia("(pointer: fine)").matches) return () => {};

  let panes: HTMLElement[] = [];
  const onScreen = new WeakSet<HTMLElement>();
  let px = innerWidth / 2;
  let py = innerHeight / 3;
  let queued = false;
  let collectQueued = false;

  // Hanya pane yang terlihat yang diperbarui. Sisanya cuma tulisan style yang
  // tidak bisa dilihat siapa pun.
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) onScreen.add(el);
        else onScreen.delete(el);
      }
      schedule();
    },
    { rootMargin: "15% 0px" },
  );

  // React membongkar-pasang pane (kolom, kartu, halaman), jadi daftarnya
  // dikumpulkan ulang setiap kali DOM berubah — sekali per frame, bukan per
  // mutasi.
  function collect() {
    collectQueued = false;
    io.disconnect();
    panes = [...document.querySelectorAll<HTMLElement>(SELECTOR)];
    for (const el of panes) io.observe(el);
    schedule();
  }

  function paint() {
    queued = false;

    for (const el of panes) {
      if (!onScreen.has(el)) continue;

      /* Kotak diukur ulang tiap frame, bukan di-cache terhadap scrollX/scrollY:
         kolom hidup di dalam papan yang bisa digeser sendiri, jadi posisinya
         berubah tanpa jendela ikut menggulir. Pane-nya sedikit, dan pembacaan
         layout ini hanya terjadi sekali per frame animasi. */
      const r = el.getBoundingClientRect();
      const w = r.width || 1;
      const h = r.height || 1;
      const dx = px - (r.left + w / 2);
      const dy = py - (r.top + h / 2);

      /* Sudut gradient CSS berjalan searah jarum jam dari "atas", dan stop 0%
         berada di seberang arahnya — jadi arahkan menjauhi kursor supaya
         bibir terang mendarat di sisi yang kena cahaya. */
      const ang = (Math.atan2(-dx, dy) * 180) / Math.PI;

      /* Posisi kilau, dijepit sedikit di luar pane supaya sorotannya bisa
         meninggalkan permukaan alih-alih menempel di tepi. */
      const hx = Math.max(-40, Math.min(140, (dx / w + 0.5) * 100));
      const hy = Math.max(-60, Math.min(160, (dy / h + 0.5) * 100));

      const st = el.style;
      st.setProperty("--glass-ang", `${ang.toFixed(1)}deg`);
      st.setProperty("--glass-hx", `${hx.toFixed(1)}%`);
      st.setProperty("--glass-hy", `${hy.toFixed(1)}%`);
    }
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(paint);
  }

  function scheduleCollect() {
    if (collectQueued) return;
    collectQueued = true;
    requestAnimationFrame(collect);
  }

  const onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
    px = e.clientX;
    py = e.clientY;
    schedule();
  };
  const onScroll = () => schedule();
  const onResize = () => schedule();

  const mo = new MutationObserver(scheduleCollect);
  mo.observe(document.body, { childList: true, subtree: true });

  addEventListener("pointermove", onPointer, { passive: true });
  // `capture` menangkap juga gulir di dalam kolom, bukan cuma di jendela.
  addEventListener("scroll", onScroll, { passive: true, capture: true });
  addEventListener("resize", onResize, { passive: true });

  collect();

  return () => {
    mo.disconnect();
    io.disconnect();
    removeEventListener("pointermove", onPointer);
    removeEventListener("scroll", onScroll, { capture: true });
    removeEventListener("resize", onResize);
  };
}
