import { onMount, onUnmount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'

export interface Size {
  width: number
  height: number
}

/**
 * Observe element dimensions reactively via ResizeObserver.
 *
 * The element getter is TRACKED from mount on, so an element that appears
 * (or changes) after mount is measured — see `useIntersection`.
 */
export function useElementSize(getEl: () => HTMLElement | null): () => Size {
  const size = signal<Size>({ width: 0, height: 0 })
  const mounted = signal(false)

  const watch = effect(() => {
    if (!mounted()) return
    const el = getEl()
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      size.set({ width, height })
    })
    observer.observe(el)

    // Initial measurement
    const rect = el.getBoundingClientRect()
    size.set({ width: rect.width, height: rect.height })
    return () => observer.disconnect()
  })

  onMount(() => {
    mounted.set(true)
    return undefined
  })
  onUnmount(() => watch.dispose())

  return size
}
