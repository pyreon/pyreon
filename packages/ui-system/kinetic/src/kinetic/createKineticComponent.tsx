import type { VNode } from '@pyreon/core'
import { splitProps } from '@pyreon/core'
import type { CSSProperties, TransitionCallbacks } from '../types'
import CollapseRenderer from './CollapseRenderer'
import GroupRenderer from './GroupRenderer'
import StaggerRenderer from './StaggerRenderer'
import TransitionRenderer from './TransitionRenderer'
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

    const {
      show,
      appear,
      unmount,
      timeout,
      transition,
      interval,
      reverseLeave,
      onEnter,
      onAfterEnter,
      onLeave,
      onAfterLeave,
    } = kineticProps as {
      show?: () => boolean
      appear?: boolean
      unmount?: boolean
      timeout?: number
      transition?: string
      interval?: number
      reverseLeave?: boolean
    } & Partial<TransitionCallbacks>

    const callbacks: Partial<TransitionCallbacks> = {
      onEnter: onEnter ?? config.onEnter,
      onAfterEnter: onAfterEnter ?? config.onAfterEnter,
      onLeave: onLeave ?? config.onLeave,
      onAfterLeave: onAfterLeave ?? config.onAfterLeave,
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
          show={show as () => boolean}
          appear={appear}
          timeout={timeout}
          transition={transition}
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
          show={show as () => boolean}
          appear={appear}
          timeout={timeout}
          interval={interval}
          reverseLeave={reverseLeave}
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
          appear={appear}
          timeout={timeout}
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
        show={show as () => boolean}
        appear={appear}
        unmount={unmount}
        timeout={timeout}
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
