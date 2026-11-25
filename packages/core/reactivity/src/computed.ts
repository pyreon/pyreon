import { _errorHandler } from './errors'
import {
  ComputedNode,
  F_DIRTY,
  F_DISPOSED,
  F_HAS_DIRECT,
  F_HAS_VALUE,
  F_PENDING,
  _t,
  link,
  refreshComputed,
  runUntracked,
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

// The callable a user holds is a BOUND function over the graph node
// (`ComputedNode` in graph.ts, a plain fixed-shape object), with shareable
// methods on `ComputedProto` and one own property: `_n`, the node. The node is
// what readers link to, what the scope disposes and what the walks visit; the
// callable only reads it. (A bound function needs no closure context, which
// keeps a computed at the size it had as one function object.)
interface ComputedFn<T> {
  (): T
  /** @internal the graph node */
  _n: ComputedNode
  _v: T
  dispose(): void
  direct(updater: () => void): () => void
}

/**
 * Shared prototype for every computed callable — `direct`, `dispose` and the
 * `_v` getter live here (one allocation total). Mirrors `SignalProto`,
 * including the `setPrototypeOf(_, Function.prototype)` step so computeds keep
 * `instanceof Function === true` (consumers across the ecosystem discriminate
 * reactive values that way).
 */
const ComputedProto = {
  direct(this: ComputedFn<unknown>, updater: () => void): () => void {
    // Dev: instrumented wrapper — see `_directFn` in signal.ts.
    if (process.env.NODE_ENV !== 'production') updater = _rdDirect(updater)
    const n = this._n
    _addDirect(n, updater)
    n._f |= F_HAS_DIRECT
    return () => {
      _removeDirect(n, updater)
      // The last updater left: marking stops queueing the node (it is lazy again).
      if (n._d1 === null && (n._d === null || n._d.size === 0)) n._f &= ~F_HAS_DIRECT
    }
  },
  /**
   * Public disposer — works detached (`onCleanup(c.dispose)`). Removes the
   * computed from all its sources; it keeps its last value and never
   * re-links: reading it later returns that value (or, if it never
   * evaluated, evaluates once, untracked).
   */
  get dispose(): () => void {
    const n = (this as unknown as ComputedFn<unknown>)._n
    return () => n._dispose()
  },
  get _v() {
    // Getters can't declare a `this` param (TS2784); narrow inline.
    const n = (this as unknown as ComputedFn<unknown>)._n
    const f = n._f
    if ((f & (F_DIRTY | F_PENDING)) !== 0) refreshComputed(n)
    else if ((f & (F_HAS_VALUE | F_DISPOSED)) === F_DISPOSED) readDisposedFirst(n)
    return n._value
  },
}
Object.setPrototypeOf(ComputedProto, Function.prototype)

/** A computed disposed before it ever evaluated: evaluate once, UNTRACKED. */
function readDisposedFirst(c: ComputedNode): void {
  c._f |= F_HAS_VALUE
  try {
    c._value = runUntracked(c._fn)
  } catch (err) {
    _errorHandler(err)
  }
}

/**
 * The read, bound to the node. Resolves its own marks first
 * (`refreshComputed`: re-evaluate if a source changed, else clear without
 * running), THEN links to the reader — so a change found by this very read
 * never re-queues the reader that is reading the new value right now.
 *
 * Kept this small on purpose so V8 inlines it into its callers; the cold
 * paths (resolution, disposal) live in module functions.
 */
function readComputed(this: ComputedNode): unknown {
  const f = this._f
  if ((f & (F_DIRTY | F_PENDING)) !== 0) refreshComputed(this)
  // Disposed before it ever evaluated: evaluate once, untracked. (A LIVE
  // computed is also unmarked without a value DURING its first evaluation —
  // a re-entrant read then returns `undefined`, it must not evaluate again.)
  else if ((f & (F_HAS_VALUE | F_DISPOSED)) === F_DISPOSED) readDisposedFirst(this)
  const sub = _t.e
  if (sub !== null) link(this, sub)
  return this._value
}

/**
 * @internal The graph node behind a computed callable (white-box tests and
 * the devtools walkers; not exported from the package entry).
 */
export function _computedNode(c: unknown): ComputedNode {
  return (c as ComputedFn<unknown>)._n
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

  const node = new ComputedNode(fn as () => unknown, (options?.equals as ComputedNode['_eq'] | undefined) ?? null)
  const read = readComputed.bind(node) as unknown as ComputedFn<T>
  Object.setPrototypeOf(read, ComputedProto)
  read._n = node

  if (process.env.NODE_ENV !== 'production') {
    // skipFrames=1: skip `computed`, capture the user's call site. The
    // callable is the registered identity (`_rdNodeId(c)`); the node is the
    // host the graph walkers read and the subscriber edges point at, and it
    // carries the same id so its evaluations record as this node's fires.
    const id = _rdRegister(
      read,
      'derived',
      node,
      node,
      undefined,
      options?.__sourceLocation ?? _captureCallerLocation(1),
    )
    Object.defineProperty(node, '__pxRdId', { value: id, enumerable: false, configurable: true })
  }

  // The scope stores the node itself; `stop()` calls its `_dispose`.
  // `_ownerScope()`: the current scope WITHOUT pinning it, else the server
  // request's scope.
  _ownerScope()?.add(node)
  return read as unknown as Computed<T>
}
