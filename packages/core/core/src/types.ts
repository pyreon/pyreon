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

/**
 * Extract the props type from a component function, or pass through if already
 * a props type. **Multi-overload aware** — matches up to 4 call signatures and
 * produces the UNION of their first-argument types. A single-overload function
 * still works (the union of 4 copies of the same props type dedupes back to
 * the single shape).
 *
 * **Why this shape**. `T extends (props: infer P) => any ? P : never` only
 * captures the LAST overload of a multi-overload function — TS's overload-
 * resolution-against-conditional-types semantics. Multi-overload primitives
 * (Iterator, List, Element, etc.) need the union of every overload's props
 * to survive HOC wrapping (`rocketstyle()`, `attrs()`) without silently
 * downgrading the public prop surface to the loosest overload. Mirrors
 * vitus-labs PR #222.
 *
 * @example
 * function Iterator<T extends SimpleValue>(p: { data: T[]; valueName?: string }): VNodeChild
 * function Iterator<T extends ObjectValue>(p: { data: T[]; component: ComponentFn<T> }): VNodeChild
 * type Props = ExtractProps<typeof Iterator>
 * // → { data: SimpleValue[]; valueName?: string }
 * //  | { data: ObjectValue[]; component: ComponentFn<ObjectValue> }
 */
export type ExtractProps<T> = T extends {
  (props: infer P1, ...args: any): any
  (props: infer P2, ...args: any): any
  (props: infer P3, ...args: any): any
  (props: infer P4, ...args: any): any
}
  ? P1 | P2 | P3 | P4
  : T extends {
        (props: infer P1, ...args: any): any
        (props: infer P2, ...args: any): any
        (props: infer P3, ...args: any): any
      }
    ? P1 | P2 | P3
    : T extends {
          (props: infer P1, ...args: any): any
          (props: infer P2, ...args: any): any
        }
      ? P1 | P2
      : T extends ComponentFn<infer P>
        ? P
        : T

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
