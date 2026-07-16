import type { Ref, VNode } from '@pyreon/core'
import { SizedMap } from '@pyreon/sized-map'
import type { CSSProperties } from './types'

// FIFO-bounded class-string split cache. Class C leak prevention: the
// pre-#PR shape was an unbounded Map keyed by className strings — every
// unique input held a parsed result forever. Real-app inputs are
// finite (user-config kinetic classes are stable per definition), but
// HMR cycles, dynamic theme generation, and A/B-tested variants can
// produce unbounded growth. Cap matches @pyreon/styler's classCache.
//
// SizedMap in FIFO mode (default) — get() does NOT touch ordering;
// eviction happens inside set() on overflow.
const splitCache = new SizedMap<string, string[]>({ maxEntries: 128 })
const splitClasses = (classes: string): string[] => {
  let cached = splitCache.get(classes)
  if (!cached) {
    cached = classes.split(/\s+/).filter(Boolean)
    splitCache.set(classes, cached)
  }
  return cached
}

/** Adds space-separated CSS classes to an element. */
export const addClasses = (el: HTMLElement, classes: string | undefined) => {
  if (!classes) return
  const list = splitClasses(classes)
  if (list.length > 0) el.classList.add(...list)
}

/** Removes space-separated CSS classes from an element. */
export const removeClasses = (el: HTMLElement, classes: string | undefined) => {
  if (!classes) return
  const list = splitClasses(classes)
  if (list.length > 0) el.classList.remove(...list)
}

/**
 * Executes `callback` after two animation frames (double-rAF), ensuring the
 * browser paints the current state before applying changes — required for
 * CSS transitions to trigger.
 *
 * BATCHED: all callbacks registered in the same synchronous burst share ONE
 * double-rAF (a 1000-child stagger schedules 2 rAFs, not 2000 — measured as
 * the dominant per-child overhead vs Motion One's batched WAAPI path at
 * N=1000). Correctness constraint the batching must preserve: a callback
 * registered AFTER the current batch's outer frame has fired must NOT join
 * that batch (it would run only ONE frame after registration — the browser
 * would not have painted its "from" state and the CSS transition would not
 * trigger). So the shared batch closes when its outer frame fires; later
 * registrants open a new batch. Callbacks run in registration order (Set
 * iteration = insertion order), matching the old per-callback rAF FIFO.
 *
 * Returns a CANCEL function that removes the callback from its batch — a
 * strictly stronger guarantee than the previous per-callback
 * `cancelAnimationFrame(outer/inner)` pair (removal works in EVERY phase, so
 * a rapid enter→leave flip inside one frame can never apply the stale
 * enter-to state; and cancelling one callback never touches siblings'
 * scheduling). Scheduling is SSR-safe (`requestAnimationFrame` may be
 * undefined → no-op cancel) and the cancel itself is post-teardown safe by
 * construction (a Set delete, no browser API).
 */
let _framePending: Set<() => void> | null = null
// The rAF that scheduled the pending batch. A batch is only valid for the
// requestAnimationFrame it was scheduled on — if the global is swapped (test
// stubs, a polyfill installed mid-flight), the old batch's frames live on the
// dead function and would swallow new callbacks forever; identity-keying makes
// the batching self-healing instead of needing test-only reset hooks.
let _frameRaf: typeof requestAnimationFrame | null = null

export const nextFrame = (callback: () => void): (() => void) => {
  if (typeof requestAnimationFrame === 'undefined') return () => {}
  if (!_framePending || _frameRaf !== requestAnimationFrame) {
    const batch = new Set<() => void>()
    _framePending = batch
    _frameRaf = requestAnimationFrame
    requestAnimationFrame(() => {
      // Batch closes at the outer frame — late registrants need their own
      // outer frame so their "from" state paints first. Guarded: a stale
      // batch's outer (from a swapped-out rAF) must not null a newer batch.
      if (_framePending === batch) _framePending = null
      requestAnimationFrame(() => {
        for (const cb of batch) cb()
        batch.clear()
      })
    })
  }
  const batch = _framePending
  batch.add(callback)
  return () => {
    batch.delete(callback)
  }
}

/** Stable custom property carrying a kinetic-controlled transition-delay. */
export const KINETIC_DELAY_VAR = '--kinetic-delay'

