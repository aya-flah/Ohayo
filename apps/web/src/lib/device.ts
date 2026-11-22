import { useEffect, useState, useSyncExternalStore } from 'react';

/** Online/offline, from the browser. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener('online', cb);
      window.addEventListener('offline', cb);
      return () => {
        window.removeEventListener('online', cb);
        window.removeEventListener('offline', cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** A short haptic tap on phones (native inside the Android app, vibration on the web). */
export async function tap(style: 'light' | 'medium' | 'heavy' = 'light') {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      await Haptics.impact({ style: style === 'heavy' ? ImpactStyle.Heavy : style === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light });
      return;
    }
    navigator.vibrate?.(style === 'heavy' ? 30 : 12);
  } catch {
    /* haptics are a nicety */
  }
}

/** True on phone-width screens (< 768 px): used to keep animations light where GPUs are small. */
export function useIsPhone(): boolean {
  const query = '(max-width: 767px)';
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setPhone(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return phone;
}

/** Phones in either orientation: narrow screens, or short landscape screens. The 3D pages fold their cards here. */
export function useCompactScreen(): boolean {
  const query = '(max-width: 767px), (orientation: landscape) and (max-height: 520px)';
  const [on, setOn] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const change = () => setOn(m.matches);
    m.addEventListener('change', change);
    return () => m.removeEventListener('change', change);
  }, []);
  return on;
}
