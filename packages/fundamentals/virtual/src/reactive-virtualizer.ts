import { onMount, onUnmount } from '@pyreon/core'
import type { Signal } from '@pyreon/reactivity'
import { batch, effect, signal } from '@pyreon/reactivity'
import { type VirtualItem, Virtualizer, type VirtualizerOptions } from '@tanstack/virtual-core'
import { deferDetachedMeasurement, guardDetachedSize } from './detached-measure'
import { createItemRegistry, type VirtualItemMeasurement } from './item-registry'

/** What both hooks return. */
export interface ReactiveVirtualizer<TScrollElement extends Element | Window, TItemElement extends Element> {
  instance: Virtualizer<TScrollElement, TItemElement>
  virtualItems: Signal<VirtualItem[]>
  totalSize: Signal<number>
  isScrolling: Signal<boolean>
  item: (index: number) => VirtualItemMeasurement
}

/**
 * The shared core of `useVirtualizer` and `useWindowVirtualizer` — they
 * differed only in their platform defaults, and had drifted into two copies.
 *
 * - `options()` is read ONCE per pass. It used to be called three times at
 *   setup (spread into the constructor options, cached, then again in the
 *   effect), so a caller doing work in it — or reading signals it did not
 *   mean to — paid for it three times.
 * - Each pass builds the options FRESH from the platform defaults plus the
 *   current user options, instead of spreading the previous pass's
 *   `instance.options` underneath. The merge kept any key the user stopped
 *   returning (a conditional `getItemKey`, `rangeExtractor`, `onChange`)
 *   alive forever.
 */
export function createReactiveVirtualizer<
  TScrollElement extends Element | Window,
  TItemElement extends Element,
>(
  defaults: Partial<VirtualizerOptions<TScrollElement, TItemElement>>,
  options: () => Partial<VirtualizerOptions<TScrollElement, TItemElement>>,
  hook: string,
): ReactiveVirtualizer<TScrollElement, TItemElement> {
  const virtualItems = signal<VirtualItem[]>([])
  const totalSize = signal(0)
  const isScrolling = signal(false)
  const registry = createItemRegistry()

  let instance: Virtualizer<TScrollElement, TItemElement> | undefined
  // Latest user options, so the onChange forwarder never reads a stale closure.
  let latestUserOpts: Partial<VirtualizerOptions<TScrollElement, TItemElement>> = {}

  // Single emission point: pull the instance's current state into all reactive
  // surfaces (coarse signals + fine-grained per-index registry) in one batch.
  const emit = (): void => {
    const inst = instance
    /* v8 ignore next — TanStack does not notify from inside its constructor;
       defensive, since `instance` is only assigned once construction returns. */
    if (!inst) return
    batch(() => {
      const items = inst.getVirtualItems()
      virtualItems.set(items)
      totalSize.set(inst.getTotalSize())
      isScrolling.set(inst.isScrolling)
      registry.sync(items)
    })
  }

  const build = (
    user: Partial<VirtualizerOptions<TScrollElement, TItemElement>>,
  ): VirtualizerOptions<TScrollElement, TItemElement> =>
    ({
      ...defaults,
      ...user,
      measureElement: guardDetachedSize(user.measureElement),
      onChange: (inst: Virtualizer<TScrollElement, TItemElement>, sync: boolean) => {
        emit()
        latestUserOpts.onChange?.(inst, sync)
      },
    }) as VirtualizerOptions<TScrollElement, TItemElement>

  // Track reactive options: when signals inside options() change, update the
  // virtualizer. The first run constructs it.
  const watch = effect(() => {
    const user = options()
    latestUserOpts = user
    if (instance === undefined) {
      instance = new Virtualizer<TScrollElement, TItemElement>(build(user))
      deferDetachedMeasurement(instance)
    } else {
      instance.setOptions(build(user))
    }
    instance._willUpdate()
    emit()
  })

  // Lifecycle: mount observers, clean up on unmount.
  let mountCleanup: (() => void) | undefined
  onMount(() => {
    const inst = instance!
    mountCleanup = inst._didMount()
    inst._willUpdate()
    emit()
    if (process.env.NODE_ENV !== 'production' && !inst.options.getScrollElement()) {
      console.warn(
        `[Pyreon] ${hook}: getScrollElement() returned null after mount, so the list renders ZERO rows. ` +
          'Return the scroll container — e.g. a ref wired with `ref={...}` on the element, or a signal the ref writes — ' +
          'and make sure it is mounted by the time this component is.',
      )
    }
    return undefined
  })

  onUnmount(() => {
    watch.dispose()
    mountCleanup?.()
  })

  return { instance: instance!, virtualItems, totalSize, isScrolling, item: registry.item }
}