/**
 * Assigns the `transition` shorthand WITHOUT clobbering a per-element
 * transition-delay.
 *
 * **Why:** assigning `el.style.transition` (the shorthand) resets EVERY
 * transition longhand it omits — including `transition-delay` → `0s` — in
 * spec-compliant engines (Chromium / Firefox). Kinetic's stagger bakes each
 * child's delay onto `transition-delay`, so a bare `el.style.transition =
 * enterTransition` erased the stagger delay the instant the enter/leave
 * animation started: every child animated at once. happy-dom does NOT model
 * the shorthand→longhand reset, so unit tests never caught it — only a real
 * browser does (see `stagger-delay-preserved.browser.test.tsx`).
 *
 * The delay is sourced from a stable `--kinetic-delay` custom property (set
 * by the stagger renderers) because a plain inline `transition-delay` is
 * itself wiped by the `transition = ''` reset kinetic performs at the
 * `entered` stage — the custom property survives both, so multi-cycle
 * staggers keep their delay. A plain inline `transition-delay` (e.g.
 * user-set) is honoured as a first-cycle fallback.
 */
export const setTransition = (el: HTMLElement, value: string): void => {
  const staggerDelay = el.style.getPropertyValue(KINETIC_DELAY_VAR)
  const inlineDelay = el.style.transitionDelay
  el.style.transition = value
  const delay = staggerDelay || inlineDelay
  if (delay) el.style.transitionDelay = delay
}

/** Merges two className strings, filtering undefined/empty. */
export const mergeClassNames = (
  existing: string | undefined,
  additional: string | undefined,
): string | undefined => {
  const parts = [existing, additional].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : undefined
}

/** Merges two CSSProperties objects, with `b` taking precedence. */
export const mergeStyles = (
  a: CSSProperties | undefined,
  b: CSSProperties | undefined,
): CSSProperties | undefined => {
  if (!a && !b) return undefined
  if (!a) return b
  if (!b) return a
  return { ...a, ...b }
}

// ─── Ref & Motion Utilities ─────────────────────────────────

type RefCallback<T> = (node: T | null) => void
type RefLike<T> = RefCallback<T> | Ref<T>

/** Merges multiple refs (callback or object) into a single callback ref. */
export const mergeRefs = <T>(...refs: (RefLike<T> | undefined)[]): ((node: T | null) => void) => {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === 'function') {
        ref(node)
      } else {
        ;(ref as { current: unknown }).current = node
      }
    }
  }
}

/** Clones a VNode with merged props. */
export const cloneVNode = (vnode: VNode, extraProps: Record<string, unknown>): VNode => ({
  ...vnode,
  props: { ...vnode.props, ...extraProps },
})

/**
 * Resolves a `children` value the Pyreon compiler may have wrapped in a
 * deferred accessor.
 *
 * **Why:** the compiler's prop-inlining pass rewrites `<Comp>{children}</Comp>`
 * to `Comp({ ..., children: () => <inlined-expression> })` whenever
 * `children` is a local `const` derived from a getter-shaped binding
 * (`const children = childHolder.children` after `splitProps`). DOM-side
 * consumers route through `mountChild` which already treats function
 * children as reactive accessors, so the wrap is invisible there. Kinetic's
 * Stagger/Group/Transition/Collapse renderers iterate `children` directly
 * at the VNode level (to build per-child `TransitionItem`s), so a wrapped
 * function landed in `Array.isArray(children) ? children : [children]` as
 * `[function]` → `.filter(isVNode)` → `[]` → the rendered `<div>` had zero
 * children → SSR content vanished post-hydration. Reproducer:
 * `examples/bokisch.com`'s Intro section with `kinetic('div').stagger()`
 * + `appear` + `show={() => true}` + component children → SSG HTML had
 * `<h1>Hello</h1>`, post-hydrate the entire subtree was replaced by
 * `<!--pyreon-->` markers.
 *
 * Kinetic deliberately snapshots children at render time (animation state
 * is per-item, built once) — it does NOT observe children changes after
 * the initial render. Eagerly unwrapping the function matches that
 * contract; no reactivity is lost.
 */
export const resolveChildren = <T>(children: T | (() => T)): T =>
  (typeof children === 'function' ? (children as () => T)() : children) as T
