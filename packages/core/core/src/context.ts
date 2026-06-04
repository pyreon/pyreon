/**
 * Provide / inject — like React context or Vue provide/inject.
 *
 * Values flow down the component tree without prop-drilling.
 *
 * **Client: owner-based.** Each mounted component's `EffectScope` doubles as a
 * context OWNER, linked to its parent owner by the renderer (so the owner chain
 * mirrors the component tree). `provide()` writes onto the current owner;
 * `useContext()` walks the owner chain. Context dies with the scope on unmount —
 * there is no global stack to grow, no frame to orphan, and deferred boundaries
 * (`<Show>`, `<For>`) just capture the owner reference and restore it when they
 * mount children later. This replaced a global mutable stack whose
 * snapshot/restore/dedup/identity-removal machinery existed only to fake
 * tree-position across deferred mounts.
 *
 * **SSR: stack-based.** `renderToString` is a synchronous top-down walk with no
 * `EffectScope`, so there is no owner. The request-scoped stack (isolated per
 * request via `@pyreon/runtime-server`'s AsyncLocalStorage provider) is the
 * correct, band-aid-free model there: `provide()` pushes a frame and the server
 * renderer pops it by length (`trimContextStack`) when the subtree finishes.
 * `useContext()` falls back to the stack whenever no owner is active.
 */

import { type EffectScope, getContextOwner, runWithContextOwner, setSnapshotCapture } from '@pyreon/reactivity'

export interface Context<T> {
  readonly id: symbol
  readonly defaultValue: T
}

/** Branded marker for reactive contexts — distinguishes from regular Context at type level. */
declare const REACTIVE_BRAND: unique symbol

/**
 * A context whose value is a reactive accessor `() => T`.
 *
 * When you `useContext(reactiveCtx)`, TypeScript returns `() => T` —
 * you MUST call the accessor to read the value. This prevents the
 * destructuring trap that breaks reactivity with getter-based objects.
 *
 * @example
 * const ModeCtx = createReactiveContext<'light' | 'dark'>('light')
 * // Provider: provide(ModeCtx, () => modeSignal())
 * // Consumer: const getMode = useContext(ModeCtx); getMode() // 'light'
 */
export interface ReactiveContext<T> extends Context<() => T> {
  readonly [REACTIVE_BRAND]: T
}

/**
 * Create a context for prop-drilling-free value sharing down the component tree.
 *
 * **⚠ FOOTGUN: Don't destructure getter-backed values from the context.**
 *
 * Many Pyreon ecosystem libraries (rocketstyle, ui-core, theme providers,
 * custom providers built with `signal` + plain objects) pass context values
 * whose properties are GETTERS — `ctx.searchValue` fires the getter and
 * returns the live signal value. Destructuring (`const { searchValue } = ctx`)
 * calls the getter ONCE and freezes the resolved value into a plain variable
 * — the binding is no longer reactive, and downstream reads see stale data.
 *
 * **Wrong (freezes the value):**
 * ```ts
 * const { searchValue } = useContext(SearchCtx)
 * return <div>{searchValue}</div>  // never updates
 * ```
 *
 * **Right (keep the reference, access lazily):**
 * ```ts
 * const ctx = useContext(SearchCtx)
 * return <div>{ctx.searchValue}</div>  // re-reads the getter on each render
 * ```
 *
 * **Better — use `createReactiveContext`** when the value is meant to change.
 * It returns `() => T`, forcing consumers to call the accessor and making
 * the destructure trap structurally impossible.
 */
export function createContext<T>(defaultValue: T): Context<T> {
  return { id: Symbol('PyreonContext'), defaultValue }
}

/**
 * Create a reactive context. Consumers get `() => T` and must call it.
 * This is the safe pattern for values that change over time (mode, locale, etc.).
 */
export function createReactiveContext<T>(defaultValue: T): ReactiveContext<T> {
  return createContext<() => T>(() => defaultValue) as ReactiveContext<T>
}

// ─── SSR request-scoped stack ────────────────────────────────────────────────
//
// Used ONLY when no client owner is active (i.e. during `renderToString`). On
// Node with concurrent requests, @pyreon/runtime-server swaps in an
// AsyncLocalStorage-backed stack via `setContextStackProvider()` so each request
// is isolated. In the browser this array is never written (the owner path is
// always active during mount).
const _contextStack: Map<symbol, unknown>[] = []
let _contextProvider: () => Map<symbol, unknown>[] = () => _contextStack

/**
 * Override the context stack provider. Called by @pyreon/runtime-server to
 * inject an AsyncLocalStorage-backed stack that isolates concurrent SSR requests.
 */
