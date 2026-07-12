import { onMount } from '@pyreon/core'
import { isClient, signal } from '@pyreon/reactivity'

export interface ScrollPosition {
  x: number
  y: number
}

export interface UseWindowScrollResult {
  /** Reactive `{ x, y }` scroll offset. Read by calling: `position().y`. */
  position: () => ScrollPosition
  /** Programmatic scroll. Omitted axes keep their current value. SSR-safe. */
  scrollTo: (options: { x?: number; y?: number; behavior?: ScrollBehavior }) => void
}

/**
 * Track the window scroll position reactively (passive `scroll` listener,
 * auto-cleaned on unmount) plus an SSR-safe imperative `scrollTo`.
 *
 * Common uses: scroll-to-top buttons, scroll-progress bars, sticky-header
 * reveal, parallax offsets.
 *
 * @example
 * ```tsx
 * const { position, scrollTo } = useWindowScroll()
 *
 * <Show when={() => position().y > 400}>
 *   <button onClick={() => scrollTo({ y: 0, behavior: 'smooth' })}>Top</button>
 * </Show>
 * ```
 */
export function useWindowScroll(): UseWindowScrollResult {
  const position = signal<ScrollPosition>({
    x: isClient ? window.scrollX : 0,
    y: isClient ? window.scrollY : 0,
  })

  // Listener defined inside `onMount` so the `window` reference is co-located
  // with its browser-only registration; cleanup returns from `onMount`.
  onMount(() => {
    const onScroll = () => position.set({ x: window.scrollX, y: window.scrollY })
    // Sync once in case the page scrolled between setup and mount.
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  })

  const scrollTo = (options: { x?: number; y?: number; behavior?: ScrollBehavior }): void => {
    if (!isClient) return
    const opts: ScrollToOptions = {
      left: options.x ?? window.scrollX,
      top: options.y ?? window.scrollY,
    }
    if (options.behavior !== undefined) opts.behavior = options.behavior
    window.scrollTo(opts)
  }

  return { position, scrollTo }
}

export default useWindowScroll
