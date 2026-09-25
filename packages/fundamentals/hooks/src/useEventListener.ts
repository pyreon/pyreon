import { onMount } from '@pyreon/core'
import { isClient } from '@pyreon/reactivity'
import { onHookCleanup } from './lifecycle'

/** Where to listen: an `EventTarget`, or a getter resolved at mount (a ref). */
export type EventListenerTarget = EventTarget | (() => EventTarget | null | undefined)

/**
 * Attach an event listener with automatic cleanup on unmount.
 * Works with Window, Document, HTMLElement, or any EventTarget.
 *
 * With no `target` the listener goes on `window`. When a `target` IS given it
 * is never silently replaced by `window`: a getter that returns `null` during
 * component setup (the normal state of a ref — the element does not exist
 * yet) is resolved again at MOUNT, and if it is still `null` then, nothing is
 * bound and a dev warning names the cause. Falling back to `window` turned an
 * element-scoped `click` handler into a page-wide one.
 *
 * @example
 * ```tsx
 * useEventListener("keydown", (e) => {
 *   if (e.key === "Escape") close()
 * })
 *
 * useEventListener("scroll", handleScroll, { passive: true })
 *
 * // On a specific element (a ref getter, resolved at mount):
 * const button = elementRef<HTMLButtonElement>()
 * useEventListener("click", handler, {}, button)
 * ```
 */
export function useEventListener<K extends keyof WindowEventMap>(
  event: K,
  handler: (e: WindowEventMap[K]) => void,
  options?: boolean | AddEventListenerOptions,
  target?: EventListenerTarget,
): void {
  if (!isClient) return

  let bound: EventTarget | null = null
  const bind = (el: EventTarget): void => {
    bound = el
    el.addEventListener(event, handler as EventListener, options)
  }
  const resolve = (): EventTarget | null | undefined =>
    typeof target === 'function' ? target() : target

  if (target === undefined) {
    bind(window)
  } else {
    const now = resolve()
    if (now) {
      bind(now)
    } else {
      onMount(() => {
        const el = resolve()
        if (el) {
          bind(el)
        } else if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Pyreon] useEventListener("${String(event)}"): the target resolved to null after mount, so no listener was attached. ` +
              'Pass the ref the element is actually bound to, or omit the target to listen on window.',
          )
        }
        return undefined
      })
    }
  }

  onHookCleanup(() => {
    bound?.removeEventListener(event, handler as EventListener, options)
    bound = null
  })
}
