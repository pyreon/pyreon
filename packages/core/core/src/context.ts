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
 * Read the current live stack length WITHOUT allocating a snapshot.
 *
 * SSR cleanup uses this as a position marker: capture the live length
 * before a component renders, pop the live stack back to that length
 * after. Previously these sites called `captureContextStack().length`,
 * which allocated a full snapshot array (potentially 40k+ entries
 * under deeply-nested reactive boundaries — the same allocation the
 * `captureContextStack` dedup work is designed to shrink) just to
 * read its length. This helper avoids the allocation entirely AND
 * decouples SSR cleanup from `captureContextStack`'s snapshot shape,
 * so dedup at capture time can never silently break SSR length
 * bookkeeping.
 */
export function getContextStackLength(): number {
  return getStack().length
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
 * Capture a snapshot of the current context stack, **deduplicated** so
 * only the topmost frame for each context-id is retained.
 *
 * Used by `mountReactive` to preserve the context that was active when a
 * reactive boundary (e.g. `<Show>`, `<For>`) was set up. When the boundary
 * later mounts new children inside an effect, the snapshot is restored so
 * those children can see ancestor providers via `useContext()`.
 *
 * **Why dedup is semantically equivalent to a full snapshot:**
 * `useContext()` walks the stack in reverse and returns the first frame
 * matching the requested context-id (`for (let i = stack.length - 1; i >= 0; i--)`
 * — see implementation below in this file). Any frame deeper in the
 * stack that ALSO provides the same id is unreachable by definition —
 * the reverse walk stops at the first match. Those shadowed frames are
 * dead weight in the snapshot: they carry no observable value, they
 * cost memory, and they can NEVER affect program behavior.
 *
 * The dedup walks frames from top to bottom keeping a `seen` set of
 * already-resolved context ids. A frame is kept iff at least one of
 * its keys is NOT in `seen` (i.e. it's the topmost provider for at
 * least one id). All of a frame's keys are added to `seen` regardless
 * of whether the frame is kept — `seen` represents "ids that are
 * already provided by a more-recent frame".
 *
 * **Why this is safe for `restoreContextStack`:**
 * `restoreContextStack` pushes the snapshot's frames onto the live
 * stack, runs `fn()`, then removes those frames by **reference
 * identity** (`stack.lastIndexOf(frame)`) — NOT by position or count
 * of the snapshot. A deduped snapshot pushes fewer frames; the same
 * reference-identity cleanup removes exactly those frames. No
 * bookkeeping invariant breaks.
 *
 * **Why this is safe for the live stack length invariant:**
 * SSR cleanup uses `getContextStackLength()` (a sibling helper) for
 * position-marker bookkeeping. That helper reads the LIVE stack
 * length, NOT the snapshot length, so dedup at capture time has zero
 * effect on SSR cleanup behavior.
 *
 * **Why this is needed:**
 * Under deeply-nested reactive boundaries (a `<Show>` inside a `<For>`
 * inside a `<Suspense>`, each effect capturing its own snapshot at
 * setup time), the live stack temporarily holds the same context-id
 * pushed multiple times during nested `restoreContextStack` windows.
 * The pre-dedup `[...getStack()]` snapshot baked those duplicates in
 * permanently — each effect's closure retained an O(stack-depth)
 * array for its lifetime. Reported heap snapshots from 0.21.x showed
 * 1.22 MB / 321k-entry arrays from this pattern. The 0.23.0
 * restoreContextStack reference-identity fix cleaned the LIVE stack
 * but left the residual snapshot-amplification — observable as 20
 * arrays at 157 KB each (40k entries) retained by effect closures.
 * This dedup collapses each captured snapshot to ~N entries, where
 * N is the number of DISTINCT context ids in scope (typically 2-10
 * in real apps).
 */
export function captureContextStack(): ContextSnapshot {
  const stack = getStack()
  // Fast path: empty stack or single frame is the common case for
  // top-level mounts and zero-context apps. Skip the dedup machinery.
  if (stack.length <= 1) return stack.slice()

  // Walk top-to-bottom, keeping the topmost frame for each context-id.
  // Each frame is a Map<symbol, unknown>; `seen` tracks ids already
  // provided by a more-recent frame.
  const seen = new Set<symbol>()
  const reversed: Map<symbol, unknown>[] = []
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i]
    if (!frame) continue
    // A frame is unique if it provides at least one not-yet-seen id.
    // Iterate ALL keys to accumulate them into `seen` (so deeper
    // frames sharing any one of them are correctly shadowed even if
    // they also have other unique keys).
    let unique = false
    for (const id of frame.keys()) {
      if (!seen.has(id)) {
        seen.add(id)
        unique = true
      }
    }
    if (unique) reversed.push(frame)
  }
  // We walked top-to-bottom; the result is in reverse stack order.
  // Reverse back so the snapshot is in bottom-to-top order, matching
  // the order `restoreContextStack` pushes them.
  reversed.reverse()
  return reversed
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
