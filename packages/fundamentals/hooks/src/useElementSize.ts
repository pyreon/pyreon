import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export interface Size {
  width: number
  height: number
}

/**
 * Observe element dimensions reactively via ResizeObserver.
 */
export function useElementSize(getEl: () => HTMLElement | null): () => Size {
  const size = signal<Size>({ width: 0, height: 0 })
  let observer: ResizeObserver | undefined

  onMount(() => {
    const el = getEl()
    if (!el) return undefined

    observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      const { width, height } = entry.contentRect
      size.set({ width, height })
    })
    observer.observe(el)

    // Initial measurement
    const rect = el.getBoundingClientRect()
    size.set({ width: rect.width, height: rect.height })
    return undefined
  })

  onUnmount(() => {
    observer?.disconnect()
  })

  return size
}
