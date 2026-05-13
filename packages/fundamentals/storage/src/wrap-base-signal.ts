import type { signal } from '@pyreon/reactivity'

/**
 * Wrap a base `signal()` from `@pyreon/reactivity` with a callable that
 * fully participates in Pyreon's reactivity, including the compiler-
 * emitted DOM-binding fast paths (`_bindText` / `_bindDirect`).
 *
 * The wrapper:
 *   - Is callable: `wrapper()` returns `sig()` (read + subscribe).
 *   - Delegates `.peek` / `.subscribe` / `.direct` / `.debug` to the
 *     underlying signal — methods, not state, so re-binding is safe.
 *   - Forwards `.label` (getter + setter) to the underlying signal so
 *     dev-time naming carries through.
 *   - Forwards the internal `_v` field via getter so the compiler's
 *     `_bindText(wrapper, textNode)` fast path reads the live value.
 *     Without this, the binding writes `String(undefined)` → `''` on
 *     initial render AND every subscriber notification (the bug class
 *     fixed in PR #546 and now caught by the
 *     `pyreon/storage-signal-v-forwarding` lint rule).
 *
 * The wrapper is RETURNED as `signal()` minus the methods callers
 * typically OVERRIDE (`.set`, `.update`, `.remove`, plus any factory-
 * specific extras). Each storage factory layers its persistence
 * behavior on top by assigning these fields to the returned wrapper
 * before returning to the user.
 *
 * @example
 * ```ts
 * const sig = signal<T>(initialValue)
 * const storageSig = wrapBaseSignal(sig) as StorageSignal<T>
 * storageSig.set = (value: T) => {
 *   sig.set(value)
 *   localStorage.setItem(key, serialize(value))
 * }
 * storageSig.remove = () => { ... }
 * return storageSig
 * ```
 *
 * **Why this exists**: pre-2026-05-13 the same wrapper shape was
 * duplicated across 4 factories (~30 lines × 4 sites). The duplication
 * structurally enabled the `_v` forwarding bug — only `local.ts:createStorageSignal`
 * was shared between local + session; cookie / custom / indexed-db each had
 * their own factory body. Forgetting `_v` in one site went unnoticed for
 * ~9 months. This helper makes the contract single-source: every backend
 * gets the same wrapper, and field additions to the signal protocol land
 * in one place.
 */
export function wrapBaseSignal<T>(sig: ReturnType<typeof signal<T>>): {
  (): T
  peek(): T
  subscribe(listener: () => void): () => void
  direct(updater: () => void): () => void
  debug(): unknown
  label: string | undefined
} {
  type Wrapper = {
    (): T
    peek(): T
    subscribe(listener: () => void): () => void
    direct(updater: () => void): () => void
    debug(): unknown
    label: string | undefined
  }

  const wrapper = (() => sig()) as unknown as Wrapper

  wrapper.peek = () => sig.peek()
  wrapper.subscribe = (listener: () => void) => sig.subscribe(listener)
  wrapper.direct = (updater: () => void) => sig.direct(updater)
  wrapper.debug = () => sig.debug()

  Object.defineProperty(wrapper, 'label', {
    get: () => sig.label,
    set: (v: string | undefined) => {
      sig.label = v
    },
    configurable: true,
  })

  // Forward `_v` so the compiler-emitted `_bindText(wrapper, textNode)`
  // fast path reads the live value. See file header for context.
  Object.defineProperty(wrapper, '_v', {
    get: () => (sig as unknown as { _v: T })._v,
    configurable: true,
  })

  return wrapper
}
