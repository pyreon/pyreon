/**
 * Provide / inject — like React context or Vue provide/inject.
 *
 * Values flow down the component tree without prop-drilling.
 * The renderer maintains the context stack as it walks the VNode tree.
 */

export interface Context<T> {
  readonly id: symbol
  readonly defaultValue: T
}

export function createContext<T>(defaultValue: T): Context<T> {
  return { id: Symbol("NovaContext"), defaultValue }
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

export function pushContext(values: Map<symbol, unknown>) {
  getStack().push(values)
}

export function popContext() {
  getStack().pop()
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
