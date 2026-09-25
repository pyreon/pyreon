import type { Signal } from '@pyreon/reactivity'
import {
  observeWindowOffset,
  observeWindowRect,
  type VirtualItem,
  type Virtualizer,
  type VirtualizerOptions,
  windowScroll,
} from '@tanstack/virtual-core'
import type { VirtualItemMeasurement } from './item-registry'
import { createReactiveVirtualizer } from './reactive-virtualizer'

export type UseWindowVirtualizerOptions<TItemElement extends Element> = () => Omit<
  VirtualizerOptions<Window, TItemElement>,
  'observeElementRect' | 'observeElementOffset' | 'scrollToFn' | 'getScrollElement'
> &
  Partial<
    Pick<
      VirtualizerOptions<Window, TItemElement>,
      'observeElementRect' | 'observeElementOffset' | 'scrollToFn'
    >
  >

export interface UseWindowVirtualizerResult<TItemElement extends Element> {
  instance: Virtualizer<Window, TItemElement>
  virtualItems: Signal<VirtualItem[]>
  totalSize: Signal<number>
  isScrolling: Signal<boolean>
  /**
   * Fine-grained per-index measurement accessors (`start`/`size`/`lane`), for
   * dynamically-measured lists. See {@link UseVirtualizerResult.item}.
   */
  item: (index: number) => VirtualItemMeasurement
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
  return createReactiveVirtualizer<Window, TItemElement>(
    {
      observeElementRect: observeWindowRect,
      observeElementOffset: observeWindowOffset,
      scrollToFn: windowScroll,
      initialOffset: typeof document !== 'undefined' ? window.scrollY : 0,
      getScrollElement: () => (typeof window !== 'undefined' ? window : (null as unknown as Window)),
    },
    options,
    'useWindowVirtualizer',
  )
}
