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
 * Executes callback after two animation frames (double-rAF).
 * Ensures the browser paints the current state before applying changes,
 * which is required for CSS transitions to trigger. Returns 0 on SSR —
 * the typeof-window guard makes the SSR-safety contract explicit (callers
 * are always browser-only via `onMount`, but the rule can't AST-trace it).
 */
export const nextFrame = (callback: () => void): number => {
  if (typeof requestAnimationFrame === 'undefined') return 0
  return requestAnimationFrame(() => {
    requestAnimationFrame(callback)
  })
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
