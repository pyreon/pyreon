import { _enterCleanupFrame, _exitCleanupFrame } from './effect'
import { _rdSetOwnerReader } from './reactive-devtools'
export class EffectScope {
  // A registered effect, or a BARE disposer function: render bindings register
  // their dispose function directly instead of wrapping it in `{ dispose }`
  // (one 16 B object per binding, kept for the binding's lifetime).
  private _effects: ({ dispose(): void } | (() => void))[] | null = null
  private _active = true
  private _updateHooks: (() => void)[] | null = null
  private _updatePending = false

  // ─── Context ownership ──────────────────────────────────────────────────
  // A scope doubles as the component's CONTEXT OWNER: `provide()` writes into
  // `_contexts`; `useContext()` walks `_parent` up the OWNER chain (which
  // mirrors the component tree, set by the renderer during mount). Context
  // lives with the scope and dies with it, so there is nothing to leak and no
  // frame to orphan. Both fields are null until first used.
  /** Parent owner in the component tree — set by the renderer, NOT effect nesting. */
  _parent: EffectScope | null = null
  /** Contexts provided at this scope, keyed by context id. */
  _contexts: Map<symbol, unknown> | null = null
  /**
   * Something outside this scope's own registrations holds it: the public
   * `getCurrentScope()` handed it out, or it became a context owner. A
   * component scope that is empty at the end of its mount is DROPPED (never
   * retained) unless pinned, because a holder could still register into it.
   */
  _pinned = false

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

  /**
   * @internal Whether nothing has registered with this scope yet. Lets a caller
   * run code under a pooled collector scope and keep it only when something
   * actually registered (see `@pyreon/runtime-dom`'s `<For>` rows).
   */
  _isEmpty(): boolean {
    return this._effects === null
  }

  /**
   * @internal Whether a component may drop this scope once its mount finished:
   * nothing registered (effects, disposers, onUpdate hooks), it never became a
   * context owner, and nobody was handed it through `getCurrentScope()`.
   */
  _isDroppable(): boolean {
    return this._effects === null && this._updateHooks === null && !this._pinned
  }

  /** Register an effect/computed to be disposed when this scope stops. */
  add(e: { dispose(): void } | (() => void)): void {
    if (!this._active) return
    // `[e]`, not `[]` + push: V8's first push reserves 16 slots, which a
    // scope holding one or two disposers would carry for its lifetime.
    if (this._effects === null) this._effects = [e]
    else this._effects.push(e)
  }

  /**
   * Temporarily re-activate this scope so effects created inside `fn` are
   * auto-tracked and will be disposed when the scope stops.
   * Used to ensure effects created in `onMount` callbacks belong to their
   * component's scope rather than leaking as global effects.
   */
  runInScope<T>(fn: () => T): T {
    const prev = _sc.s
    _sc.s = this
    // `onCleanup()` called in `fn` (outside any effect it creates) belongs to
    // THIS scope and runs on `stop()` — the same ownership rule as effects. It
    // must not inherit an enclosing effect run's window (a store first created
    // inside a component would otherwise hand its cleanups to that component)
    // nor vanish when no window is open (onCleanup inside onMount).
    const token = _enterCleanupFrame()
    try {
      return fn()
    } finally {
      _sc.s = prev
      const collected = _exitCleanupFrame(token)
      if (collected !== null) for (const c of collected) this.add(c)
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
      for (const e of this._effects) {
        if (typeof e === 'function') e()
        else e.dispose()
      }
    }
    this._effects = null
    this._updateHooks = null
    this._updatePending = false
    // Release the owner-chain + context references so a disposed scope doesn't
    // retain its parent chain (and the parent's `_contexts` Map) when a
    // descendant outlives it. A stopped scope is never walked as a context
    // owner, so dropping these is pure cleanup that breaks upward refs for GC.
    this._contexts = null
    this._parent = null
    this._active = false
  }
}

// A field on a `const` object rather than a module-level `let` — see the V8
// measurement on `TrackingFrame` in tracking.ts.
interface ScopeFrame {
  s: EffectScope | null
  /** The active context owner (see `getContextOwner`). */
  o: EffectScope | null
  /** The server request-owner reader (see `_setRequestOwnerReader`). */
  r: (() => EffectScope | undefined) | null
  /**
   * The scope of the component whose setup (or onMount) is running and that
   * has NOT become a context owner yet — `provide()` claims it (see
   * `_claimContextOwner`). Null outside a component, or once claimed.
   */
  p: EffectScope | null
}

const _sc: ScopeFrame = {
  s: null,
  o: null,
  r: null,
  p: null,
}

/**
 * The current `EffectScope`. Handing the scope out PINS it: a component scope
 * is otherwise dropped at the end of its mount when nothing registered with it,
 * and a caller holding it could register later (`runWithOwner`, a deferred
 * `scope.add`). Framework code that only registers synchronously reads
 * `_currentScope()` instead.
 */
export function getCurrentScope(): EffectScope | null {
  const s = _sc.s
  if (s !== null) s._pinned = true
  return s
}

