import { onMount, onUnmount } from '@pyreon/core'
import { signal } from '@pyreon/reactivity'

/**
 * Inline reduced-motion check for kinetic package.
 * Avoids depending on @pyreon/hooks for a single media query.
 */
export function useReducedMotion(): () => boolean {
  const matches = signal(false)
  let mql: MediaQueryList | undefined

  const onChange = (e: MediaQueryListEvent) => {
    matches.set(e.matches)
  }

  onMount(() => {
    mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    matches.set(mql.matches)
    mql.addEventListener('change', onChange)
    return undefined
  })

  onUnmount(() => {
    mql?.removeEventListener('change', onChange)
  })

  return matches
}
