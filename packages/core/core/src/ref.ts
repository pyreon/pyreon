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
 * unmount (matches React/Solid/Vue behavior). The `(el: T) => void` arm
 * is a TypeScript convenience for mount-only handlers — if you care
 * about cleanup, use `RefCallback<T>` explicitly and handle the null
 * case, or use an object `Ref<T>` and read `ref.current` when needed.
 */
export type RefProp<T = unknown> = Ref<T> | RefCallback<T> | ((el: T) => void)

export function createRef<T = unknown>(): Ref<T> {
  return { current: null }
}
