import { onMount, onUnmount } from "@pyreon/core";
import { signal } from "@pyreon/reactivity";

/**
 * Observe element intersection reactively.
 */
export function useIntersection(
  getEl: () => HTMLElement | null,
  options?: IntersectionObserverInit,
): () => IntersectionObserverEntry | null {
  const entry = signal<IntersectionObserverEntry | null>(null);
  let observer: IntersectionObserver | undefined;

  onMount(() => {
    const el = getEl();
    if (!el) return undefined;

    observer = new IntersectionObserver(([e]) => {
      if (e) entry.set(e);
    }, options);
    observer.observe(el);
    return undefined;
  });

  onUnmount(() => {
    observer?.disconnect();
  });

  return entry;
}
