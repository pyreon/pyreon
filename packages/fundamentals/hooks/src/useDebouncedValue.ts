import { onUnmount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'

/**
 * Return a debounced version of a reactive value.
 */
export function useDebouncedValue<T>(getter: () => T, delayMs: number): () => T {
  const debounced = signal<T>(getter())
  let timer: ReturnType<typeof setTimeout> | undefined

  effect(() => {
    const val = getter()
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(() => {
      debounced.set(val)
    }, delayMs)
  })

  onUnmount(() => {
    if (timer !== undefined) clearTimeout(timer)
  })

  return debounced
}
