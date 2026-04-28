/**
 * Provide / inject — like React context or Vue provide/inject.
 *
 * Values flow down the component tree without prop-drilling.
 * The renderer maintains the context stack as it walks the VNode tree.
 */

import { setSnapshotCapture } from '@pyreon/reactivity'
import { onUnmount } from './lifecycle'

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

// ─── Runtime context stack (managed by the renderer) ─────────────────────────

// Default stack — used for CSR and single-threaded SSR.
// On Node.js with concurrent requests, @pyreon/runtime-server replaces this with
// an AsyncLocalStorage-backed provider via setContextStackProvider().
const _defaultStack: Map<symbol, unknown>[] = []
let _stackProvider: () => Map<symbol, unknown>[] = () => _defaultStack

/**
 * Override the context stack provider. Called by @pyreon/runtime-server to
 * inject an AsyncLocalStorage-backed stack that isolates concurrent SSR requests.
 * Has no effect in the browser (CSR always uses the default module-level stack).
 */
export function setContextStackProvider(fn: () => Map<symbol, unknown>[]): void {
  _stackProvider = fn
}

function getStack(): Map<symbol, unknown>[] {
  return _stackProvider()
}

// Dev-mode gate: see `pyreon/no-process-dev-gate` lint rule for why this
// uses `import.meta.env.DEV` instead of `typeof process !== 'undefined'`.
const __DEV__ = process.env.NODE_ENV !== 'production'

export function pushContext(values: Map<symbol, unknown>) {
  getStack().push(values)
}

export function popContext() {
  const stack = getStack()
  if (stack.length === 0) return
  stack.pop()
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
 * Automatically cleaned up when the component unmounts.
 *
 * @example
 * const ThemeProvider = ({ children }: { children: VNodeChild }) => {
 *   provide(ThemeContext, { color: "blue" })
 *   return children
 * }
 */
export function provide<T>(context: Context<T>, value: T): void {
  pushContext(new Map<symbol, unknown>([[context.id, value]]))
  onUnmount(() => popContext())
}

/**
 * Provide a value for `context` during `fn()`.
 * Used by the renderer when it encounters a `<Provider>` component.
 */
export function withContext<T>(context: Context<T>, value: T, fn: () => void) {
  const frame = new Map<symbol, unknown>([[context.id, value]])
  pushContext(frame)
  try {
    fn()
  } finally {
    popContext()
  }
}

// ─── Context snapshot for deferred mounting ─────────────────────────────────

export type ContextSnapshot = Map<symbol, unknown>[]

/**
 * Capture a snapshot of the current context stack.
 *
 * Used by `mountReactive` to preserve the context that was active when a
 * reactive boundary (e.g. `<Show>`, `<For>`) was set up. When the boundary
 * later mounts new children inside an effect, the snapshot is restored so
 * those children can see ancestor providers via `useContext()`.
 */
export function captureContextStack(): ContextSnapshot {
  // Shallow copy — each frame (Map) is shared by reference, which is
  // correct because providers don't mutate frames after creation.
  return [...getStack()]
}

/**
 * Execute `fn()` with a previously captured context stack active.
 *
 * After `fn()` returns, removes ONLY the snapshot frames this call pushed
 * — anything `fn()` itself pushed (typically provider frames from
 * `provide()` calls during component mount) stays on the stack so
 * subsequent reactive re-runs (e.g. `_bind` text bindings,
 * `renderEffect` callbacks) can still find ancestor providers via
 * `useContext`. Pre-fix this method was `stack.length = savedLength`,
 * which destructively truncated provider frames pushed during mount —
 * silently breaking `useMode()` / `useTheme()` / `useRouter()` etc. on
 * every signal-driven update under a `mountReactive` boundary.
 */
export function restoreContextStack<T>(snapshot: ContextSnapshot, fn: () => T): T {
  const stack = getStack()
  const insertIndex = stack.length

  // Push captured snapshot frames at the END of the current stack.
  for (const frame of snapshot) {
    stack.push(frame)
  }

  try {
    return fn()
  } finally {
    // Splice out exactly the snapshot frames we pushed (they sit at
    // [insertIndex, insertIndex + snapshot.length)). Any frames `fn()`
    // pushed AFTER our snapshot (provider frames) get shifted down by
    // `snapshot.length` positions but remain on the stack. Their owning
    // components' `onUnmount(popContext)` handlers will pop them in
    // LIFO order on subtree teardown — splice preserves that ordering
    // because it doesn't touch frames at indices >= insertIndex +
    // snapshot.length until the splice operation itself.
    stack.splice(insertIndex, snapshot.length)
  }
}

// ─── Reactivity-layer DI: install context capture/restore for effects ────────
//
// `_bind` / `renderEffect` / `effect` (in `@pyreon/reactivity`) capture this
// snapshot at setup and restore it on every subsequent re-run. Without this,
// signal-driven re-runs after the synchronous mount see whatever the GLOBAL
// context stack looks like at that moment — which may be missing provider
// frames for any number of reasons (sibling subtree mounts/unmounts mutating
// the stack, async re-render cycles, etc.). Defense-in-depth alongside the
// `restoreContextStack` splice fix above.
setSnapshotCapture({
  capture: () => captureContextStack(),
  restore: <T>(snap: unknown, fn: () => T): T =>
    restoreContextStack(snap as ContextSnapshot, fn),
})
