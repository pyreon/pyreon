/**
 * createRef — mutable container for a DOM element or component value.
 *
 * Usage:
 *   const inputRef = createRef<HTMLInputElement>()
 *   onMount(() => { inputRef.current?.focus() })
 *   return <input ref={inputRef} />
 *
 * The runtime sets `ref.current` after the element is inserted into the DOM
 * and clears it to `null` when the element is removed.
 */

export interface Ref<T = unknown> {
  current: T | null
}

/** Callback ref — receives the element on mount and null on unmount. */
export type RefCallback<T = unknown> = (el: T | null) => void

/**
 * Union of object ref and callback ref — accepted by the JSX ref prop.
 * Callback refs are called with the element on mount and with `null` on
 * unmount (matches React/Solid/Vue). Callback refs MUST accept `T | null`
 * — the previous `(el: T) => void` mount-only arm was removed in the
 * post-#233 cleanup because the runtime always invokes with null on
 * unmount and the narrower type silently lied to consumers.
 */
export type RefProp<T = unknown> = Ref<T> | RefCallback<T>

export function createRef<T = unknown>(): Ref<T> {
  return { current: null }
}

/**
 * A ref that is ALSO the accessor the element-consuming hooks want.
 *
 * Eleven hooks across `@pyreon/hooks` and `@pyreon/dnd` take their target as
 * `() => HTMLElement | null` — `useElementSize`, `useClickOutside`,
 * `useIntersection`, `useFocusTrap`, `useDraggable`, … That forces THREE
 * touchpoints for one concept:
 *
 * ```tsx
 * let el: HTMLElement | null = null          // 1. declare
 * useElementSize(() => el)                   // 2. hand-write the thunk
 * <div ref={(e) => (el = e)}>                // 3. wire it back
 * ```
 *
 * An `elementRef` is a single value that satisfies both shapes, because the
 * runtime already invokes a function ref as `ref(el)` on mount and `ref(null)`
 * on unmount — so "called with an argument" means SET, and "called with no
 * argument" means READ:
 *
 * ```tsx
 * const el = elementRef<HTMLDivElement>()
 * useElementSize(el)                         // it IS () => T | null
 * <div ref={el}>                             // and it IS a ref
 * ```
 *
 * Two touchpoints instead of three, and N hooks on one element add none —
 * they all take the same value. `.current` is kept so it drops into code
 * written against `createRef`.
 *
 * `undefined` is the read discriminator rather than an arity check because an
 * arrow function has no `arguments`, and `null` must stay a legal SET (that
 * is exactly what unmount passes).
 */
export interface ElementRef<T = HTMLElement> {
  (): T | null
  (el: T | null): void
  readonly current: T | null
}

export function elementRef<T = HTMLElement>(): ElementRef<T> {
  let cur: T | null = null
  const r = ((el?: T | null): T | null | void => {
    if (el === undefined) return cur
    cur = el
  }) as ElementRef<T>
  Object.defineProperty(r, 'current', { get: () => cur, configurable: true })
  return r
}
