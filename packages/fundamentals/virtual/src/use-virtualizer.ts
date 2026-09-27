import type { Signal } from '@pyreon/reactivity'
import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
} from '@tanstack/virtual-core'
import type { VirtualItemMeasurement } from './item-registry'
import { createReactiveVirtualizer } from './reactive-virtualizer'

export type UseVirtualizerOptions<
  TScrollElement extends Element,
  TItemElement extends Element,
> = () => Omit<
  VirtualizerOptions<TScrollElement, TItemElement>,
  'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
> &
  Partial<
    Pick<
      VirtualizerOptions<TScrollElement, TItemElement>,
      'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
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
  /**
   * Fine-grained per-index measurement accessors (`start`/`size`/`lane`), for
   * dynamically-measured lists. Read inside a row's style accessor so a staying
   * row re-positions when a remeasure above it shifts its `start` — the
   * captured `<For>` item is a stale snapshot and never updates in place. Each
   * field gates on numeric equality, so only genuinely-moved rows patch the DOM
   * (fixed-size lists never fire it → zero cost until first used).
   */
  item: (index: number) => VirtualItemMeasurement
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
  return createReactiveVirtualizer<TScrollElement, TItemElement>(
    { observeElementRect, observeElementOffset, scrollToFn: elementScroll },
    options,
    'useVirtualizer',
  )
}
