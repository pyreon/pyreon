/// <reference lib="dom" />

// ─── VNode ────────────────────────────────────────────────────────────────────

// Reactive getter returning a child — wraps dynamic expressions in `() =>`
export type VNodeChildAtom = VNode | string | number | boolean | null | undefined
/** Reactive accessor — TS checks this arm FIRST so `{() => cond && <X />}` resolves correctly */
export type VNodeChildAccessor = () => VNodeChildAtom | VNodeChildAtom[]
export type VNodeChild = VNodeChildAccessor | VNodeChildAtom | VNodeChildAtom[]

export interface VNode {
  /** Tag name, component function, or special symbol (Fragment) */
  type: string | ComponentFn | symbol
  props: Props
  children: VNodeChild[]
  key: string | number | null
}

// ─── Props ────────────────────────────────────────────────────────────────────

export type Props = Record<string, unknown>

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * A component is a plain function that runs ONCE.
 * It returns any renderable content and may call lifecycle hooks during setup.
 */
export type ComponentFn<P extends Props = Props> = (props: P) => VNodeChild

// ─── Utility types ───────────────────────────────────────────────────────────

/** Extract the props type from a component function, or pass through if already a props type. */
export type ExtractProps<T> = T extends ComponentFn<infer P> ? P : T

/** A higher-order component that wraps a component, optionally transforming its props. */
export type HigherOrderComponent<HOP extends Props, P extends Props | undefined = undefined> = (
  Component: ComponentFn<HOP>,
) => ComponentFn<P extends undefined ? HOP : P>

/**
 * Internal runtime handle created by the renderer for each mounted component.
 */
export interface ComponentInstance {
  vnode: VNode | null
  /** Trigger a re-check / patch cycle (called by the renderer) */
  update(): void
  unmount(): void
}

// ─── Lifecycle hooks storage (attached per-instance by the renderer) ──────────

// Cleanup function optionally returned by onMount hooks
export type CleanupFn = () => void

// ─── NativeItem ───────────────────────────────────────────────────────────────

/**
 * Result of createTemplate() — a pre-cloned DOM element with its cleanup.
 * Handled directly by mountFor without going through the VNode reconciler,
 * saving 2 allocations per row vs the VNode wrapper path.
 */
export interface NativeItem {
  readonly __isNative: true
  el: HTMLElement
  cleanup: (() => void) | null
}

export interface LifecycleHooks {
  mount: (() => CleanupFn | void | undefined)[] | null
  unmount: (() => void)[] | null
  update: (() => void)[] | null
  /** Error handlers — return true to mark the error as handled (stops propagation). */
  error: ((err: unknown) => boolean | undefined)[] | null
}
