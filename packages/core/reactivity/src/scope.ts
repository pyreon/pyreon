// EffectScope — auto-tracks effects created during a component's setup
// and disposes them all at once when the component unmounts.

export class EffectScope {
  private _effects: { dispose(): void }[] = []
  private _active = true
  private _updateHooks: (() => void)[] = []
  private _updatePending = false

  /** Register an effect/computed to be disposed when this scope stops. */
  add(e: { dispose(): void }): void {
    if (this._active) this._effects.push(e)
  }

  /**
   * Temporarily re-activate this scope so effects created inside `fn` are
   * auto-tracked and will be disposed when the scope stops.
   * Used to ensure effects created in `onMount` callbacks belong to their
   * component's scope rather than leaking as global effects.
   */
  runInScope<T>(fn: () => T): T {
    const prev = _currentScope
    _currentScope = this
    try {
      return fn()
    } finally {
      _currentScope = prev
    }
  }

  /** Register a callback to run after any reactive update in this scope. */
  addUpdateHook(fn: () => void): void {
    this._updateHooks.push(fn)
  }

  /**
   * Called by effects after each non-initial re-run.
   * Schedules onUpdate hooks via microtask so all synchronous effects settle first.
   */
  notifyEffectRan(): void {
    if (!this._active || this._updateHooks.length === 0 || this._updatePending) return
    this._updatePending = true
    queueMicrotask(() => {
      this._updatePending = false
      if (!this._active) return
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
    for (const e of this._effects) e.dispose()
    this._effects = []
    this._updateHooks = []
    this._updatePending = false
    this._active = false
  }
}

let _currentScope: EffectScope | null = null

export function getCurrentScope(): EffectScope | null {
  return _currentScope
}

export function setCurrentScope(scope: EffectScope | null): void {
  _currentScope = scope
}

/** Create a new EffectScope. */
export function effectScope(): EffectScope {
  return new EffectScope()
}
