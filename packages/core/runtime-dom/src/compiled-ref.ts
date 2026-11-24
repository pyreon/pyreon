import { _noopDispose } from '@pyreon/reactivity'
import { _userCodeHook } from './parked-text'
import { releaseRef } from './teardown'

/**
 * Compiler-emitted `ref` application for a template element: the h() path's
 * semantics (`mountElement`). A function is called with the element, an object
 * ref gets `.current`; the returned disposer hands back `null` on unmount
 * (#4390: compiled refs were never cleared, so a callback ref never saw `null`
 * and an object ref kept a detached element alive).
 *
 * TIMING CONTRACT, shared with the h() path: a ref fires ONCE, synchronously
 * during mount, with an element owned by the page document (so
 * `ownerDocument.defaultView` is the window). It is NOT guaranteed to be in
 * the live document: an h() subtree is built detached and inserted whole, and
 * a compiled template binds on its clone before insertion (its ROOT element
 * has no parent yet). Layout reads, `getComputedStyle` and observers that need
 * a connected element belong in `onMount`. On unmount the ref receives
 * `null`.
 *
 * ORDER, shared with the h() path: the compiler emits this call in the
 * template's post-order ref tail, after every other bind line (#4764), so a ref
 * sees its element's content and computed attributes, and a child's ref runs
 * before its parent's. A spread's ref is applied there too (`.r()`).
 */
export function _ref(el: Element, ref: unknown): () => void {
  // No ref (a spread without one reaches here through `.r()`): no user code.
  if (ref == null) return _noopDispose
  _userCodeHook?.(el)
  if (typeof ref === 'function') {
    ;(ref as (el: Element | null) => void)(el)
    return () => releaseRef(ref)
  }
  if (typeof ref === 'object') {
    ;(ref as { current: Element | null }).current = el
    return () => releaseRef(ref)
  }

  return _noopDispose
}
