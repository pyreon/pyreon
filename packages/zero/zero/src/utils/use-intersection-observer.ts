import { onMount, onUnmount } from '@pyreon/core'

/**
 * Observes an element and calls `onIntersect` once it enters the viewport.
 * Automatically disconnects after the first intersection.
 *
 * @param getElement - Getter for the target element (may be undefined before mount).
 * @param onIntersect - Callback fired when the element becomes visible.
 * @param rootMargin - IntersectionObserver rootMargin. Default: "200px".
 */
export function useIntersectionObserver(
  getElement: () => HTMLElement | undefined,
  onIntersect: () => void,
  rootMargin = '200px',
) {
  onMount(() => {
    const el = getElement()
    if (!el) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            onIntersect()
            observer.disconnect()
          }
        }
      },
      { rootMargin },
    )

    observer.observe(el)
    onUnmount(() => observer.disconnect())
    return undefined
  })
}
