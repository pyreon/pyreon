// EffectScope — auto-tracks effects created during a component's setup
// and disposes them all at once when the component unmounts.

import { defineCrossModuleState } from './cross-module-state'

// Cross-module-instance shared current-scope tracker. An `effect()` created
// under one `@pyreon/reactivity` instance must register itself with the
// scope set by `runInScope` on any instance — otherwise its disposal escapes
// the component lifecycle.
const _state = defineCrossModuleState<{ currentScope: EffectScope | null }>(
  'pyreon-reactivity/scope-state',
  () => ({ currentScope: null }),
)

export class EffectScope {
  private _effects: { dispose(): void }[] | null = null
  private _active = true
  private _updateHooks: (() => void)[] | null = null
  private _updatePending = false

  /** Register an effect/computed to be disposed when this scope stops. */
  add(e: { dispose(): void }): void {
    if (!this._active) return
    if (this._effects === null) this._effects = []
    this._effects.push(e)
  }

  /**
   * Temporarily re-activate this scope so effects created inside `fn` are
   * auto-tracked and will be disposed when the scope stops.
   * Used to ensure effects created in `onMount` callbacks belong to their
   * component's scope rather than leaking as global effects.
   */
  runInScope<T>(fn: () => T): T {
    const prev = _state.currentScope
    _state.currentScope = this
    try {
      return fn()
    } finally {
      _state.currentScope = prev
    }
  }

  /** Register a callback to run after any reactive update in this scope. */
  addUpdateHook(fn: () => void): void {
    // Mirror `add()`'s behavior: silently no-op when scope is stopped.
    // Without this, hooks pushed after `stop()` would leak into a freshly-
    // allocated `_updateHooks` array and never fire (because `notifyEffectRan`
    // checks `_active` first), giving the caller no feedback that the
    // registration was futile.
    if (!this._active) return
    if (this._updateHooks === null) this._updateHooks = []
    this._updateHooks.push(fn)
  }

  /**
   * Called by effects after each non-initial re-run.
   * Schedules onUpdate hooks via microtask so all synchronous effects settle first.
   */
  notifyEffectRan(): void {
    if (!this._active || !this._updateHooks || this._updateHooks.length === 0 || this._updatePending) return
    this._updatePending = true
    queueMicrotask(() => {
      this._updatePending = false
      if (!this._active || !this._updateHooks) return
      for (const fn of this._updateHooks) {
        try {
          fn()
        } catch (err) {
          console.error('[pyreon] onUpdate hook error:', err)
        }
      }
    })
  }

  /** Dispose all tracked effects. */
  stop(): void {
    if (!this._active) return
    if (this._effects) {
      for (const e of this._effects) e.dispose()
    }
    this._effects = null
    this._updateHooks = null
    this._updatePending = false
    this._active = false
  }
}

export function getCurrentScope(): EffectScope | null {
  return _state.currentScope
}

export function setCurrentScope(scope: EffectScope | null): void {
  _state.currentScope = scope
}

/** Create a new EffectScope. */
export function effectScope(): EffectScope {
  return new EffectScope()
}

/**
 * Register a callback to run when the current `EffectScope` stops. Vue 3
 * parity. Must be called inside `scope.runInScope(fn)` — the registration
 * captures the ambient scope, so calling outside any scope is a no-op (with
 * a dev warning to surface the missing scope).
 *
 * Use to clean up resources tied to a scope's lifetime: timers, listeners,
 * external subscriptions. Equivalent to calling `getCurrentScope()?.add({
 * dispose: fn })` but with the scope capture handled.
 *
 * @example
 * scope.runInScope(() => {
 *   const ws = new WebSocket(url)
 *   onScopeDispose(() => ws.close())
 *   // ws.close() runs when scope.stop() is called
 * })
 */
export function onScopeDispose(fn: () => void): void {
  const scope = _state.currentScope
  if (!scope) {
    if (process.env.NODE_ENV !== 'production') {
      // oxlint-disable-next-line no-console
      console.warn(
        '[pyreon] onScopeDispose() called without an active EffectScope — callback will never run. ' +
          'Wrap the call in `scope.runInScope(() => { ... })` or check `getCurrentScope()` before calling.',
      )
    }
    return
  }
  scope.add({ dispose: fn })
}
