/**
 * Singleton sentinel — fail-loud detection of duplicate framework instances.
 *
 * The dual-module-instance bug class (see `cross-module-state.ts`) silently
 * corrupts framework state when a `@pyreon/*` package is loaded twice in
 * the same JS heap. `defineCrossModuleState` (the existing γ approach)
 * **shares state** across duplicates so the bug class becomes harmless.
 *
 * This module takes a different stance: **duplicate loading is an error,
 * not a runtime condition to tolerate**. It registers a marker on
 * `globalThis` at module load. A second load with a DIFFERENT module
 * reference throws immediately with an actionable error.
 *
 * ## Why "throw" instead of "share"
 *
 * 1. **It's honest.** A duplicate is a bug in the consumer's bundler
 *    config. Silently sharing state hides the bug; throwing surfaces it.
 *
 * 2. **No globalThis pollution beyond a single marker.** The γ approach
 *    populates ~50 symbols on globalThis (one per state surface). The
 *    sentinel populates ONE marker per package.
 *
 * 3. **SSR per-request isolation is preserved.** γ requires every state
 *    surface to think about ALS-backed providers because state is
 *    globalThis-global. The sentinel leaves module-scope state intact;
 *    SSR isolation works the way it always did.
 *
 * 4. **`vi.resetModules()` works.** γ keeps state on globalThis past
 *    module reset; the sentinel doesn't.
 *
 * ## Strict vs warn mode
 *
 * The sentinel respects `PYREON_SINGLE_INSTANCE` env var:
 *   - `'throw'` (default in prod): immediate throw on duplicate.
 *   - `'warn'`: `console.error` but allow execution to continue
 *     (graceful path for users who need time to fix their bundler).
 *   - `'silent'`: no detection (escape hatch for tests / browser extensions /
 *     micro-frontends where dual loading is intentional).
 *
 * ## The error message
 *
 * When a duplicate is detected, the error names:
 *   - The package name
 *   - The version of each instance (if available)
 *   - The file URL of each instance (so the user can grep `node_modules`)
 *   - Actionable fix (e.g., "Add @pyreon/* to resolve.dedupe in vite.config.ts")
 */

interface SingletonMarker {
  /** Identity object — different across module instances. */
  ref: object
  /** Package name, e.g. `'@pyreon/reactivity'`. */
  pkg: string
  /** Semver string from package.json. */
  version: string
  /** Module location (best-effort — `import.meta.url` of the registering call). */
  location: string | undefined
}

interface SentinelState {
  markers: Map<string, SingletonMarker>
}

const SENTINEL_KEY = Symbol.for('pyreon/singleton-sentinel-state')

function getSentinelState(): SentinelState {
  const host = globalThis as Record<symbol, unknown>
  const existing = host[SENTINEL_KEY] as SentinelState | undefined
  if (existing) return existing
  const state: SentinelState = { markers: new Map() }
  host[SENTINEL_KEY] = state
  return state
}

type DetectionMode = 'throw' | 'warn' | 'silent'

function getDetectionMode(): DetectionMode {
  // Bundler-agnostic dev gate (mirrors the framework-wide pattern).
  // Cast through unknown — @pyreon/reactivity's env type only declares
  // NODE_ENV; PYREON_SINGLE_INSTANCE is a fresh runtime-only override
  // that doesn't need to be declared in the env type.
  const env =
    typeof process !== 'undefined' && process.env
      ? (process.env as unknown as Record<string, string | undefined>).PYREON_SINGLE_INSTANCE
      : undefined
  if (env === 'warn' || env === 'silent') return env
  return 'throw'
}

function formatError(pkg: string, existing: SingletonMarker, current: SingletonMarker): string {
  return (
    `[Pyreon] Multiple instances of ${pkg} detected.\n\n` +
    `This breaks the framework's contracts (reactivity, lifecycle hooks, context).\n` +
    `Two distinct module instances of the same package were loaded in this heap:\n\n` +
    `  Instance A: ${existing.location ?? '<location unknown>'} (version ${existing.version})\n` +
    `  Instance B: ${current.location ?? '<location unknown>'} (version ${current.version})\n\n` +
    `Likely causes:\n` +
    `  1. Sub-dependency pinned an older @pyreon/* version → npm/bun hoisted two copies.\n` +
    `  2. Your bundler's resolver loaded the package via two different paths (Vite's [bare] vs [package entry] resolvers).\n` +
    `  3. A workspace + npm-published mix (monorepo importing both).\n\n` +
    `Fix:\n` +
    `  Vite:    Add resolve.dedupe: ['@pyreon/*'] to vite.config.ts (the @pyreon/vite-plugin does this automatically when configured).\n` +
    `  Webpack: Use resolve.alias to force a single resolution path.\n` +
    `  npm:     Check 'npm ls @pyreon/*' for version conflicts.\n` +
    `  bun:     Check 'bun pm ls' for version conflicts.\n\n` +
    `Set PYREON_SINGLE_INSTANCE=warn to demote this to a warning (NOT recommended — your app's reactivity will be broken).\n` +
    `Set PYREON_SINGLE_INSTANCE=silent to disable detection entirely (only for browser extensions / micro-frontends where dual loading is intentional).`
  )
}

/**
 * Register a singleton sentinel for a `@pyreon/*` package.
 *
 * Called once at the top of every framework package's `src/index.ts`. The
 * first call registers a marker; subsequent calls with a DIFFERENT marker
 * (i.e., a different module instance) trigger detection per `PYREON_SINGLE_INSTANCE`.
 *
 * @param pkg - Package name (e.g. `'@pyreon/reactivity'`).
 * @param version - Semver from the package's package.json. Used for the
 *   diagnostic error message.
 * @param location - Optional `import.meta.url` of the calling module, for
 *   precise diagnostic output.
 *
 * @example
 * // In @pyreon/reactivity/src/index.ts:
 * import { registerSingleton } from './singleton-sentinel'
 * registerSingleton('@pyreon/reactivity', '0.21.3', import.meta.url)
 */
export function registerSingleton(
  pkg: string,
  version: string,
  location?: string,
): void {
  const state = getSentinelState()
  const marker: SingletonMarker = {
    ref: {},
    pkg,
    version,
    location,
  }
  const existing = state.markers.get(pkg)
  if (!existing) {
    state.markers.set(pkg, marker)
    return
  }
  // Same package, second registration. If markers' refs are the same,
  // it's a re-evaluation of the same module (HMR, vi.resetModules). Allow it.
  if (existing.ref === marker.ref) return
  // Different ref → genuinely a second instance. Trigger detection.
  const mode = getDetectionMode()
  if (mode === 'silent') return
  const message = formatError(pkg, existing, marker)
  if (mode === 'warn') {
    // oxlint-disable-next-line no-console
    console.error(message)
    return
  }
  throw new Error(message)
}

/**
 * Test-only: reset the sentinel state. Tests that legitimately simulate
 * dual loading (the dual-instance-reproducer package, etc.) need to
 * clear markers between test cases.
 *
 * @internal
 */
export function _resetSentinel(): void {
  const host = globalThis as Record<symbol, unknown>
  delete host[SENTINEL_KEY]
}
