import { onMount, onUnmount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'

/**
 * Observe element intersection reactively.
 *
 * The element getter is TRACKED from mount on: when it reads a signal (a
 * signal-backed ref, a `<Show>`-gated element held in a signal), the observer
 * follows it — observing the element when it appears and switching when it
 * changes. It used to be read once in `onMount`, so an element that did not
 * exist yet at mount was never observed at all.
 */
export function useIntersection(
  getEl: () => HTMLElement | null,
  options?: IntersectionObserverInit,
): () => IntersectionObserverEntry | null {
  const entry = signal<IntersectionObserverEntry | null>(null)
  // Nothing is read before mount (a ref is still null during setup); the
  // effect below waits on this, then tracks `getEl()` for the component's life.
  const mounted = signal(false)

  const watch = effect(() => {
    if (!mounted()) return
    const el = getEl()
    if (!el) return
    const observer = new IntersectionObserver(([e]) => {
      if (e) entry.set(e)
    }, options)
    observer.observe(el)
    return () => observer.disconnect()
  })

  onMount(() => {
    mounted.set(true)
    return undefined
  })
  onUnmount(() => watch.dispose())

  return entry
}
