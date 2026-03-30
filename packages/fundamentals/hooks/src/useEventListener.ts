import { onCleanup } from '@pyreon/reactivity'

/**
 * Attach an event listener with automatic cleanup on unmount.
 * Works with Window, Document, HTMLElement, or any EventTarget.
 *
 * @example
 * ```tsx
 * useEventListener("keydown", (e) => {
 *   if (e.key === "Escape") close()
 * })
 *
 * useEventListener("scroll", handleScroll, { passive: true })
 *
 * // On a specific element:
 * useEventListener("click", handler, {}, () => buttonRef.current)
 * ```
 */
export function useEventListener<K extends keyof WindowEventMap>(
  event: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
  target?: () => EventTarget | null | undefined,
): void {
  const isBrowser = typeof window !== 'undefined'
  if (!isBrowser) return

  const el = target?.() ?? window
  el.addEventListener(event, handler as EventListener, options)
  onCleanup(() => el.removeEventListener(event, handler as EventListener, options))
}
