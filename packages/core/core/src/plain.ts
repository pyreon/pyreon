/**
 * Plain Mode markers — `state`, `derived`, `effect`.
 *
 * These are COMPILE-TIME markers, not runtime primitives. A module that
 * either carries the `'use plain'` directive or imports from
 * `@pyreon/core/plain` is rewritten by the Pyreon compiler's plain pre-pass
 * (`@pyreon/compiler` `transformPlain`) BEFORE the JSX transform:
 *
 *   let count = state(0)          →  const count = signal(0)
 *   count = count + 1             →  count.set(count() + 1)
 *   const double = derived(count * 2)
 *                                 →  const double = computed(() => (count() * 2))
 *   effect(() => log(count))      →  effect(() => log(count()))
 *
 * The marker import itself is REMOVED by the pre-pass and replaced with the
 * real `@pyreon/reactivity` imports, so these functions never run in
 * compiled code. They exist for two reasons:
 *
 *  1. **Types.** `state<T>(v: T): T` deliberately returns `T`, not
 *     `Signal<T>` — that is the whole point of Plain Mode: `count * 2`
 *     typechecks, `count = 5` typechecks, and the compiler makes both
 *     reactive. The types describe the POST-COMPILE semantics.
 *  2. **A loud failure when the compiler did not run.** Reaching one of
 *     these bodies at runtime means the file was never processed by the
 *     Pyreon plugin (missing `pyreon()` in vite config, a bare `tsc` run,
 *     a bundler without the plugin). Silently degrading would produce a
 *     non-reactive app that LOOKS right on first paint — the worst
 *     possible failure shape — so every marker throws with the fix.
 */

function notCompiled(name: string): Error {
  return new Error(
    `[Pyreon] ${name}() from '@pyreon/core/plain' reached the runtime — this file was not ` +
      `processed by the Pyreon compiler. Plain Mode is a compile-time dialect: add the ` +
      `pyreon() plugin from '@pyreon/vite-plugin' to your vite config (and make sure this ` +
      `file matches its transform filter). Nothing from '@pyreon/core/plain' works without it.`,
  )
}

/**
 * Declare reactive state. Compiles to `signal(initial)`; every read of the
 * binding compiles to a tracked call and every assignment to `.set(...)`.
 *
 * The return type is deliberately `T` (the VALUE), not `Signal<T>` — Plain
 * Mode code reads and writes the binding like an ordinary variable.
 *
 * @example
 * ```tsx
 * 'use plain'
 * import { state } from '@pyreon/core/plain'
 *
 * let count = state(0)
 * const inc = () => { count = count + 1 }
 * export const Counter = () => <button onClick={inc}>{count}</button>
 * ```
 */
export function state<T>(initial: T): T {
  void initial
  throw notCompiled('state')
}

/**
 * Declare a derived (computed) value from an expression. Compiles to
 * `computed(() => expr)` — the expression is re-evaluated when any state it
 * mentions changes. Assigning to a derived binding is a compile-time error.
 *
 * @example
 * ```tsx
 * const double = derived(count * 2)
 * ```
 */
export function derived<T>(expr: T): T {
  void expr
  throw notCompiled('derived')
}

/**
 * Run a side effect that re-runs when any state it mentions changes.
 * Compiles to `@pyreon/reactivity`'s `effect(fn)` with TOTAL tracking: every
 * state binding the callback statically mentions is subscribed, even when a
 * particular run does not reach the read (a conditional branch, code after
 * an `await`). The callback may return a cleanup function.
 *
 * @example
 * ```tsx
 * effect(() => {
 *   if (verbose) console.log(count) // subscribes to BOTH, always
 * })
 * ```
 */
export function effect(fn: () => void | (() => void)): void {
  void fn
  throw notCompiled('effect')
}
