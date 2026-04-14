import { onMount } from '@pyreon/core'
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

  // Define listener inside `onMount` so the `window` reference is
  // co-located with its registration (both run only in the browser).
  // `onMount`'s return cleanup replaces the separate `onUnmount` call
  // and keeps `onResize` in closure for `removeEventListener`.
  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const onResize = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = undefined
        size.set({ width: window.innerWidth, height: window.innerHeight })
      }, debounceMs)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer !== undefined) clearTimeout(timer)
    }
  })

  return size
}
