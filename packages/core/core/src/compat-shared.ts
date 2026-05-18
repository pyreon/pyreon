/**
 * Code shared by the framework-compat JSX runtimes
 * (`@pyreon/react-compat`, `@pyreon/preact-compat`).
 *
 * These helpers were previously copy-pasted byte-for-byte into both
 * packages. `@pyreon/core` is the correct single home — it's already a
 * dependency of every compat package and already hosts the sibling
 * cross-compat module `compat-marker.ts` (`nativeCompat` / `isNativeCompat`).
 */

/**
 * Shallow props comparison used by compat `memo()` / `useState` bailout.
 * Same-length key sets with `Object.is`-equal values → equal.
 */
export function shallowEqualProps<P extends Record<string, unknown>>(a: P, b: P): boolean {
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  for (const k of keysA) {
    if (!Object.is(a[k], b[k])) return false
  }
  return true
}

/**
 * Map React/Preact-style DOM attributes to standard HTML attributes,
 * mutating `props` in place. No-op when `type` is not a host string
 * (component vnodes keep their props untouched).
 *
 * The React and Preact variants were identical apart from React also
 * stripping `suppressContentEditableWarning`. Both keys are React/Preact
 * authoring-only and never valid DOM attributes, so always stripping
 * both is behavior-preserving for Preact (the key is never set there;
 * `delete` of an absent key is a no-op) and removes the only divergence.
 */
export function mapCompatDomProps(props: Record<string, unknown>, type: unknown): void {
  if (typeof type !== 'string') return

  if (props.className !== undefined) {
    props.class = props.className
    delete props.className
  }
  if (props.htmlFor !== undefined) {
    props.for = props.htmlFor
    delete props.htmlFor
  }

  // React/Preact onChange fires on every keystroke for form elements (like onInput)
  if (
    (type === 'input' || type === 'textarea' || type === 'select') &&
    props.onChange !== undefined
  ) {
    if (props.onInput === undefined) {
      props.onInput = props.onChange
    }
    delete props.onChange
  }

  // autoFocus → autofocus
  if (props.autoFocus !== undefined) {
    props.autofocus = props.autoFocus
    delete props.autoFocus
  }

  // defaultValue / defaultChecked → value / checked when no controlled value
  if (type === 'input' || type === 'textarea') {
    if (props.defaultValue !== undefined && props.value === undefined) {
      props.value = props.defaultValue
      delete props.defaultValue
    }
    if (props.defaultChecked !== undefined && props.checked === undefined) {
      props.checked = props.defaultChecked
      delete props.defaultChecked
    }
  }

  // Strip authoring-only props that have no DOM equivalent
  delete props.suppressHydrationWarning
  delete props.suppressContentEditableWarning
}
