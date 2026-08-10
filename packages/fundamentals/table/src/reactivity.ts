import { batch, computed, signal, untrack } from '@pyreon/reactivity'
import type { Atom, ReadonlyAtom, Subscription } from '@tanstack/store'
import type { TableAtomOptions, TableReactivityBindings } from '@tanstack/table-core/reactivity'

/**
 * TanStack Table v9 reactivity bindings backed by Pyreon signals.
 *
 * v9 exposes a first-class seam (`coreReactivityFeature`) that adapters
 * implement so table-core's internal state atoms ARE the host framework's
 * reactive primitives. Backing them with Pyreon signals means the table's
 * state lives directly in Pyreon's graph: reading a row model inside any
 * reactive scope subscribes with no adapter glue, and a write notifies
 * through Pyreon's own batching.
 *
 * This replaces the v8 adapter's version-counter + whole-state structural
 * equality machinery, which existed only because v8 had no such seam.
 *
 * `Atom` / `ReadonlyAtom` are structural interfaces (`get`/`set`/`subscribe`),
 * not classes, so a Pyreon-backed implementation satisfies them directly.
 */

/** Pyreon signal -> writable `Atom`, honoring the atom's `compare` option. */
function writableAtom<T>(initialValue: T, options?: TableAtomOptions<T>): Atom<T> {
  const sig = signal<T>(initialValue)
  const compare = options?.compare
  return {
    get: () => sig(),
    // Pyreon's `signal` has no `equals` hook (only `computed` does), so the
    // compare contract is honored here: an equal write is a no-op, which is
    // what keeps table-core from notifying on no-op state re-emissions.
    set: ((next: T | ((prev: T) => T)) => {
      const prev = sig.peek()
      const value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next
      if (compare?.(prev, value)) return
      sig.set(value)
    }) as Atom<T>['set'],
    subscribe: ((observer: unknown) => {
      const next = toNext<T>(observer)
      const dispose = sig.subscribe(() => next(sig.peek()))
      return { unsubscribe: dispose }
    }) as Atom<T>['subscribe'],
  }
}

/** Pyreon computed -> `ReadonlyAtom`. */
function readonlyAtom<T>(fn: () => T, options?: TableAtomOptions<T>): ReadonlyAtom<T> {
  const compare = options?.compare
  // `equals` makes the computed eager + notify-on-change-only, which is
  // exactly the atom `compare` contract.
  const c = compare ? computed(fn, { equals: compare }) : computed(fn)
  return {
    get: () => c(),
    subscribe: ((observer: unknown) => {
      const next = toNext<T>(observer)
      // Prime the computed before attaching. Pyreon's `computed` is LAZY: it
      // subscribes to its dependencies only when first evaluated, so a direct
      // subscriber registered on a never-read computed attaches to a node with
      // no upstream edges and NEVER fires. Reading once builds the graph.
      //
      // `untrack` so priming cannot leak this read into whatever reactive
      // scope happened to call `subscribe` — that would make the caller
      // re-run on every table state change.
      //
      // The shipped table hides this: rendering reads the row models before
      // anything subscribes. It surfaces the moment core (or a consumer)
      // subscribes to a derived atom it has not read yet, and the failure is
      // silent — no error, just an atom that never updates.
      untrack(() => c())
      // Pyreon's `Computed` exposes `direct()`/`_v` (the compiler-binding
      // seam) rather than `subscribe()`/`peek()`.
      const dispose = c.direct(() => next(c._v))
      return { unsubscribe: dispose }
    }) as ReadonlyAtom<T>['subscribe'],
  }
}

/** TanStack's `subscribe` accepts either an observer object or a bare `next`. */
function toNext<T>(observer: unknown): (value: T) => void {
  if (typeof observer === 'function') return observer as (value: T) => void
  const next = (observer as { next?: (value: T) => void }).next
  return next ? next.bind(observer) : () => {}
}

/**
 * Build a fresh set of Pyreon reactivity bindings for one table instance.
 *
 * Each table gets its own bindings object because `addSubscription` /
 * `unmount` are per-instance lifetime bookkeeping.
 */
export function pyreonReactivity(): TableReactivityBindings {
  const subscriptions: Subscription[] = []
  return {
    // Makes `table.options` an atom, so an options change (new `data`,
    // new `columns`) invalidates the derived row-model atoms natively —
    // the mechanism that replaces the v8 version counter.
    createOptionsStore: true,
    // Re-wrap a consumer-supplied external atom into a Pyreon-backed one so
    // the table's graph stays uniformly Pyreon (bidirectionally synced by
    // core, which is why `addSubscription` must be real, not a throw).
    wrapExternalAtoms: true,
    addSubscription: (subscription) => subscriptions.push(subscription),
    createWritableAtom: (initialValue, options) => writableAtom(initialValue, options),
    createReadonlyAtom: (fn, options) => readonlyAtom(fn, options),
    untrack: (fn) => untrack(fn),
    batch: (fn) => batch(fn),
    schedule: (fn) => queueMicrotask(fn),
    unmount: () => {
      for (const subscription of subscriptions) subscription.unsubscribe()
      subscriptions.length = 0
    },
  }
}
