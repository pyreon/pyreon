import { onUnmount } from '@pyreon/core'
import { effect, isServer, signal } from '@pyreon/reactivity'

/**
 * Return a debounced version of a reactive value.
 */
export function useDebouncedValue<T>(getter: () => T, delayMs: number): () => T {
  const debounced = signal<T>(getter())
  // Server render: the value is already the initial one; a trailing timer
  // would fire after render and keep the process alive.
  if (isServer) return debounced
  let timer: ReturnType<typeof setTimeout> | undefined

  effect(() => {
    const val = getter()
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.set(val)
    }, delayMs)
  })

  onUnmount(() => {
    /* v8 ignore next — defensive timer cleanup; both timer states counted as separate paths */
    if (timer !== undefined) clearTimeout(timer)
  })

  return debounced
}
