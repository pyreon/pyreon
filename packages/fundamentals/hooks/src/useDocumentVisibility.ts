import { onMount } from '@pyreon/core'
import { isClient, signal } from '@pyreon/reactivity'

export type DocumentVisibility = 'visible' | 'hidden'

/**
 * Track the Page Visibility state (`document.visibilityState`) reactively.
 * `'hidden'` when the tab is backgrounded / minimized, `'visible'` otherwise.
 *
 * Use it to pause work the user can't see — polling, video playback,
 * animations, expensive timers — and resume on return.
 *
 * SSR-safe (returns `'visible'` on the server) and self-cleaning (the
 * `visibilitychange` listener is removed on unmount).
 *
 * @example
 * ```tsx
 * const visibility = useDocumentVisibility()
 * effect(() => {
 *   if (visibility() === 'hidden') pausePolling()
 *   else resumePolling()
 * })
 * ```
 */
export function useDocumentVisibility(): () => DocumentVisibility {
  const visibility = signal<DocumentVisibility>(
    isClient ? (document.visibilityState as DocumentVisibility) : 'visible',
  )

  onMount(() => {
    const onChange = () => visibility.set(document.visibilityState as DocumentVisibility)
    // Sync once in case visibility changed between setup and mount.
    onChange()
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  })

  return visibility
}

export default useDocumentVisibility
