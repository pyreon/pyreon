// ─── VNode ────────────────────────────────────────────────────────────────────

// Reactive getter returning a child — wraps dynamic expressions in `() =>`
export type VNodeChildAtom = VNode | VNode[] | string | number | boolean | null | undefined
export type VNodeChild = VNodeChildAtom | (() => VNodeChildAtom)

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
 * It returns a VNode (or null) and may call lifecycle hooks during setup.
 */
export type ComponentFn<P extends Props = Props> = (props: P) => VNode | null

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
  mount: (() => CleanupFn | undefined)[]
  unmount: (() => void)[]
  update: (() => void)[]
  /** Error handlers — return true to mark the error as handled (stops propagation). */
  error: ((err: unknown) => boolean | undefined)[]
}
