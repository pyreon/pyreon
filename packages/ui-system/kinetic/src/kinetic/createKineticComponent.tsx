import type { VNode } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import type { CSSProperties, TransitionCallbacks } from '../types'
import CollapseRenderer from './CollapseRenderer'
import GroupRenderer from './GroupRenderer'
import StaggerRenderer from './StaggerRenderer'
import TransitionRenderer from './TransitionRenderer'
import { readLive, readLiveValue } from '../live-prop'
import { showAccessorFrom } from '../show-accessor'
import type { ClassConfig, KineticComponent, KineticConfig, KineticMode } from './types'

/** Keys that are kinetic-specific and should not be forwarded as HTML attrs. */
const KINETIC_KEYS = new Set([
  'show',
  'appear',
  'unmount',
  'timeout',
  'transition',
  'interval',
  'reverseLeave',
  'onEnter',
  'onAfterEnter',
  'onLeave',
  'onAfterLeave',
])

/**
 * Core factory. Creates a component that delegates to the appropriate
 * renderer based on config.mode, then attaches immutable chain methods
 * via Object.assign.
 */
const createKineticComponent = <Tag extends string, Mode extends KineticMode = 'transition'>(
  config: KineticConfig,
): KineticComponent<Tag, Mode> => {
  const Component = (props: Record<string, unknown>): VNode | null => {
    // Separate kinetic-specific props from HTML pass-through props.
    // MUST use splitProps (descriptor-preserving) — a plain
    // `htmlProps[key] = props[key]` value-copy fires every getter at
    // component-setup time. The compiler emits `<KineticDiv class={sig()}>`
    // as `_rp(() => sig())`, which `makeReactiveProps` turns into a getter
    // on `props`; reading it here (outside any tracking scope) would
    // collapse it to a static snapshot and freeze the HTML attr forever.
    // splitProps copies DESCRIPTORS via Object.getOwnPropertyDescriptor +
    // Object.defineProperty, so the getter survives to the renderer's
    // `h(config.tag, htmlProps)` where runtime-dom's applyProps detects
    // the descriptor and wraps the read in renderEffect.
    // `props` is `Record<string, unknown>`, so `Omit<…, string>` collapses
    // to `{}` at the type level — the runtime split is correct (splitProps
    // copies descriptors for every own key not in the pick set), only the
    // inferred result types degrade. Cast back to the real shape.
    const [kineticProps, htmlPropsWithChildren] = splitProps(props, [...KINETIC_KEYS]) as [
      Record<string, unknown>,
      Record<string, unknown>,
    ]

    // DELIBERATELY NOT DESTRUCTURED. The split above exists to preserve the
    // compiler's `_rp` getters on `kineticProps`; a destructure here reads all
    // ten of them at setup and throws that away again — the identical freeze
    // `showAccessorFrom` fixes for `show`, for `show`'s siblings. What each one
    // becomes instead is decided per prop below and in `live-prop.ts`.
    //
    // Absent or value-shaped `show` (see showAccessorFrom) — both crash on
    // `show()`. Read off `kineticProps` PER CALL, TRACKED: it is the state
    // machine's input, so `watch` must subscribe to it.
    const showAccessor = showAccessorFrom(kineticProps)

    // CONSTRUCTION-TIME, read once here on purpose.
    //
    // `appear` answers "animate on the FIRST mount?". `useTransitionState` /
    // CollapseRenderer consume it to pick the initial stage and to arm a
    // one-shot latch (`appearTriggered`) that is spent the moment the ref
    // wires up. There is no later use for a newer value, so a live read would
    // be misleading rather than useful.
    //
    // `interval` / `reverseLeave` are consumed by StaggerRenderer's `.map()`
    // over an ALREADY-RESOLVED child array, baking `--kinetic-delay` into each
    // child's static style object. Making them live would require a
    // function-valued `style` on children that may be COMPONENTS — changing
    // what `props.style` is for the child, to track a value nobody drives from
    // a signal over a static child list.
    const appearAtMount = readLive<boolean>(kineticProps, 'appear')
    const intervalAtMount = readLive<number>(kineticProps, 'interval')
    const reverseLeaveAtMount = readLive<boolean>(kineticProps, 'reverseLeave')

    // LIVE. Each is consumed once per animation CYCLE, long after setup:
    // `timeout` arms the animation-end deadline, `transition` is written to
    // `style.transition` on every stage change, `unmount` is consulted by
    // `<Show>`'s fallback on every hide. The renderers resolve them at their
    // own point of use (`resolveLive`), so a plain value from the chain config
    // still works unchanged.
    const timeoutLive = () => readLiveValue<number>(kineticProps, 'timeout')
    const transitionLive = () => readLiveValue<string>(kineticProps, 'transition')
    const unmountLive = () => readLiveValue<boolean>(kineticProps, 'unmount')

    // LIVE HOLDER, not a snapshot. A frozen callback is the sharpest member of
    // this class: it fires on a stage change or a `transitionend` seconds
    // later, so the stale one calls into the closure the parent had at mount.
    // The renderers read these through `readLive` at the moment they invoke
    // them, so a swapped handler is honoured on the next cycle.
    const callbacks: Partial<TransitionCallbacks> = {
      get onEnter() {
        return readLive<TransitionCallbacks['onEnter']>(kineticProps, 'onEnter') ?? config.onEnter
      },
      get onAfterEnter() {
        return (
          readLive<TransitionCallbacks['onAfterEnter']>(kineticProps, 'onAfterEnter') ??
          config.onAfterEnter
        )
      },
      get onLeave() {
        return readLive<TransitionCallbacks['onLeave']>(kineticProps, 'onLeave') ?? config.onLeave
      },
      get onAfterLeave() {
        return (
          readLive<TransitionCallbacks['onAfterLeave']>(kineticProps, 'onAfterLeave') ??
          config.onAfterLeave
        )
      },
    }

    // Carve `children` out of the HTML pass-through set — also via
    // splitProps so the remaining HTML attrs keep their getter
    // descriptors (`const { children, ...restHtml } = …` is the same
    // value-copy footgun as the split above).
    const [childHolder, restHtml] = splitProps(htmlPropsWithChildren, ['children'])
    const children = childHolder.children

    if (config.mode === 'collapse') {
      return (
        <CollapseRenderer
          config={config}
          htmlProps={restHtml}
          show={showAccessor}
          appear={appearAtMount}
          timeout={timeoutLive}
          transition={transitionLive}
          callbacks={callbacks}
        >
          {children as VNode | VNode[]}
        </CollapseRenderer>
      )
    }

    if (config.mode === 'stagger') {
      return (
        <StaggerRenderer
          config={config}
          htmlProps={restHtml}
          show={showAccessor}
          appear={appearAtMount}
          timeout={timeoutLive}
          interval={intervalAtMount}
          reverseLeave={reverseLeaveAtMount}
          callbacks={callbacks}
        >
          {children as VNode[]}
        </StaggerRenderer>
      )
    }

    if (config.mode === 'group') {
      return (
        <GroupRenderer
          config={config}
          htmlProps={restHtml}
          appear={appearAtMount}
          timeout={timeoutLive}
          callbacks={callbacks}
        >
          {children as VNode[]}
        </GroupRenderer>
      )
    }

    // Default: transition mode
    return (
      <TransitionRenderer
        config={config}
        htmlProps={restHtml}
        show={showAccessor}
        appear={appearAtMount}
        unmount={unmountLive}
        timeout={timeoutLive}
        callbacks={callbacks}
      >
        {children as VNode | VNode[]}
      </TransitionRenderer>
    )
  }

  Component.displayName = `kinetic(${config.tag})`

  // Immutable chain methods — each returns a new component with merged config.
  return Object.assign(Component, {
    preset: (preset: Record<string, unknown>) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        ...preset,
      } as KineticConfig),

    enter: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, enterStyle: styles }),

    enterTo: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, enterToStyle: styles }),

    enterTransition: (value: string) =>
      createKineticComponent<Tag, Mode>({ ...config, enterTransition: value }),

    leave: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, leaveStyle: styles }),

    leaveTo: (styles: CSSProperties) =>
      createKineticComponent<Tag, Mode>({ ...config, leaveToStyle: styles }),

    leaveTransition: (value: string) =>
      createKineticComponent<Tag, Mode>({ ...config, leaveTransition: value }),

    enterClass: ({ active, from, to }: ClassConfig) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        enter: active,
        enterFrom: from,
        enterTo: to,
      }),

    leaveClass: ({ active, from, to }: ClassConfig) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        leave: active,
        leaveFrom: from,
        leaveTo: to,
      }),

    config: (opts: Record<string, unknown>) =>
      createKineticComponent<Tag, Mode>({
        ...config,
        ...opts,
      } as KineticConfig),

    on: (cbs: Partial<TransitionCallbacks>) =>
      createKineticComponent<Tag, Mode>({ ...config, ...cbs }),

    collapse: (opts?: { transition?: string }) =>
      createKineticComponent<Tag, 'collapse'>({
        ...config,
        mode: 'collapse',
        ...opts,
      }),

    stagger: (opts?: { interval?: number; reverseLeave?: boolean }) =>
      createKineticComponent<Tag, 'stagger'>({
        ...config,
        mode: 'stagger',
        ...opts,
      }),

    group: () => createKineticComponent<Tag, 'group'>({ ...config, mode: 'group' }),
  }) as unknown as KineticComponent<Tag, Mode>
}

export default createKineticComponent
