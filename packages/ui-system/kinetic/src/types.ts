import type { Ref, VNode } from "@pyreon/core"
import type { Signal } from "@pyreon/reactivity"

export type CSSProperties = Record<string, string | number | undefined>

/** Internal lifecycle stages of a transition. */
export type TransitionStage = "hidden" | "entering" | "entered" | "leaving"

/** Class-based transition definition. */
export type ClassTransitionProps = {
  /** Classes applied during the entire enter phase */
  enter?: string | undefined
  /** Classes applied on first frame of enter, removed on next frame */
  enterFrom?: string | undefined
  /** Classes applied on second frame of enter, kept until complete */
  enterTo?: string | undefined
  /** Classes applied during the entire leave phase */
  leave?: string | undefined
  /** Classes applied on first frame of leave */
  leaveFrom?: string | undefined
  /** Classes applied on second frame of leave, kept until complete */
  leaveTo?: string | undefined
}

/** Style-object transition definition (zero-CSS option). */
export type StyleTransitionProps = {
  /** Inline styles for the start of enter */
  enterStyle?: CSSProperties | undefined
  /** Inline styles for the end of enter */
  enterToStyle?: CSSProperties | undefined
  /** CSS transition shorthand applied during enter */
  enterTransition?: string | undefined
  /** Inline styles for the start of leave */
  leaveStyle?: CSSProperties | undefined
  /** Inline styles for the end of leave */
  leaveToStyle?: CSSProperties | undefined
  /** CSS transition shorthand applied during leave */
  leaveTransition?: string | undefined
}

/** Lifecycle callbacks. */
export type TransitionCallbacks = {
  /** Called immediately when entering begins */
  onEnter?: (() => void) | undefined
  /** Called when enter animation completes */
  onAfterEnter?: (() => void) | undefined
  /** Called immediately when leaving begins */
  onLeave?: (() => void) | undefined
  /** Called when leave animation completes */
  onAfterLeave?: (() => void) | undefined
}

export type TransitionProps = ClassTransitionProps &
  StyleTransitionProps &
  TransitionCallbacks & {
    /** Reactive accessor controlling visibility. true = enter, false = leave + unmount. */
    show: () => boolean
    /** If true, runs enter animation on initial mount. Default: false. */
    appear?: boolean | undefined
    /** If true (default), unmounts when hidden. If false, keeps with display:none. */
    unmount?: boolean | undefined
    /** Safety timeout in ms. Default: 5000. */
    timeout?: number | undefined
    /** Single child element. Must accept ref. */
    children: VNode
  }

export type TransitionGroupProps = ClassTransitionProps &
  StyleTransitionProps &
  TransitionCallbacks & {
    /** If true, animates initial children on mount. Default: false. */
    appear?: boolean | undefined
    /** Safety timeout in ms. Default: 5000. */
    timeout?: number | undefined
    /** Children with unique keys. */
    children: VNode[]
  }

export type StaggerProps = ClassTransitionProps &
  StyleTransitionProps &
  TransitionCallbacks & {
    /** Reactive accessor controlling visibility of all children. */
    show: () => boolean
    /** Delay between each child's animation start in ms. Default: 50. */
    interval?: number | undefined
    /** If true, reverses stagger order on leave. Default: false. */
    reverseLeave?: boolean | undefined
    /** If true, animates on initial mount. Default: false. */
    appear?: boolean | undefined
    /** Safety timeout in ms. Default: 5000. */
    timeout?: number | undefined
    /** Children to stagger. */
    children: VNode[]
  }

export type CollapseProps = TransitionCallbacks & {
  /** Reactive accessor controlling expanded/collapsed state. */
  show: () => boolean
  /** CSS transition for height. Default: "height 300ms ease". */
  transition?: string | undefined
  /** If true, animates on initial mount. Default: false. */
  appear?: boolean | undefined
  /** Safety timeout in ms. Default: 5000. */
  timeout?: number | undefined
  /** The content to collapse. */
  children: VNode
}

export type TransitionStateResult = {
  /** Current lifecycle stage (signal) */
  stage: Signal<TransitionStage>
  /** Ref callback to attach to the transitioning element */
  ref: Ref<HTMLElement> | ((node: HTMLElement | null) => void)
  /** Reactive accessor: whether the element should be rendered */
  shouldMount: () => boolean
  /** Call when the current animation finishes */
  complete: () => void
}
