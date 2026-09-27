import { onMount, onUnmount } from '@pyreon/core'
import { effect, signal } from '@pyreon/reactivity'

/**
 * Subscribe to a CSS media query, returns a reactive boolean.
 *
 * `query` may be a getter: it is tracked from mount on, and a change
 * re-subscribes to the new query (a string was read once, so a reactive
 * breakpoint silently kept answering the first query).
 */
export function useMediaQuery(query: string | (() => string)): () => boolean {
  const matches = signal(false)
  const mounted = signal(false)
  const resolveQuery = typeof query === 'function' ? query : () => query

  const onChange = (e: MediaQueryListEvent) => {
    matches.set(e.matches)
  }

  const watch = effect(() => {
    if (!mounted()) return
    const mql = window.matchMedia(resolveQuery())
    matches.set(mql.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  })

  onMount(() => {
    mounted.set(true)
    return undefined
  })
  onUnmount(() => watch.dispose())

  return matches
}
