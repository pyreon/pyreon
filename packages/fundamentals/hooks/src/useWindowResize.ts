import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

export interface WindowSize {
  width: number
  height: number
}

/**
 * Track window dimensions reactively.
 *
 * @param throttleMs - Throttle interval in ms (default 200). Set to 0 for debounce behavior.
 * @param mode - 'throttle' (default) fires at most once per interval. 'debounce' waits until resize stops.
 */
export function useWindowResize(
  throttleMs = 200,
  mode: 'throttle' | 'debounce' = 'debounce',
): () => WindowSize {
  const size = signal<WindowSize>({
    width: typeof window !== 'undefined' ? window.innerWidth : 0,
    height: typeof window !== 'undefined' ? window.innerHeight : 0,
  })

  let timer: ReturnType<typeof setTimeout> | undefined

  function onResize() {
    if (mode === 'debounce') {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        size.set({ width: window.innerWidth, height: window.innerHeight })
      }, throttleMs)
    } else {
      if (timer !== undefined) return
      timer = setTimeout(() => {
        timer = undefined
        size.set({ width: window.innerWidth, height: window.innerHeight })
      }, throttleMs)
    }
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
