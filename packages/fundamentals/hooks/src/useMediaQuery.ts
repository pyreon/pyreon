import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * Subscribe to a CSS media query, returns a reactive boolean.
 */
export function useMediaQuery(query: string): () => boolean {
  const matches = signal(false)
  let mql: MediaQueryList | undefined

  const onChange = (e: MediaQueryListEvent) => {
    matches.set(e.matches)
  }

  onMount(() => {
    mql = window.matchMedia(query)
    matches.set(mql.matches)
    mql.addEventListener('change', onChange)
    return undefined
  })

  onUnmount(() => {
    mql?.removeEventListener('change', onChange)
  })

  return matches
}
