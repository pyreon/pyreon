import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export interface WindowSize {
  width: number
  height: number
}

/**
 * Track window dimensions reactively with debouncing.
 * Fires once after resize stops — guarantees the final dimensions.
 *
 * @param debounceMs - Wait time after last resize event (default 200ms)
 */
export function useWindowResize(debounceMs = 200): () => WindowSize {
  const size = signal<WindowSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  })

  let timer: ReturnType<typeof setTimeout> | undefined

  function onResize() {
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = undefined
      size.set({ width: window.innerWidth, height: window.innerHeight })
    }, debounceMs)
  }

  onMount(() => {
    window.addEventListener('resize', onResize)
    return undefined
  })

  onUnmount(() => {
    window.removeEventListener('resize', onResize)
    if (timer !== undefined) clearTimeout(timer)
  })

  return size
}