/** @internal The current scope WITHOUT pinning it — see `getCurrentScope`. */
export function _currentScope(): EffectScope | null {
  return _sc.s
}

// ─── Lazy context owner ──────────────────────────────────────────────────────
// A component's scope becomes its children's context owner only when the
// component calls `provide()`. Until then the owner stays the parent's, so a
// non-providing component's children chain straight to the nearest PROVIDER
// and nothing retains the component's scope as `_parent`.

/**
 * @internal Dev only (null in production): `late` — a claim of the pending
 * scope now would be LATE (its children already mounted under the parent's
 * owner), so `_claimContextOwner` reports it and `provide()` warns. Set and
 * restored per component by runtime-dom's mount.
 */
export const _devOwner: { late: boolean } | null =
  process.env.NODE_ENV !== 'production' ? { late: false } : null

/**
 * @internal Enter a component's pending-owner frame (see `ScopeFrame.p`):
 * set it to `scope` (null to clear) and return the previous one, which the
 * caller restores with `_swapPendingOwner(prev)` on every exit. One call, so
 * the mount hot path pays a single cross-module call per component.
 */
export function _swapPendingOwner(scope: EffectScope | null): EffectScope | null {
  const prev = _sc.p
  _sc.p = scope

  return prev
}

/**
 * @internal Called by `provide()`: make the pending component scope the
 * context owner. Returns 0 when nothing was pending (already the owner, or no
 * component setup running), 1 for a claim, 2 (dev only) for a LATE claim —
 * children were already mounted under the parent's owner and will not see
 * the value through their deferred lookups.
 */
export function _claimContextOwner(): 0 | 1 | 2 {
  const s = _sc.p
  if (s === null) return 0
  _sc.p = null
  s._pinned = true
  _sc.o = s

  return process.env.NODE_ENV !== 'production' && _devOwner!.late ? 2 : 1
}

export function setCurrentScope(scope: EffectScope | null): void {
  _sc.s = scope
}

// ─── Request owner (server rendering) ───────────────────────────────────────
// On a client every component setup runs under its own scope, so an effect or
// computed always has an owner that disposes it. A server render never mounts:
// nothing sets `_sc.s`, and without an owner each node a component creates over
// a signal that outlives the request (module state, `systemColorMode()`) kept
// one subscriber — and everything its closure held — per request, forever.
//
// `@pyreon/runtime-server` installs a reader that returns the scope of the
// request in the current ASYNC context (AsyncLocalStorage), and stops that scope
// when the request ends. It is consulted only where a node REGISTERS and only
// when no scope is current, so the client path pays one null check on the
// already-rare ownerless branch. It is deliberately not a module-level "current
// scope" a renderer sets: renders interleave across `await`s, and a slot held
// over an await hands one request's nodes to another. Nor does it change
// `getCurrentScope()`, which save/restore pairs read — returning the request
// scope there would let a restore park it in `_sc.s` past its synchronous
// section.
/** @internal Installed once by `@pyreon/runtime-server`. */
export function _setRequestOwnerReader(fn: (() => EffectScope | undefined) | null): void {
  _sc.r = fn
}

/**
 * @internal The scope a node created NOW registers with: the current scope, or
 * else the active server request's scope (see `_setRequestOwnerReader`).
 */
export function _ownerScope(): EffectScope | null {
  const s = _sc.s
  if (s !== null) return s
  const r = _sc.r

  return r === null ? null : (r() ?? null)
}

// Dev only: the reactive devtools record which scope created each node (a
// component's owned signals / computeds / effects) through this reader.
if (process.env.NODE_ENV !== 'production') _rdSetOwnerReader(_currentScope)

export function effectScope(): EffectScope {
  return new EffectScope()
}

// ─── Current context owner ───────────────────────────────────────────────────
// DELIBERATELY SEPARATE from `_sc.s` (the effect-TRACKING scope). The
// renderer sets this to the component's scope while mounting that component's
// subtree, so a child's owner chains to its parent; deferred boundaries capture
// it at setup and restore it when they later mount children inside an effect.
// Keeping the two distinct means restoring the owner for a deferred mount does
// NOT perturb which scope new effects are tracked by.

export function getContextOwner(): EffectScope | null {
  return _sc.o
}

/** Set the current context owner, returning the previous one (for restore). */
export function setContextOwner(owner: EffectScope | null): EffectScope | null {
  const prev = _sc.o
  _sc.o = owner
  return prev
}

/** Run `fn` with `owner` as the current context owner, then restore. */
export function runWithContextOwner<T>(owner: EffectScope | null, fn: () => T): T {
  const prev = _sc.o
  // No component is pending inside `fn`: it runs under a RESTORED owner (an
  // effect re-run, a deferred mount), so a `provide()` there must write onto
  // `owner`, never claim whichever component happens to be mid-setup when the
  // scheduler fires. A component mounted inside enters its own frame.
  const prevPending = _sc.p
  _sc.o = owner
  _sc.p = null
  try {
    return fn()
  } finally {
    _sc.o = prev
    _sc.p = prevPending
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
  const scope = _sc.s
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
  scope.add(fn)
}
