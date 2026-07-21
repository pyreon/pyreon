/**
 * Re-exported from `@pyreon/core`, which is its canonical home: it is a PROPS
 * primitive (it reads a props accessor and owns no lifecycle), it imports
 * nothing but `signal`, and it is used in the same breath as core's
 * `splitProps`/`mergeProps`.
 *
 * Keeping the implementation here forced any consumer of the
 * controlled/uncontrolled pattern to depend on `@pyreon/hooks` and its 40+
 * unrelated hooks for ~20 lines. `@pyreon/elements` needs the pattern and sits
 * in the ui-system layer, so pulling it from a fundamentals package would have
 * crossed the layer boundary. Its canonical home in `@pyreon/core` keeps the
 * pattern reachable from every layer.
 *
 * This re-export keeps `@pyreon/hooks`' public API unchanged — the same
 * cross-layer idiom `@pyreon/core` already uses for reactivity's
 * `isClient`/`isServer`.
 */
export { useControllableState, type UseControllableState } from '@pyreon/core'
export { useControllableState as default } from '@pyreon/core'
