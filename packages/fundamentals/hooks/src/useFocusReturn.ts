import { onMount } from '@pyreon/core'
import { isServer, watch } from '@pyreon/reactivity'

export interface UseFocusReturnOptions {
  /**
   * Explicit element to send focus back to on close. Defaults to whatever was
   * focused at the moment `isOpen` flipped true (typically the trigger button).
   * Provide this when the trigger may have unmounted by close time.
   */
  returnTo?: () => HTMLElement | null
}

/**
 * Return focus to the trigger when an overlay closes.
 *
 * The companion to {@link useFocusTrap}: while a modal / dialog / popover is
 * open you trap focus inside it; when it closes, keyboard and screen-reader
 * users must land back where they were instead of at the top of the page.
 * `useFocusReturn` captures the active element when `isOpen` becomes true and
 * restores focus to it when `isOpen` becomes false.
 *
 * Pass `isOpen` as a reactive getter so the hook tracks the open state. SSR-safe
 * (no-op on the server) and self-cleaning (the watcher is removed on unmount).
 *
 * @example
 * ```tsx
 * const open = signal(false)
 * useFocusReturn(() => open())      // focus returns to the opener on close
 * useFocusTrap(() => dialogEl)      // focus is trapped while open
 * ```
 */
export function useFocusReturn(
  isOpen: () => boolean,
  options: UseFocusReturnOptions = {},
): void {
  /* v8 ignore next — SSR/isServer guard; tests run with happy-dom */
  if (isServer) return

  let captured: HTMLElement | null = null

  onMount(() => {
    // Mounted already-open: capture the current trigger straight away.
    if (isOpen()) captured = document.activeElement as HTMLElement | null

    const stop = watch(isOpen, (open, wasOpen) => {
      if (open && !wasOpen) {
        captured = document.activeElement as HTMLElement | null
      } else if (!open && wasOpen) {
        const target = options.returnTo?.() ?? captured
        captured = null
        target?.focus?.()
      }
    })
    return stop
  })
}

export default useFocusReturn
