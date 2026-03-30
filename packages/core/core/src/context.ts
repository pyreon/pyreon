/**
 * Provide / inject — like React context or Vue provide/inject.
 *
 * Values flow down the component tree without prop-drilling.
 * The renderer maintains the context stack as it walks the VNode tree.
 */

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

const __DEV__ = typeof process !== 'undefined' && process.env.NODE_ENV !== 'production'

export function pushContext(values: Map<symbol, unknown>) {
  getStack().push(values)
}

export function popContext() {
  const stack = getStack()
  if (__DEV__ && stack.length === 0) {
    // biome-ignore lint/suspicious/noConsole: dev-only warning
    console.warn(
      '[Pyreon] popContext() called on an empty context stack. This likely indicates a missing Provider.',
    )
    return
  }
  stack.pop()
}

/**
 * Read the nearest provided value for a context.
 * Falls back to `context.defaultValue` if none found.
 */
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
 * Restores the original stack after `fn()` completes (even on throw).
 */
export function restoreContextStack<T>(snapshot: ContextSnapshot, fn: () => T): T {
  const stack = getStack()
  const savedLength = stack.length

  // Push all captured frames onto the current stack
  for (const frame of snapshot) {
    stack.push(frame)
  }

  try {
    return fn()
  } finally {
    // Remove only the frames we pushed (preserve anything added by fn)
    stack.length = savedLength
  }
}
