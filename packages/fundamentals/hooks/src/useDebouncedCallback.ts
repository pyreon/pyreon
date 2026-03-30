import { onUnmount } from '@pyreon/core'

type DebouncedFn<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void
  cancel: () => void
  flush: () => void
}

export type UseDebouncedCallback = <T extends (...args: any[]) => any>(
  callback: T,
  delay: number,
) => DebouncedFn<T>

/**
 * Returns a debounced version of the callback.
 * The returned function has `.cancel()` and `.flush()` methods.
 * Always calls the latest callback (no stale closures).
 * Cleans up on unmount.
 */
export const useDebouncedCallback: UseDebouncedCallback = (callback, delay) => {
  const currentCallback = callback
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastArgs: any[] | null = null

  const cancel = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
    lastArgs = null
  }

  const flush = () => {
    if (timer != null && lastArgs != null) {
      clearTimeout(timer)
      timer = null
      currentCallback(...lastArgs)
      lastArgs = null
    }
  }

  const debounced = (...args: any[]) => {
    lastArgs = args
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      currentCallback(...args)
      lastArgs = null
    }, delay)
  }

  onUnmount(() => cancel())

  return Object.assign(debounced, { cancel, flush }) as DebouncedFn<typeof callback>
}

export default useDebouncedCallback
