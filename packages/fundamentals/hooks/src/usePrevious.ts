import { effect, signal } from '@pyreon/reactivity'

/**
 * Track the previous value of a reactive getter.
 * Returns undefined on first access.
 */
export function usePrevious<T>(getter: () => T): () => T | undefined {
  const prev = signal<T | undefined>(undefined)
  let current: T | undefined

  effect(() => {
    const next = getter()
    prev.set(current)
    current = next
  })

  return prev
}
