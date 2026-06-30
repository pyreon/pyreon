export class EffectScope {
  private _effects: { dispose(): void }[] | null = null
  private _active = true
  private _updateHooks: (() => void)[] | null = null
  private _updatePending = false

  // ─── Context ownership ──────────────────────────────────────────────────
  // A scope doubles as the component's CONTEXT OWNER. `provide()` writes into
  // `_contexts`; `useContext()` walks `_parent` up the OWNER chain (which
  // mirrors the component tree, set by the renderer during mount). This
  // replaces the old global mutable context stack + its snapshot / restore /
  // dedup / identity-removal machinery: context now lives with the scope and
  // dies when the scope is disposed, so there is nothing to leak and no frame
  // to orphan. Both fields are null until first used (zero cost for scopes
  // that neither provide nor live under a provider).
  /** Parent owner in the component tree — set by the renderer, NOT effect nesting. */
  _parent: EffectScope | null = null
  /** Contexts provided at this scope, keyed by context id. */
  _contexts: Map<symbol, unknown> | null = null

  /** Provide a context value at this owner. */
  provideContext(id: symbol, value: unknown): void {
    if (this._contexts === null) this._contexts = new Map()
    this._contexts.set(id, value)
  }

  /**
   * Resolve a context id by walking this owner then its ancestors. Returns
   * `found` so the caller can distinguish "provided as undefined" from "not
   * provided" (and fall back to the context's default value).
   */
  lookupContext(id: symbol): { found: boolean; value: unknown } {
    for (let s: EffectScope | null = this; s !== null; s = s._parent) {
      const c = s._contexts
      if (c !== null && c.has(id)) return { found: true, value: c.get(id) }
    }
    return { found: false, value: undefined }
  }

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
    // Release the owner-chain + context references so a disposed scope doesn't
    // retain its parent chain (and the parent's `_contexts` Map) when a
    // descendant scope outlives it — e.g. a deferred/portal'd child whose
    // ancestor unmounted first. A stopped scope is never walked as a context
    // owner (`_active` is false + its effects are disposed), so dropping these
    // is pure cleanup — and breaks the upward references for GC.
    this._contexts = null
    this._parent = null
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

export function effectScope(): EffectScope {
  return new EffectScope()
}

// ─── Current context owner ───────────────────────────────────────────────────
// DELIBERATELY SEPARATE from `_currentScope` (the effect-TRACKING scope). The
// renderer sets this to the component's scope while mounting that component's
// subtree, so a child's owner chains to its parent. Deferred boundaries
// (`mountReactive` / `mountFor`) capture it at setup and restore it when they
// later mount children inside an effect. Keeping it distinct from
// `_currentScope` means restoring the context owner for a deferred mount does
// NOT perturb which scope new effects are tracked by.
let _currentContextOwner: EffectScope | null = null

export function getContextOwner(): EffectScope | null {
  return _currentContextOwner
}

/** Set the current context owner, returning the previous one (for restore). */
export function setContextOwner(owner: EffectScope | null): EffectScope | null {
  const prev = _currentContextOwner
  _currentContextOwner = owner
  return prev
}

/** Run `fn` with `owner` as the current context owner, then restore. */
export function runWithContextOwner<T>(owner: EffectScope | null, fn: () => T): T {
  const prev = _currentContextOwner
  _currentContextOwner = owner
  try {
    return fn()
  } finally {
    _currentContextOwner = prev
  }
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
  const scope = _currentScope
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
