import { onMount, onUnmount } from "@pyreon/core";
import type { Signal } from "@pyreon/reactivity";
import { batch, effect, signal } from "@pyreon/reactivity";
import {
  observeWindowOffset,
  observeWindowRect,
  type VirtualItem,
  Virtualizer,
  type VirtualizerOptions,
  windowScroll,
} from "@tanstack/virtual-core";

export type UseWindowVirtualizerOptions<TItemElement extends Element> = () => Omit<
  VirtualizerOptions<Window, TItemElement>,
  "observeElementRect" | "observeElementOffset" | "scrollToFn" | "getScrollElement"
> &
  Partial<
    Pick<
      VirtualizerOptions<Window, TItemElement>,
      "observeElementRect" | "observeElementOffset" | "scrollToFn"
    >
  >;

export interface UseWindowVirtualizerResult<TItemElement extends Element> {
  instance: Virtualizer<Window, TItemElement>;
  virtualItems: Signal<VirtualItem[]>;
  totalSize: Signal<number>;
  isScrolling: Signal<boolean>;
}

/**
 * Create a reactive TanStack Virtual virtualizer for window-based scrolling.
 *
 * @example
 * const virtual = useWindowVirtualizer(() => ({
 *   count: 10000,
 *   estimateSize: () => 35,
 * }))
 */
export function useWindowVirtualizer<TItemElement extends Element>(
  options: UseWindowVirtualizerOptions<TItemElement>,
): UseWindowVirtualizerResult<TItemElement> {
  const virtualItems = signal<VirtualItem[]>([]);
  const totalSize = signal(0);
  const isScrolling = signal(false);

  const resolvedOptions: VirtualizerOptions<Window, TItemElement> = {
    observeElementRect: observeWindowRect,
    observeElementOffset: observeWindowOffset,
    scrollToFn: windowScroll,
    initialOffset: typeof document !== "undefined" ? window.scrollY : 0,
    getScrollElement: () => (typeof window !== "undefined" ? window : (null as unknown as Window)),
    ...options(),
  };

  // Store latest user options so onChange always reads the freshest reference
  let latestUserOpts = options();

  const instance = new Virtualizer<Window, TItemElement>(resolvedOptions);

  const effectCleanup = effect(() => {
    latestUserOpts = options();
    instance.setOptions({
      ...instance.options,
      ...latestUserOpts,
      onChange: (inst, sync) => {
        batch(() => {
          virtualItems.set(inst.getVirtualItems());
          totalSize.set(inst.getTotalSize());
          isScrolling.set(inst.isScrolling);
        });
        // Read latest opts to avoid stale closure
        latestUserOpts.onChange?.(inst, sync);
      },
    });

    instance._willUpdate();
    batch(() => {
      virtualItems.set(instance.getVirtualItems());
      totalSize.set(instance.getTotalSize());
    });
  });

  let mountCleanup: (() => void) | undefined;
  onMount(() => {
    mountCleanup = instance._didMount();
    instance._willUpdate();
    batch(() => {
      virtualItems.set(instance.getVirtualItems());
      totalSize.set(instance.getTotalSize());
    });
    return undefined;
  });

  onUnmount(() => {
    effectCleanup.dispose();
    mountCleanup?.();
  });

  return { instance, virtualItems, totalSize, isScrolling };
}
