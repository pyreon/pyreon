import { type Computed, computed } from './computed'
import { type Signal, signal } from './signal'
import { runUntracked } from './tracking'

/**
 * A writable derived value: it follows its source like a `computed`, and can
 * be overwritten locally like a `signal` until the source changes again.
 */
export interface LinkedSignal<T> {
  /** Read the value (tracked). */
  (): T
  /** Read the value without subscribing. */
  peek(): T
  /** Override the value until the source next changes. */
  set(value: T): void
  /** Override the value from the current one until the source next changes. */
  update(fn: (current: T) => T): void
  /** Stop following the source. Only needed outside a component or effect scope. */
  dispose(): void
}

/** The value a linked signal held, and the source value it was computed from. */
export interface LinkedPrevious<S, T> {
  source: S
  value: T
}

export interface LinkedOptions<T> {
  /**
   * Gate for downstream notifications, as in `computed`. Defaults to
   * `Object.is`. The SOURCE is always compared with `Object.is`.
   */
  equals?: (prev: T, next: T) => boolean
}

interface LinkedFn<T> extends LinkedSignal<T> {
  _c: Computed<T>
  _m: Signal<{ v: T } | undefined>
}

// Shared methods (assigned, not per-instance closures), like `signal`.
function peek<T>(this: LinkedFn<T>): T {
  return runUntracked(this._c)
}
function set<T>(this: LinkedFn<T>, value: T): void {
  // Settle the source first: a pending source change must not later discard
  // this write, which is the newer of the two.
  runUntracked(this._c)
  this._m.set({ v: value })
}
function update<T>(this: LinkedFn<T>, fn: (current: T) => T): void {
  this.set(fn(runUntracked(this._c)))
}
function dispose<T>(this: LinkedFn<T>): void {
  this._c.dispose()
}

/**
 * A signal whose value is derived from a source and reset whenever the source
 * changes, but which can also be written locally in between (Angular
 * `linkedSignal`). The typical case: a selection that must reset when the list
 * it selects from changes, while the user can still change it.
 *
 * - `linked(() => expr)` — the value is `expr`; any signal it reads resets it.
 * - `linked(source, (s, prev) => value)` — `source` is tracked; `compute` runs
 *   untracked with the new source value and the previous `{ source, value }`
 *   (`undefined` the first time), so it can keep a previous choice when it is
 *   still valid.
 *
 * The source is compared with `Object.is`: a recomputation that yields the
 * same source value keeps a local override. A write is the newest value until
 * the source changes again.
 *
 * @example
 * const options = signal(['a', 'b'])
 * const selected = linked(() => options()[0])
 * selected.set('b')          // local override → 'b'
 * options.set(['c', 'd'])    // source changed → 'c'
 *
 * @example
 * // keep the previous choice when it is still in the new list
 * const selected = linked(options, (opts, prev) =>
 *   prev && opts.includes(prev.value) ? prev.value : opts[0])
 */
export function linked<T>(compute: () => T, options?: LinkedOptions<T>): LinkedSignal<T>
export function linked<S, T>(
  source: () => S,
  compute: (source: S, previous: LinkedPrevious<S, T> | undefined) => T,
  options?: LinkedOptions<T>,
): LinkedSignal<T>
export function linked<S, T>(
  source: () => S,
  computeOrOptions?: ((source: S, previous: LinkedPrevious<S, T> | undefined) => T) | LinkedOptions<T>,
  maybeOptions?: LinkedOptions<T>,
): LinkedSignal<T> {
  const compute = typeof computeOrOptions === 'function' ? computeOrOptions : undefined
  const options = compute ? maybeOptions : (computeOrOptions as LinkedOptions<T> | undefined)
  const manual = signal<{ v: T } | undefined>(undefined)
  let started = false
  let prevSource: S
  let prevValue: T
  // The override already applied or superseded by a source change.
  let consumed: { v: T } | undefined

  const c = computed<T>(
    () => {
      const s = source()
      const m = manual()
      if (!started || !Object.is(s, prevSource)) {
        // An override written since the last evaluation is the previous value:
        // `set` settles the source before writing, so it belongs to `prevSource`.
        if (m !== consumed) prevValue = m!.v
        const prev = started ? { source: prevSource, value: prevValue } : undefined
        prevValue = compute ? runUntracked(() => compute(s, prev)) : (s as unknown as T)
        prevSource = s
        started = true
        consumed = m
      } else if (m !== consumed) {
        prevValue = m!.v
        consumed = m
      }
      return prevValue
    },
    options?.equals ? { equals: options.equals } : undefined,
  )

  const read = (() => c()) as LinkedFn<T>
  read._c = c
  read._m = manual
  read.peek = peek
  read.set = set
  read.update = update
  read.dispose = dispose
  return read
}
