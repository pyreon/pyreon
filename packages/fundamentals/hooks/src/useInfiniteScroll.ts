import { onCleanup, signal } from "@pyreon/reactivity";

export interface UseInfiniteScrollOptions {
  /** Distance from bottom (px) to trigger load. Default: 100 */
  threshold?: number;
  /** Whether loading is in progress (prevents duplicate calls). */
  loading?: () => boolean;
  /** Whether there's more data to load. Default: true */
  hasMore?: () => boolean;
  /** Scroll direction. Default: "down" */
  direction?: "up" | "down";
}

export interface UseInfiniteScrollResult {
  /** Attach to the scroll container element. */
  ref: (el: HTMLElement | null) => void;
  /** Whether the sentinel is currently visible. */
  triggered: () => boolean;
}

/**
 * Signal-driven infinite scroll using IntersectionObserver.
 * Calls `onLoadMore` when the user scrolls near the end of the container.
 *
 * @example
 * ```tsx
 * const items = signal<Item[]>([])
 * const loading = signal(false)
 * const hasMore = signal(true)
 *
 * const { ref } = useInfiniteScroll(() => {
 *   loading.set(true)
 *   const next = await fetchMore()
 *   items.update(prev => [...prev, ...next])
 *   hasMore.set(next.length > 0)
 *   loading.set(false)
 * }, { loading, hasMore })
 *
 * <div ref={ref} style={{ overflowY: "auto", height: "400px" }}>
 *   <For each={items()} by={i => i.id}>
 *     {item => <div>{item.name}</div>}
 *   </For>
 * </div>
 * ```
 */
export function useInfiniteScroll(
  onLoadMore: () => void | Promise<void>,
  options?: UseInfiniteScrollOptions,
): UseInfiniteScrollResult {
  const threshold = options?.threshold ?? 100;
  const direction = options?.direction ?? "down";
  const triggered = signal(false);
  let observer: IntersectionObserver | null = null;
  let sentinel: HTMLDivElement | null = null;
  let containerEl: HTMLElement | null = null;

  const handleIntersect = (entries: IntersectionObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) return;

    triggered.set(entry.isIntersecting);

    if (entry.isIntersecting) {
      if (options?.loading?.()) return;
      if (options?.hasMore && !options.hasMore()) return;
      onLoadMore();
    }
  };

  const setup = (el: HTMLElement) => {
    cleanup();
    containerEl = el;

    // Create an invisible sentinel element at the scroll boundary
    sentinel = document.createElement("div");
    sentinel.style.height = "1px";
    sentinel.style.width = "100%";
    sentinel.style.pointerEvents = "none";
    sentinel.setAttribute("aria-hidden", "true");

    if (direction === "down") {
      el.appendChild(sentinel);
    } else {
      el.insertBefore(sentinel, el.firstChild);
    }

    observer = new IntersectionObserver(handleIntersect, {
      root: el,
      rootMargin:
        direction === "down" ? `0px 0px ${threshold}px 0px` : `${threshold}px 0px 0px 0px`,
      threshold: 0,
    });
    observer.observe(sentinel);
  };

  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (sentinel && containerEl) {
      sentinel.remove();
      sentinel = null;
    }
  };

  const ref = (el: HTMLElement | null) => {
    if (el) setup(el);
    else cleanup();
  };

  onCleanup(cleanup);

  return { ref, triggered };
}
