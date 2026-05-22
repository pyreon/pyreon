/**
 * Cross-module-instance state registry — the canonical mechanism for any
 * module-level mutable state in `@pyreon/*` that needs to survive being
 * loaded twice in the same JS heap.
 *
 * ## The problem this solves
 *
 * Bundlers can produce TWO module instances of the same package when
 * different consumers reach it via different resolution paths. Vite's
 * `[bare]` resolver honors export conditions while `[package entry]`
 * ignores them; subdep version mismatches; future bundler quirks. Each
 * instance has its own `let _foo = ...` at module scope → producers
 * and consumers land on DIFFERENT copies → silent data corruption.
 *
 * Real bug class fixed by [PR #855](https://github.com/pyreon/pyreon/pull/855):
 * `@pyreon/core`'s `_current` lifecycle hook tracker was duplicated under
 * Vite SSR dev → every `provide()` call produced `[Pyreon] onUnmount()
 * called outside component setup` warnings because the `_current` set by
 * one module-instance's `runWithHooks` was invisible to the other
 * module-instance's `onUnmount`.
 *
 * ## Pattern
 *
 * Every at-risk state var lives on `globalThis` under a `Symbol.for` key:
 * both module instances reach the SAME object via the global symbol
 * registry. The first instance to load creates the state; subsequent
 * instances find it via `Symbol.for` (idempotent global lookup) and use
 * the existing object.
 *
 * Same pattern as the existing `_bridgeHost = globalThis as
 * PyreonErrorBridge` in `telemetry.ts:113` and the
 * `Symbol.for('pyreon:native-compat')` marker in `compat-marker.ts`.
 *
 * ## Why a helper
 *
 * PR #855 inlined the `Symbol.for(...) ?? init; if (!g[KEY]) g[KEY] = …`
 * pattern into 5 places in `@pyreon/core`. Across 30+ at-risk state vars
 * in 15+ packages, that boilerplate would balloon. `defineCrossModuleState`
 * is the one-liner replacement.
 *
 * @example
 * // Replace:
 * //   let _current: LifecycleHooks | null = null
 * //   export function setCurrentHooks(hooks) { _current = hooks }
 * //
 * // With:
 *   const state = defineCrossModuleState('@pyreon/core/lifecycle', () => ({
 *     current: null as LifecycleHooks | null,
 *   }))
 *   export function setCurrentHooks(hooks: LifecycleHooks | null) {
 *     state.current = hooks
 *   }
 *
 * @param key
 *   Stable string identifier — passed to `Symbol.for(...)` verbatim. The
 *   key MUST be unique across the whole `@pyreon/*` namespace AND
 *   adjacent libraries — two state vars with the same key collide on the
 *   same registry slot.
 *
 *   Convention: `'pyreon-<package>/<state-name>'`:
 *   - `'pyreon-core/lifecycle-state'`
 *   - `'pyreon-reactivity/tracking-state'`
 *   - `'pyreon-router/active-state'`
 *
 *   Why no automatic prefix: keys are stable contracts. Callers own them
 *   verbatim so a future refactor of the helper internals never silently
 *   shifts where state lives on `globalThis`. The convention is enforced
 *   by code review + the documented prefix; if a key collision ever
 *   surfaces in audit, the namespace prefix makes the offender obvious.
 *
 * @param init
 *   Factory invoked ONCE per JS heap (first module instance to call
 *   `defineCrossModuleState` with this key wins). Subsequent calls in
 *   other module instances find the existing state via the symbol
 *   registry and skip the factory entirely. Must return a mutable
 *   object — primitives won't survive cross-instance updates.
 *
 * @returns
 *   The single shared state object. Every module instance calling with
 *   the same `key` returns the identical reference (same `===`).
 */
export function defineCrossModuleState<T extends object>(key: string, init: () => T): T {
  const symKey = Symbol.for(key)
  const host = globalThis as Record<symbol, unknown>
  const existing = host[symKey] as T | undefined
  if (existing) return existing
  const state = init()
  host[symKey] = state
  return state
}