export function setContextStackProvider(fn: () => Map<symbol, unknown>[]): void {
  _contextProvider = fn
}

function getStack(): Map<symbol, unknown>[] {
  return _contextProvider()
}

/** Push a frame onto the SSR context stack. */
export function pushContext(values: Map<symbol, unknown>): void {
  getStack().push(values)
}

/** Pop the last frame from the SSR context stack. */
export function popContext(): void {
  const stack = getStack()
  if (stack.length === 0) return
  stack.pop()
}

/** Current SSR stack length — used by the server renderer as a trim marker. */
export function getContextStackLength(): number {
  return getStack().length
}

/**
 * Remove a specific frame from the stack by reference identity (LIFO match).
 * Retained for direct stack consumers — the `*-compat` layers run their own
 * stack-based provide/inject independent of Pyreon's owner-based context.
 */
export function removeContextFrame(frame: Map<symbol, unknown>): void {
  const stack = getStack()
  const idx = stack.lastIndexOf(frame)
  if (idx !== -1) stack.splice(idx, 1)
}

/**
 * Read the nearest provided value for a context.
 * Falls back to `context.defaultValue` if none found.
 *
 * For ReactiveContext<T>, returns `() => T` — you MUST call the accessor.
 * For regular Context<T>, returns `T` directly.
 */
export function useContext<T>(context: ReactiveContext<T>): () => T
export function useContext<T>(context: Context<T>): T
export function useContext<T>(context: Context<T>): T {
  // Client: walk the owner chain (mirrors the component tree) FIRST.
  const owner = getContextOwner()
  if (owner !== null) {
    const r = owner.lookupContext(context.id)
    if (r.found) return r.value as T
    // Not in the owner chain — fall through to the stack. Direct stack
    // consumers (the `*-compat` layers run their own stack-based provide via
    // `pushContext`) still resolve through `useContext`.
  }
  // SSR (no owner) AND the client stack-fallback: walk the request-scoped /
  // compat stack top-down.
  const stack = getStack()
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i]
    if (frame?.has(context.id)) {
      return frame.get(context.id) as T
    }
  }
  return context.defaultValue
}

/**
 * Provide a context value for the current component's subtree.
 * Must be called during component setup (like onMount/onUnmount).
 * Automatically scoped to the component — no manual cleanup.
 *
 * Pyreon does NOT ship a `<Context.Provider>` JSX shim; call `provide()` inside
 * a Provider component's setup instead. Two semantic differences from React:
 *
 * 1. **Setup runs once.** Components don't re-run on prop changes, so
 *    `provide(ctx, props.value)` captures the value at mount. For reactive
 *    values, use `createReactiveContext` + pass an accessor:
 *    `provide(ReactiveCtx, () => signal())`.
 * 2. **No JSX shim is intentional** — the explicit `provide()` call makes the
 *    setup-time semantics visible.
 *
 * @example
 * const ThemeProvider = ({ children }: { children: VNodeChild }) => {
 *   provide(ThemeContext, { color: "blue" })
 *   return children
 * }
 */
export function provide<T>(context: Context<T>, value: T): void {
  const owner = getContextOwner()
  if (owner !== null) {
    // Client: store on the component's owner scope. No cleanup needed — the
    // context dies when the scope is disposed at unmount.
    owner.provideContext(context.id, value)
    return
  }
  // SSR (no owner): push onto the request-scoped stack. The server renderer
  // pops it by length when the subtree finishes; SSR never fires onUnmount.
  pushContext(new Map([[context.id, value]]))
}

/**
 * Provide a value for `context` during `fn()`.
 * Used by the renderer when it encounters a `<Provider>` component.
 */
export function withContext<T>(context: Context<T>, value: T, fn: () => void): void {
  const owner = getContextOwner()
  if (owner !== null) {
    owner.provideContext(context.id, value)
    fn()
    return
  }
  pushContext(new Map([[context.id, value]]))
  try {
    fn()
  } finally {
    popContext()
  }
}

// ─── Reactivity-layer DI: install owner capture/restore for effects ──────────
//
// `_bind` / `renderEffect` / `effect` (in `@pyreon/reactivity`) capture the
// active context owner at setup and restore it on every re-run, so a
// signal-driven re-run resolves `useContext()` through the same owner chain it
// was created in (rather than whatever owner happens to be active when the
// scheduler fires the effect). Capturing/restoring a single owner REFERENCE
// replaced the old deduped-stack-snapshot + identity-removal machinery.
setSnapshotCapture({
  capture: () => getContextOwner(),
  restore: <T>(owner: unknown, fn: () => T): T =>
    runWithContextOwner(owner as EffectScope | null, fn),
})
