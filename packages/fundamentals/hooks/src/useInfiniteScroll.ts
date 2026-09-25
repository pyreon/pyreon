import { type Effect, effect, isServer, runUntracked, signal } from '@pyreon/reactivity'
import { onHookCleanup } from './lifecycle'

export interface UseInfiniteScrollOptions {
  /** Distance from bottom (px) to trigger load. Default: 100 */
  threshold?: number
  /** Whether loading is in progress (prevents duplicate calls). */
  loading?: () => boolean
  /** Whether there's more data to load. Default: true */
  hasMore?: () => boolean
  /** Scroll direction. Default: "down" */
  direction?: 'up' | 'down'
}

export interface UseInfiniteScrollResult {
  /** Attach to the scroll container element. */
  ref: (el: HTMLElement | null) => void
  /** Whether the sentinel is currently visible. */
  triggered: () => boolean
}

/**
 * Signal-driven infinite scroll using IntersectionObserver.
 * Calls `onLoadMore` when the user scrolls near the end of the container.
 *
 * @example
 * ```tsx
 * const items = signal<Item[]>([])
 * const loading = signal(false)
 * const hasMore = signal(true)
 *
 * const { ref } = useInfiniteScroll(async () => {
 *   loading.set(true)
 *   const next = await fetchMore()
 *   items.update(prev => [...prev, ...next])
 *   hasMore.set(next.length > 0)
 *   loading.set(false)
 * }, { loading, hasMore })
 *
 * <div ref={ref} style={{ overflowY: "auto", height: "400px" }}>
 *   <For each={items()} by={i => i.id}>
 *     {item => <div>{item.name}</div>}
 *   </For>
 * </div>
 * ```
 */
export function useInfiniteScroll(
  onLoadMore: () => void | Promise<void>,
  options?: UseInfiniteScrollOptions,
): UseInfiniteScrollResult {
  const threshold = options?.threshold ?? 100
  const direction = options?.direction ?? 'down'
  const triggered = signal(false)
  let observer: IntersectionObserver | null = null
  let sentinel: HTMLDivElement | null = null
  let containerEl: HTMLElement | null = null
  let loadingWatch: Effect | null = null

  // True while a promise returned by `onLoadMore` is pending. Without it an
  // intersection callback arriving mid-load (a resize, a re-observe) started a
  // second, concurrent load of the same page.
  let inFlight = false

  // An IntersectionObserver only reports CHANGES. When a page lands but does
  // not fill the container, the sentinel is still visible — no change — so no
  // further callback ever arrives and the list stalls after the first page.
  // Re-observing asks for a fresh report of the current state.
  const recheck = () => {
    if (observer && sentinel && triggered.peek()) {
      observer.unobserve(sentinel)
      observer.observe(sentinel)
    }
  }

  const handleIntersect = (entries: IntersectionObserverEntry[]) => {
    const entry = entries[0]
    if (!entry) return

    triggered.set(entry.isIntersecting)

    if (entry.isIntersecting) {
      if (inFlight) return
      if (options?.loading?.()) return
      if (options?.hasMore && !options.hasMore()) return
      const result = onLoadMore()
      if (result && typeof (result as Promise<void>).then === 'function') {
        inFlight = true
        void (result as Promise<void>).then(
          () => {
            inFlight = false
            recheck()
          },
          () => {
            // A failed load must not retry in a tight loop; the next real
            // intersection change starts the next attempt.
            inFlight = false
          },
        )
      }
    }
  }

  const setup = (el: HTMLElement) => {
    // Defensive: ref callbacks only fire in the browser, but the early
    // return makes the SSR-safety contract explicit (and silences SSR
    // lint rules that can't trace `setup` → `ref` → DOM-mount).
    if (isServer || typeof IntersectionObserver === 'undefined') return
    cleanup()
    containerEl = el

    // Create an invisible sentinel element at the scroll boundary
    sentinel = document.createElement('div')
    sentinel.style.height = '1px'
    sentinel.style.width = '100%'
    sentinel.style.pointerEvents = 'none'
    sentinel.setAttribute('aria-hidden', 'true')

    if (direction === 'down') {
      el.appendChild(sentinel)
    } else {
      el.insertBefore(sentinel, el.firstChild)
    }

    observer = new IntersectionObserver(handleIntersect, {
      root: el,
      rootMargin:
        direction === 'down' ? `0px 0px ${threshold}px 0px` : `${threshold}px 0px 0px 0px`,
      threshold: 0,
    })
    observer.observe(sentinel)

    // A synchronous `onLoadMore` that drives a `loading` signal finishes when
    // that signal returns to false — re-check then, for the same stall.
    const loading = options?.loading
    if (loading) {
      let was = runUntracked(loading)
      loadingWatch = effect(() => {
        const now = loading()
        if (was && !now) runUntracked(recheck)
        was = now
      })
    }
  }

  const cleanup = () => {
    loadingWatch?.dispose()
    loadingWatch = null
    if (observer) {
      observer.disconnect()
      observer = null
    }
    if (sentinel && containerEl) {
      sentinel.remove()
      sentinel = null
    }
  }

  const ref = (el: HTMLElement | null) => {
    if (el) setup(el)
    else cleanup()
  }

  onHookCleanup(cleanup)

  return { ref, triggered }
}
