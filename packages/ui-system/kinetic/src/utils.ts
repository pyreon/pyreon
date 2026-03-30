import type { Ref, VNode } from '@pyreon/core'
import type { CSSProperties } from './types'

const splitCache = new Map<string, string[]>()
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
 * which is required for CSS transitions to trigger.
 */
export const nextFrame = (callback: () => void): number =>
  requestAnimationFrame(() => {
    requestAnimationFrame(callback)
  })

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
