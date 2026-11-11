import type { VNode } from '@pyreon/core'
import { For, h } from '@pyreon/core'
import { createGroupPresence, type PresenceEntry } from '../group-presence'
import { readLive, resolveLive } from '../live-prop'
import type { TransitionCallbacks } from '../types'
import TransitionItem from './TransitionItem'
import type { KineticConfig } from './types'

type GroupRendererProps = {
  config: KineticConfig
  htmlProps: Record<string, unknown>
  /** Construction-time — a first-mount question, spent once the ref wires up. */
  appear?: boolean | undefined
  /** Live: the animation-end deadline is re-armed per cycle. */
  timeout?: number | (() => number | undefined) | undefined
  /** A LIVE HOLDER — read each entry through `readLive` at the point of call. */
  callbacks: Partial<TransitionCallbacks>
  /**
   * Children can be a static array OR a reactive accessor `() => VNode[]`.
   * When passed as an accessor, GroupRenderer tracks changes and
   * animates entering/leaving children automatically.
   */
  children: VNode[] | (() => unknown)
}

/**
 * Renders children with key-based enter/exit animation (no `show` prop).
 * A new key's row animates in; a removed key's row stays in the DOM while it
 * animates out, then unmounts. Rows that stay are kept, not rebuilt, so each
 * keeps its own transition state; a reorder moves them. config.tag wraps all
 * children as a container element.
 *
 * In Pyreon, components run once. Pass children as a reactive accessor
 * `() => VNode[]` (each child with a stable `key`) for the group to see
 * changes. As with `<For>`, a row keeps the element from the render that
 * introduced its key; drive changing row content from signals.
 */
const GroupRenderer = (props: GroupRendererProps): VNode | null => {
  const config = props.config
  // Construction-time (a first-mount question), read once.
  const effectiveAppear = props.appear ?? config.appear ?? false
  // Accessor: the deadline is re-armed per cycle, so it is resolved at use.
  const effectiveTimeout = () => resolveLive(props.timeout) ?? config.timeout ?? 5000

  // `props.children` is read through the getter on every change, so whatever
  // wrapping the compiler added (an accessor returning the user's accessor) is
  // unwrapped by the presence model's `flattenChildren`.
  const { entries, leave } = createGroupPresence(() => props.children)

  const afterLeave = (entry: PresenceEntry) => {
    leave(entry)
    readLive<TransitionCallbacks['onAfterLeave']>(props.callbacks, 'onAfterLeave')?.()
  }

  // By reference — `{ ...htmlProps }` would value-copy and freeze any
  // reactive HTML attr the kinetic split preserved as a getter.
  return h(
    config.tag,
    props.htmlProps,
    h(For as never, {
      each: entries,
      by: (entry: PresenceEntry) => entry.key,
      children: (entry: PresenceEntry) => (
        <TransitionItem
          show={() => entry.show()}
          appear={entry.initial ? effectiveAppear : true}
          timeout={effectiveTimeout}
          enterStyle={config.enterStyle}
          enterToStyle={config.enterToStyle}
          enterTransition={config.enterTransition}
          leaveStyle={config.leaveStyle}
          leaveToStyle={config.leaveToStyle}
          leaveTransition={config.leaveTransition}
          enter={config.enter}
          enterFrom={config.enterFrom}
          enterTo={config.enterTo}
          leave={config.leave}
          leaveFrom={config.leaveFrom}
          leaveTo={config.leaveTo}
          onAfterLeave={() => afterLeave(entry)}
        >
          {entry.element}
        </TransitionItem>
      ),
    }),
  )
}

export default GroupRenderer
