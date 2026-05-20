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

/**
 * Pop the LAST frame from the context stack.
 *
 * NOTE: position-based pop. Safe ONLY when the caller can guarantee that the
 * top of the stack is the frame they want to remove (the strict LIFO contract).
 * The `provide()` helper does NOT use this — it uses identity-based removal
 * via `removeContextFrame` because reactive boundaries can push snapshot
 * frames between a component's `provide(ctx, value)` and its eventual
 * unmount, making the top-of-stack unsafe to assume.
 */
export function popContext() {
  const stack = getStack()
  if (stack.length === 0) return
  stack.pop()
}

/**
 * Remove a SPECIFIC frame from the context stack by reference identity.
 *
 * Internal — used by `provide()` and `withContext()` to safely clean up
 * their pushed frame on unmount even when other frames have been pushed
 * between push and pop (e.g. a reactive boundary's `restoreContextStack`
 * pushing snapshot frames during the descendant's lifecycle). The
 * symmetric position-based `popContext()` would pop the wrong frame in
 * that case and orphan the descendant's provider frame on the live stack
 * — the root cause of the 321k-entry context-stack leak under repeated
 * reactive remounts.
 *
 * Uses `lastIndexOf` (LIFO match) — picks the most-recently-pushed frame
 * with that exact reference, so `provide(ctx, a); provide(ctx, b)` followed
 * by two unmounts removes them in reverse order.
 */
function removeContextFrame(frame: Map<symbol, unknown>): void {
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
  const frame = new Map<symbol, unknown>([[context.id, value]])
  pushContext(frame)
  // Identity-based removal — the top of the stack is NOT guaranteed to be
  // this frame at unmount time. Reactive boundaries (`mountReactive`'s
  // effect snapshot-restore + the inner `restoreContextStack` call) push
  // additional snapshot frames during a descendant's lifecycle. A
  // position-based `popContext()` would pop the snapshot frame instead
  // of this provider's frame and orphan the provider on the live stack.
  // See `.claude/rules/anti-patterns.md` "Context-stack frame identity"
  // for the full bug class.
  onUnmount(() => removeContextFrame(frame))
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
    // Same identity-based-removal rationale as `provide()` — `fn()` may
    // synchronously trigger a `mountReactive` re-run whose snapshot-restore
    // window leaves the top-of-stack pointing at a snapshot push, not our
    // frame.
    removeContextFrame(frame)
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

  // Push captured snapshot frames at the END of the current stack.
  for (const frame of snapshot) {
    stack.push(frame)
  }

  try {
    return fn()
  } finally {
    // Remove our pushed snapshot frames by REFERENCE IDENTITY (not by
    // position). `fn()` may legitimately remove frames at indices BEFORE
    // our push window — most commonly via `provide()` registering
    // `onUnmount(removeContextFrame(frame))` and a descendant unmount
    // firing inside this restore window. A position-based `splice` would
    // either pull the wrong frames or no-op when the live stack has
    // shrunk below the original `insertIndex + snapshot.length` —
    // orphaning the snapshot pushes on the live stack and producing the
    // 321k-frame leak reported under repeated reactive remounts.
    //
    // Iterate in reverse so multi-occurrence frames (the same Map ref
    // pushed by multiple nested restores) are removed in LIFO push order.
    // `lastIndexOf` is O(N); N is small in practice (single-digit nesting),
    // and the alternative `findLastIndex(f => f === frame)` is the same
    // cost.
    for (let i = snapshot.length - 1; i >= 0; i--) {
      const frame = snapshot[i]
      if (!frame) continue
      const idx = stack.lastIndexOf(frame)
      if (idx !== -1) stack.splice(idx, 1)
    }
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
