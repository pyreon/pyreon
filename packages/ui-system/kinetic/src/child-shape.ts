import type { Ref, VNode } from '@pyreon/core'
import { Fragment, h, onMount } from '@pyreon/core'

type RefLike<T> = ((node: T | null) => void) | Ref<T>

// ─── Child shapes ───────────────────────────────────────────

/**
 * A pre-built DOM item: what the compiler emits (`_tpl(...)`) for a static
 * child such as `<li>Install</li>`. It carries a real element, not props, so
 * it cannot be cloned with a new `ref` / `style` — see `cloneVNode`.
 */
type NativeChildItem = { __isNative: true; readonly el: HTMLElement }

export const isNativeItem = (value: unknown): value is NativeChildItem =>
  value != null &&
  typeof value === 'object' &&
  (value as { __isNative?: unknown }).__isNative === true

export const isVNodeLike = (value: unknown): value is VNode =>
  value != null &&
  typeof value === 'object' &&
  'type' in (value as object) &&
  'props' in (value as object)

/**
 * Every child the per-item renderers (stagger, group) animate, flattened.
 *
 * Children reach kinetic in more shapes than `VNode[]`:
 * - accessors, possibly NESTED: the compiler wraps a forwarded `children`
 *   in `() => …`, and a user's reactive list is itself `() => items.map(…)`,
 *   so a group receives an accessor returning an accessor;
 * - arrays and fragments, at any depth;
 * - compiled static markup (`_tpl` items on the client, `_ssr` raw HTML on the
 *   server), which are not VNodes at all.
 *
 * Accessors are CALLED, so a caller inside a tracking scope subscribes to the
 * list. Primitives (text) and empty values are dropped: there is no element to
 * animate.
 */
export const flattenChildren = (children: unknown): unknown[] => {
  const out: unknown[] = []
  const walk = (child: unknown): void => {
    if (typeof child === 'function') {
      walk((child as () => unknown)())
      return
    }
    if (Array.isArray(child)) {
      for (const c of child) walk(c)
      return
    }
    if (child == null || typeof child !== 'object') return
    if (isVNodeLike(child) && child.type === Fragment) {
      const fragmentChildren = (child.props as { children?: unknown } | null)?.children
      walk(child.children?.length ? child.children : fragmentChildren)
      return
    }
    out.push(child)
  }
  walk(children)
  return out
}

/**
 * Applies a ref, style and class to a pre-built element when it mounts. The
 * element is read at mount, not captured: a compiled item that was unmounted
 * (a `<Show>` toggling it) is rebuilt with a fresh element on its next mount,
 * so each mount decorates the element it actually inserted.
 */
const NativeChild = (props: Record<string, unknown>): VNode => {
  const item = props.item as NativeChildItem
  onMount(() => {
    const el = item.el
    const cls = props.class
    if (typeof cls === 'string') {
      for (const token of cls.split(/\s+/)) if (token) el.classList.add(token)
    }
    const style = props.style as Record<string, unknown> | undefined
    if (style) {
      for (const key in style) {
        const value = style[key]
        if (value == null) continue
        if (key.startsWith('--')) el.style.setProperty(key, String(value))
        else (el.style as unknown as Record<string, string>)[key] = String(value)
      }
    }
    const ref = props.ref as RefLike<HTMLElement> | undefined
    setRef(ref, el)
    return () => setRef(ref, null)
  })
  return item as unknown as VNode
}

const setRef = (ref: RefLike<HTMLElement> | undefined, el: HTMLElement | null): void => {
  if (!ref) return
  if (typeof ref === 'function') ref(el)
  else (ref as { current: unknown }).current = el
}

/**
 * Wraps a compiled pre-built item so it can take the `ref` / `style` / `class`
 * a renderer needs: they are set on its element at mount, ADDED to the
 * element's own class and style. `cloneVNode` routes such items here.
 */
export const wrapNativeItem = (item: NativeChildItem, extra: Record<string, unknown>): VNode =>
  h(NativeChild, { ...extra, item })

/** The child's own `ref` / `style` / `class`, whatever its shape. */
export const childProps = (child: unknown): Record<string, unknown> =>
  isVNodeLike(child) ? ((child.props ?? {}) as Record<string, unknown>) : {}
