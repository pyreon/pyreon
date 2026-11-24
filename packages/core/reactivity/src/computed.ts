import { _errorHandler } from './errors'
import {
  type ComputedNode,
  F_COMPUTED,
  F_DIRTY,
  F_DISPOSED,
  F_HAS_VALUE,
  F_PENDING,
  type Link,
  _t,
  link,
  refreshComputed,
  runUntracked,
  unlinkAllDeps,
} from './graph'
import { _captureCallerLocation, _rdDirect, _rdRegister } from './reactive-devtools'
import { _ownerScope } from './scope'
import { _addDirect, _removeDirect } from './signal'

export interface Computed<T> {
  (): T
  /** Remove this computed from all its reactive dependencies. */
  dispose(): void
  /** Cached value for compiler-emitted direct bindings (_bindText, _bindDirect). */
  _v: T
  /** Register a direct updater — used by compiler-emitted _bindText/_bindDirect. */
  direct(updater: () => void): () => void
}

export interface ComputedOptions<T> {
  /**
   * Custom equality comparator. A computed ALREADY gates on value by default
   * (`Object.is`, like `signal.set`), so pass this only when identity is the
   * wrong test — typically a derivation that rebuilds a fresh array/object whose
   * CONTENTS are unchanged, which `Object.is` can never gate.
   *
   * When the comparator says the new value equals the previous one, the
   * computed keeps the PREVIOUS value (a stable reference) and nothing that
   * reads it re-runs. Like every computed it is lazy: it evaluates only when
   * something reads it (directly, or through an effect, binding or computed
   * that depends on it), never just because a dependency changed.
   *
   * @example
   * const sorted = computed(() => items().slice().sort(), {
   *   equals: (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
   * })
   */
  equals?: (prev: T, next: T) => boolean
  /**
   * @internal Source location injected by `@pyreon/vite-plugin` at build time.
   * When present the runtime skips the `new Error().stack` capture in
   * `_rdRegister` — saves ~2.2us per computed creation when devtools is active.
   * User code should NOT set this.
   */
  __sourceLocation?: { file: string; line: number; col: number }
}

// Internal shape of a computed read function — state stored as PLAIN FIELDS on
// the function object (fast in-object properties, exactly like `signal`), with
// shareable methods on `ComputedProto`. The read function IS the graph node: it
// is the source its readers link to and the subscriber its own reads link
// from, so there is no separate notify closure, dispose closure or deps array.
interface ComputedFn<T> extends ComputedNode {
  (): T
  _value: T
  _v: T
  dispose(): void
  _dispose(): void
  direct(updater: () => void): () => void
}

/**
 * Shared prototype for every computed — `direct`, `dispose` and the `_v`
 * getter live here (one allocation total). Mirrors `SignalProto`, including
 * the `setPrototypeOf(_, Function.prototype)` step so computeds keep
 * `instanceof Function === true` (consumers across the ecosystem discriminate
 * reactive values that way).
 */
const ComputedProto = {
  direct(this: ComputedFn<unknown>, updater: () => void): () => void {
    // Dev: instrumented wrapper — see `_directFn` in signal.ts.
    if (process.env.NODE_ENV !== 'production') updater = _rdDirect(updater)
    _addDirect(this, updater)
    const self = this
    return () => _removeDirect(self, updater)
  },
  /**
   * Remove this computed from all its sources. A disposed computed keeps its
   * last value and never re-links: reading it later returns that value (or,
   * if it never evaluated, evaluates once, untracked).
   */
  _dispose(this: ComputedFn<unknown>): void {
    const f = this._f
    if ((f & F_DISPOSED) !== 0) return
    this._f = (f & ~(F_DIRTY | F_PENDING)) | F_DISPOSED
    unlinkAllDeps(this)
  },
  /** Public disposer — works detached (`onCleanup(c.dispose)`), see `EffectNode.dispose`. */
  get dispose(): () => void {
    const self = this as unknown as ComputedFn<unknown>
    return () => self._dispose()
  },
  get _v() {
    // Getters can't declare a `this` param (TS2784); narrow inline.
    const self = this as unknown as ComputedFn<unknown>
    if ((self._f & (F_DIRTY | F_PENDING)) !== 0) refreshComputed(self)
    else if ((self._f & (F_HAS_VALUE | F_DISPOSED)) === F_DISPOSED) readDisposedFirst(self)
    return self._value
  },
}
Object.setPrototypeOf(ComputedProto, Function.prototype)

/** A computed disposed before it ever evaluated: evaluate once, UNTRACKED. */
function readDisposedFirst(c: ComputedFn<unknown>): void {
  c._f |= F_HAS_VALUE
  try {
    c._value = runUntracked(c._fn)
  } catch (err) {
    _errorHandler(err)
  }
}

export function computed<T>(fn: () => T, options?: ComputedOptions<T>): Computed<T> {
  // `computed(async () => …)` returns `Computed<Promise<T>>`, silently breaking
  // every consumer expecting `Computed<T>`: the evaluation runs synchronously
  // and only tracks signals in the synchronous prefix.
  if (process.env.NODE_ENV !== 'production') {
    if (fn.constructor && fn.constructor.name === 'AsyncFunction') {
      // oxlint-disable-next-line no-console
      console.warn(
        '[pyreon] computed() received an async function. The result type becomes `Computed<Promise<T>>`, and signal reads after the first `await` are NOT tracked. ' +
          'Use `createResource` for async-derived state, or compute synchronously over a signal that holds the awaited value.',
      )
    }
  }

  /**
   * The read. Resolves its own marks first (`refreshComputed`: re-evaluate if
   * a source changed, else clear without running), THEN links to the reader —
   * so a change found by this very read never re-queues the reader that is
   * reading the new value right now.
   *
   * Kept this small on purpose so V8 inlines it into its callers; the cold
   * paths (resolution, disposal) live in module functions.
   */
  const read = (() => {
    const f = read._f
    if ((f & (F_DIRTY | F_PENDING)) !== 0) refreshComputed(read)
    // Unmarked without a value: only a computed disposed before it ever
    // evaluated (a live one starts DIRTY and keeps a mark until it has a value).
    else if ((f & F_HAS_VALUE) === 0) readDisposedFirst(read)
    const sub = _t.e
    if (sub !== null) link(read, sub)
    return read._value
  }) as unknown as ComputedFn<T>

  Object.setPrototypeOf(read, ComputedProto)
  read._value = undefined as T
  // Starts DIRTY: the first read evaluates (and that evaluation is not a change).
  read._f = F_COMPUTED | F_DIRTY
  read._fn = fn
  read._eq = (options?.equals as ComputedNode['_eq'] | undefined) ?? null
  read._deps = null
  read._depsTail = null
  read._subs = null as Link | null
  read._subsTail = null
  read._d1 = null
  read._d = null

  if (process.env.NODE_ENV !== 'production')
    // skipFrames=1: skip `computed`, capture the user's call site.
    _rdRegister(
      read,
      'derived',
      read,
      read,
      undefined,
      options?.__sourceLocation ?? _captureCallerLocation(1),
    )

  // The scope stores the node itself; `stop()` calls its prototype `dispose`.
  // `_ownerScope()`: the current scope WITHOUT pinning it, else the server
  // request's scope.
  _ownerScope()?.add(read)
  return read as unknown as Computed<T>
}
