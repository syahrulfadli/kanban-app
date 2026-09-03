import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import {
  currentSubscription,
  detectSupport,
  disablePush,
  enablePush,
  type PushSupport,
} from "../lib/push";
import { DEFAULT_NOTIFICATION_SETTINGS, type NotificationSettings } from "../../shared/types";

/**
 * Keadaan notifikasi perangkat ini, sudah menggabungkan tiga sumber yang
 * gampang berselisih: izin browser, langganan yang tersimpan di perangkat, dan
 * pilihan yang tersimpan di server.
 *
 * Yang menentukan "aktif" adalah ada-tidaknya langganan di perangkat — izin
 * yang sudah diberikan tapi langganannya dicabut tetap berarti mati.
 */
export function usePush() {
  const [support] = useState<PushSupport>(detectSupport);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Setelah komponennya dilepas, tidak ada state yang boleh disentuh lagi.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const [settings, subscription] = await Promise.all([
          api.getPushSettings(),
          currentSubscription(),
        ]);

        if (!alive.current) return;
        setPublicKey(settings.publicKey);
        setPrefs(settings.prefs);
        // Pendaftaran ulang diam-diam bukan tugas hook ini: ProfileMenu
        // melakukannya sekali tiap aplikasi dibuka, di semua halaman.
        setEnabled(subscription !== null);
      } catch (e) {
        if (alive.current) setError(e instanceof Error ? e.message : "Gagal memuat pengaturan");
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
  }, []);

  /** Bungkus aksi yang menyentuh jaringan: satu pada satu waktu, pesan seragam. */
  const run = useCallback(async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const message = await action();
      if (alive.current) setNotice(message);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : "Terjadi kesalahan");
    } finally {
      if (alive.current) setBusy(false);
    }
  }, []);

  const enable = useCallback(async () => {
    if (!publicKey) return;
    await run(async () => {
      await enablePush(publicKey);
      if (alive.current) setEnabled(true);
      return null;
    });
  }, [publicKey, run]);

  const disable = useCallback(async () => {
    await run(async () => {
      await disablePush();
      if (alive.current) setEnabled(false);
      return null;
    });
  }, [run]);

  const setPref = useCallback(
    async (key: keyof NotificationSettings, value: boolean) => {
      // Sakelarnya bergerak seketika; kalau server menolak, ia kembali sendiri.
      const previous = prefs;
      setPrefs({ ...prefs, [key]: value });

      try {
        const saved = await api.updateNotificationPrefs({ [key]: value });
        if (alive.current) setPrefs(saved);
      } catch (e) {
        if (!alive.current) return;
        setPrefs(previous);
        setError(e instanceof Error ? e.message : "Gagal menyimpan pilihan");
      }
    },
    [prefs],
  );

  const test = useCallback(async () => {
    await run(async () => {
      const subscription = await currentSubscription();
      if (!subscription) throw new Error("Perangkat ini belum berlangganan");

      await api.sendTestPush(subscription.endpoint);
      return "Notifikasi percobaan dikirim.";
    });
  }, [run]);

  return {
    support,
    /** Server sudah punya kunci VAPID — tanpa ini fiturnya tidak ditawarkan. */
    available: publicKey !== null,
    /** Izin pernah ditolak; browser tidak akan menanyakannya lagi. */
    blocked: support === "ok" && Notification.permission === "denied",
    loading,
    busy,
    enabled,
    prefs,
    error,
    notice,
    enable,
    disable,
    setPref,
    test,
  };
}
