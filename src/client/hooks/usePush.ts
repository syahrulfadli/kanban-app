import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { useT } from "./useLanguage";
import {
  currentSubscription,
  detectSupport,
  disablePush,
  enablePush,
  PushSetupError,
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
  const t = useT();
  const [support] = useState<PushSupport>(detectSupport);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Yang bisa dicoba pengguna, dan bunyi asli dari browser untuk dilaporkan. */
  const [errorHints, setErrorHints] = useState<string[]>([]);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
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
        if (alive.current) setError(e instanceof Error ? e.message : t.push.loadSettingsError);
      } finally {
        if (alive.current) setLoading(false);
      }
    })();
  }, [t]);

  /**
   * Kegagalan yang sudah membawa alasannya sendiri (lihat PushSetupError)
   * diterjemahkan lewat kamus bahasa; sisanya cukup kalimatnya.
   */
  const fail = useCallback(
    (e: unknown, fallback: string) => {
      if (!alive.current) return;

      if (e instanceof PushSetupError) {
        const info = t.pushErrors[e.reason];
        setError(info.message);
        setErrorHints(info.hints);
        setErrorDetail(e.detail);
      } else {
        setError(e instanceof Error ? e.message : fallback);
        setErrorHints([]);
        setErrorDetail(null);
      }
    },
    [t],
  );

  /** Bungkus aksi yang menyentuh jaringan: satu pada satu waktu, pesan seragam. */
  const run = useCallback(
    async (action: () => Promise<string | null>) => {
      setBusy(true);
      setError(null);
      setErrorHints([]);
      setErrorDetail(null);
      setNotice(null);
      try {
        const message = await action();
        if (alive.current) setNotice(message);
      } catch (e) {
        fail(e, t.common.errorGeneric);
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [fail, t],
  );

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
        fail(e, t.push.savePrefError);
      }
    },
    [fail, prefs, t],
  );

  const test = useCallback(async () => {
    await run(async () => {
      const subscription = await currentSubscription();
      if (!subscription) throw new Error(t.push.notSubscribed);

      await api.sendTestPush(subscription.endpoint);
      return t.push.testSent;
    });
  }, [run, t]);

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
    errorHints,
    errorDetail,
    notice,
    enable,
    disable,
    setPref,
    test,
  };
}
