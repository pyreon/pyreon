import type { VNode } from '@pyreon/core'
import { For, h, mergeProps, splitProps } from '@pyreon/core'
import { createGroupPresence, type PresenceEntry } from './group-presence'
import { readLive, readLiveValue } from './live-prop'
import Transition from './Transition'
import type { ClassTransitionProps, StyleTransitionProps, TransitionCallbacks } from './types'

export type TransitionGroupProps = ClassTransitionProps &
  StyleTransitionProps &
  TransitionCallbacks & {
    appear?: boolean | undefined
    timeout?: number | (() => number | undefined) | undefined
    /**
     * Children can be a static array OR a reactive accessor `() => VNode[]`.
     * When passed as an accessor, TransitionGroup tracks changes and
     * animates entering/leaving children automatically.
     */
    children: VNode[] | (() => unknown)
  }

/**
 * Renders children with key-based enter/exit animations.
 *
 * In Pyreon, components run once. For TransitionGroup to detect children
 * changes, pass children as a reactive accessor: `() => VNode[]`, each child
 * with a stable `key`. A new key's child animates in, a removed key's child
 * animates out and then unmounts, and children that stay keep their element
 * and transition state (as `<For>` keeps a row).
 */
const TransitionGroup = (props: TransitionGroupProps): VNode | null => {
  const [own, transitionProps] = splitProps(props, [
    'children',
    'appear',
    'timeout',
    'onAfterLeave',
  ])
  // CONSTRUCTION-TIME: a first-mount question (see `<Transition>`).
  const appear = own.appear ?? false

  const { entries, leave } = createGroupPresence(() => own.children)

  return h(For as never, {
    each: entries,
    by: (entry: PresenceEntry) => entry.key,
    children: (entry: PresenceEntry) =>
      // `h` + `mergeProps`, NOT a JSX spread: a plain object spread READS every
      // key, firing each `_rp` getter `splitProps` preserved and freezing every
      // forwarded transition prop. `mergeProps` copies descriptors instead.
      h(
        Transition,
        mergeProps(transitionProps as Record<string, unknown>, {
          show: () => entry.show(),
          appear: entry.initial ? appear : true,
          // A thunk, so a `timeout` that arrived as an `_rp` getter is
          // re-read when each child re-arms its deadline.
          timeout: () => readLiveValue<number>(own, 'timeout'),
          onAfterLeave: () => {
            leave(entry)
            readLive<TransitionCallbacks['onAfterLeave']>(own, 'onAfterLeave')?.()
          },
        }),
        entry.element,
      ),
  })
}

export default TransitionGroup
