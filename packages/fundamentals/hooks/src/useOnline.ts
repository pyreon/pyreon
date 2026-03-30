import { onCleanup, signal } from "@pyreon/reactivity";

/**
 * Reactive online/offline status.
 * Tracks `navigator.onLine` and updates on connectivity changes.
 *
 * @example
 * ```tsx
 * const online = useOnline()
 * <Show when={!online()} fallback={<App />}>
 *   <OfflineBanner />
 * </Show>
 * ```
 */
export function useOnline(): () => boolean {
  const isBrowser = typeof window !== "undefined";
  const online = signal(isBrowser ? navigator.onLine : true);

  if (isBrowser) {
    const setOnline = () => online.set(true);
    const setOffline = () => online.set(false);
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    onCleanup(() => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    });
  }

  return online;
}
