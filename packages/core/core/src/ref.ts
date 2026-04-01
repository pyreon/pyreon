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
 * Also accepts `(el: T) => void` (mount-only callback) for convenience —
 * these are called with the element on mount but NOT called with null on unmount.
 */
export type RefProp<T = unknown> = Ref<T> | RefCallback<T> | ((el: T) => void)

export function createRef<T = unknown>(): Ref<T> {
  return { current: null }
}
