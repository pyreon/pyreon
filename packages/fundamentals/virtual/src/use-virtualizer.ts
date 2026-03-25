import { onMount, onUnmount } from "@pyreon/core"
import type { Signal } from "@pyreon/reactivity"
import { batch, effect, signal } from "@pyreon/reactivity"
import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type VirtualItem,
  Virtualizer,
  type VirtualizerOptions,
} from "@tanstack/virtual-core"

export type UseVirtualizerOptions<
  TScrollElement extends Element,
  TItemElement extends Element,
> = () => Omit<
  VirtualizerOptions<TScrollElement, TItemElement>,
  "observeElementRect" | "observeElementOffset" | "scrollToFn"
> &
  Partial<
    Pick<
      VirtualizerOptions<TScrollElement, TItemElement>,
      "observeElementRect" | "observeElementOffset" | "scrollToFn"
    >
  >

export interface UseVirtualizerResult<
  TScrollElement extends Element,
  TItemElement extends Element,
> {
  /** The virtualizer instance — read to access all methods. */
  instance: Virtualizer<TScrollElement, TItemElement>
  /** Reactive signal of currently visible virtual items. */
  virtualItems: Signal<VirtualItem[]>
  /** Reactive signal of the total scrollable size in pixels. */
  totalSize: Signal<number>
  /** Reactive signal indicating whether the user is scrolling. */
  isScrolling: Signal<boolean>
}

/**
 * Create a reactive TanStack Virtual virtualizer for element-based scrolling.
 *
 * Options are passed as a function so reactive signals (e.g. count, estimateSize)
 * can be read inside, and the virtualizer updates automatically when they change.
 *
 * @example
 * const parentRef = signal<HTMLDivElement | null>(null)
 * const virtual = useVirtualizer(() => ({
 *   count: 10000,
 *   getScrollElement: () => parentRef(),
 *   estimateSize: () => 35,
 * }))
 * // virtual.virtualItems() — array of visible VirtualItem
 * // virtual.totalSize() — total height/width for the inner container
 */
export function useVirtualizer<TScrollElement extends Element, TItemElement extends Element>(
  options: UseVirtualizerOptions<TScrollElement, TItemElement>,
): UseVirtualizerResult<TScrollElement, TItemElement> {
  const resolvedOptions: VirtualizerOptions<TScrollElement, TItemElement> = {
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options(),
  }

  const virtualItems = signal<VirtualItem[]>([])
  const totalSize = signal(0)
  const isScrolling = signal(false)

  // Store latest user options so onChange always reads the freshest reference
  let latestUserOpts = options()

  const instance = new Virtualizer<TScrollElement, TItemElement>(resolvedOptions)

  // Track reactive options: when signals inside options() change, update the virtualizer.
  const effectCleanup = effect(() => {
    latestUserOpts = options()
    instance.setOptions({
      ...instance.options,
      ...latestUserOpts,
      onChange: (inst, sync) => {
        batch(() => {
          virtualItems.set(inst.getVirtualItems())
          totalSize.set(inst.getTotalSize())
          isScrolling.set(inst.isScrolling)
        })
        // Read latest opts to avoid stale closure
        latestUserOpts.onChange?.(inst, sync)
      },
    })

    // After updating options, recalculate and re-emit
    instance._willUpdate()
    batch(() => {
      virtualItems.set(instance.getVirtualItems())
      totalSize.set(instance.getTotalSize())
    })
  })

  // Lifecycle: mount observers, clean up on unmount.
  let mountCleanup: (() => void) | undefined
  onMount(() => {
    mountCleanup = instance._didMount()
    instance._willUpdate()
    batch(() => {
      virtualItems.set(instance.getVirtualItems())
      totalSize.set(instance.getTotalSize())
    })
    return undefined
  })

  onUnmount(() => {
    effectCleanup.dispose()
    mountCleanup?.()
  })

  return { instance, virtualItems, totalSize, isScrolling }
}
