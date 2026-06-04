import type { Signal } from './signal'

export interface WrapSignalOptions<T> {
  /**
   * Custom write behavior. Runs in place of the base signal's `.set`; do your
   * side effect (persist / emit a patch / validate) and call through to the
   * base signal (`base.set(value)`) when you want the value to actually update.
   */
  set: (value: T) => void
  /** Optional custom `.update`. Defaults to `set(fn(peek()))`. */
  update?: (fn: (current: T) => T) => void
}

/**
 * Build a signal FACADE over `base` with custom write behavior — the canonical
 * way to make "a signal whose write runs a side effect" (persistence, patch
 * emission, validation), where the value lives on a shared/owned base signal.
 *
 * Reads (`()`, `.peek`, `.subscribe`, `.direct`, `.debug`, `.label`) AND the
 * internal `_v` field are delegated to `base`, so the facade satisfies the FULL
 * signal contract the compiler's `_bindText` / `_bindDirect` fast paths depend
 * on — they read `source._v` and call `source.direct(...)` DIRECTLY, bypassing
 * the function call, so a facade that exposes `.direct` but forgets `_v` (or
 * vice-versa) silently binds to `undefined` and renders `''`. The primitive
 * forwards BOTH by construction, so that bug class is structurally impossible —
 * which is why hand-rolled facades (the shape `pyreon/storage-signal-v-forwarding`
 * guards against) should be replaced with this.
 *
 * Returned as a distinct callable each time, so callers that need per-consumer
 * identity (e.g. independent `.remove()` / refcount semantics over a SHARED
 * base signal) get it for free.
 *
 * @example
 * const persisted = wrapSignal(base, {
 *   set: (v) => { base.set(v); localStorage.setItem(key, serialize(v)) },
 * })
 */
export function wrapSignal<T>(base: Signal<T>, options: WrapSignalOptions<T>): Signal<T> {
  const facade = (() => base()) as unknown as Signal<T>

  facade.peek = () => base.peek()
  facade.subscribe = (listener: () => void) => base.subscribe(listener)
  facade.direct = (updater: () => void) => base.direct(updater)
  facade.debug = () => base.debug()

  Object.defineProperty(facade, 'label', {
    get: () => base.label,
    set: (v: string | undefined) => {
      base.label = v
    },
    configurable: true,
  })

  // Forward the internal `_v` field — load-bearing for the compiler-emitted
  // `_bindText(facade, textNode)` / `_bindDirect` fast paths, which read
  // `source._v` directly to skip the function call.
  Object.defineProperty(facade, '_v', {
    get: () => (base as unknown as { _v: T })._v,
    configurable: true,
  })

  facade.set = options.set
  facade.update = options.update ?? ((fn: (current: T) => T) => options.set(fn(base.peek())))

  return facade
}
