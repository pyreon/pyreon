/**
 * Pyreon HMR Runtime — preserves signal state across hot module reloads.
 *
 * Served as a virtual module `\0pyreon/hmr-runtime` and injected into every
 * .tsx/.jsx module during development.
 *
 * ## How it works
 *
 * 1. The Vite plugin rewrites top-level `signal()` calls:
 *      `const count = signal(0)` → `const count = __hmr_signal("src/App.tsx", "count", signal, 0)`
 *
 * 2. `__hmr_signal` checks a global registry for a saved value under the
 *    composite key `moduleId + ":" + name`. If found, it creates the signal
 *    with the preserved value instead of the initial one.
 *
 * 3. When `import.meta.hot.accept()` fires, a `dispose` callback saves every
 *    registered signal's current value into the registry before the old module
 *    is discarded.
 *
 * The registry lives on `globalThis` so it survives module re-execution.
 */

interface SignalLike {
  peek(): unknown
  set(value: unknown): void
}

interface ModuleSignals {
  entries: Map<string, SignalLike>
}

const REGISTRY_KEY = "__pyreon_hmr_registry__"

type Registry = Map<string, Map<string, unknown>>

function getRegistry(): Registry {
  const g = globalThis as Record<string, unknown>
  if (!g[REGISTRY_KEY]) {
    g[REGISTRY_KEY] = new Map()
  }
  return g[REGISTRY_KEY] as Registry
}

const moduleSignals = new Map<string, ModuleSignals>()

/**
 * Called in place of `signal(initialValue)` for module-scope signals.
 * Restores the previous value if the module is being hot-reloaded.
 */
export function __hmr_signal<T>(
  moduleId: string,
  name: string,
  signalFn: (value: T) => SignalLike,
  initialValue: T,
): ReturnType<typeof signalFn> {
  const registry = getRegistry()
  const saved = registry.get(moduleId)

  // Use saved value if available (hot reload), otherwise use initial
  const value = saved?.has(name) ? (saved.get(name) as T) : initialValue

  const s = signalFn(value)

  // Track this signal for future disposal
  let mod = moduleSignals.get(moduleId)
  if (!mod) {
    mod = { entries: new Map() }
    moduleSignals.set(moduleId, mod)
  }
  mod.entries.set(name, s)

  return s
}

/**
 * Called in the `import.meta.hot.dispose` callback.
 * Saves all registered signal values for the module before it is discarded.
 */
export function __hmr_dispose(moduleId: string): void {
  const mod = moduleSignals.get(moduleId)
  if (!mod) return

  const registry = getRegistry()
  const saved = new Map<string, unknown>()
  for (const [name, s] of mod.entries) {
    saved.set(name, s.peek())
  }
  registry.set(moduleId, saved)

  // Clear entries so the new module can re-register
  moduleSignals.delete(moduleId)
}
