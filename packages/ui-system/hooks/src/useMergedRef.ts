type RefCallback<T> = (node: T | null) => void
type RefObject<T> = { current: T | null }
type Ref<T> = RefCallback<T> | RefObject<T>

export type UseMergedRef = <T>(...refs: (Ref<T> | undefined)[]) => (node: T | null) => void

/**
 * Merges multiple refs (callback or object) into a single callback ref.
 * Handles undefined, callback refs, and object refs with `.current`.
 */
export const useMergedRef = <T>(...refs: (Ref<T> | undefined)[]): ((node: T | null) => void) => {
  return (node: T | null) => {
    for (const ref of refs) {
      if (!ref) continue
      if (typeof ref === "function") {
        ref(node)
      } else {
        ;(ref as RefObject<unknown>).current = node
      }
    }
  }
}

export default useMergedRef
