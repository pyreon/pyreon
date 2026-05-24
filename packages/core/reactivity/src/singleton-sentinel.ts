/**
 * Singleton sentinel — fail-loud detection of duplicate framework instances.
 *
 * ## The bug class this catches
 *
 * Bundlers can produce TWO module instances of the same `@pyreon/*` package
 * when consumers reach it via different resolution paths:
 *   - Vite's `[bare]` vs `[package entry]` resolver divergence
 *   - Sub-dep version mismatches (lockfile has two `@pyreon/core` versions)
 *   - Workspace + npm-published mix in monorepos
 *
 * Each instance has its own module-level state (`let _foo = …`). Producers and
 * consumers can land on DIFFERENT copies, silently breaking framework contracts:
 * `runWithHooks` sets `_current` on instance A; `onMount` reads `_current` from
 * instance B (null) → warning storm + invariant violations.
 *
 * ## How it works
 *
 * Every `@pyreon/*` package that has module-level state calls
 * `registerSingleton('@pyreon/<name>', <version>, import.meta.url)` at the top
 * of its `src/index.ts`. The first registration records a marker on globalThis.
 * A second registration with a DIFFERENT location triggers detection:
 *
 *   - default / `'throw'`: throws Error with actionable diagnostic
 *   - `'warn'`: `console.error` then continues (graceful path for users mid-fix)
 *   - `'silent'`: no detection (escape hatch for browser extensions, micro-
 *     frontends, nested SSR test harnesses that legitimately dual-load)
 *
 * Mode is controlled by `PYREON_SINGLE_INSTANCE` env var.
 *
 * ## HMR-aware
 *
 * Vite's HMR re-evaluates modules. `import.meta.url` of the new evaluation has
 * the SAME path with possibly different query params (`?v=12345`, `?t=12345`,
 * `?import`). The sentinel normalizes the location (strips query string) before
 * comparing. Same normalized location → HMR re-eval → silently allowed. Different
 * location → genuine dual-instance → triggers detection.
 *
 * ## No defensive try/catch
 *
 * Earlier drafts wrapped the registration in try/catch as a safety measure for
 * "exotic runtimes." On reflection: `globalThis` + `Symbol.for` + `Map` are
 * universal across every supported runtime. The "exotic runtime" concern is
 * hypothetical. Adding a try/catch would only HIDE real bugs in the sentinel
 * itself. If the sentinel ever crashes, that IS a framework bug worth surfacing.
 */

interface SingletonMarker {
  /** Package name, e.g. `'@pyreon/reactivity'`. */
  pkg: string
  /** Semver string from package.json. */
  version: string
  /** Path-normalized module location (query string stripped). */
  location: string
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
  // Cast through unknown — @pyreon/reactivity's env type only declares NODE_ENV;
  // PYREON_SINGLE_INSTANCE is a runtime-only override.
  const env =
    typeof process !== 'undefined' && process.env
      ? (process.env as unknown as Record<string, string | undefined>).PYREON_SINGLE_INSTANCE
      : undefined
  if (env === 'warn' || env === 'silent') return env
  return 'throw'
}

/**
 * Strip Vite's HMR query parameters from a module URL.
 *
 * Vite's HMR re-eval produces the same path with one of these suffixes:
 *   - `?v=<timestamp>` — version cache-bust
 *   - `?t=<timestamp>` — HMR timestamp
 *   - `?import` — import-analysis marker
 *
 * Normalizing the location lets the sentinel recognize an HMR re-eval (same
 * source file, different query) as a legitimate re-registration rather than a
 * genuine dual-instance load.
 */
function normalizeLocation(url: string): string {
  const queryIdx = url.indexOf('?')
  return queryIdx === -1 ? url : url.slice(0, queryIdx)
}

function formatError(pkg: string, existing: SingletonMarker, current: SingletonMarker): string {
  return (
    `[Pyreon] Multiple instances of ${pkg} detected.\n\n` +
    `This breaks the framework's contracts (reactivity, lifecycle hooks, context).\n` +
    `Two distinct module instances of the same package were loaded in this heap:\n\n` +
    `  Instance A: ${existing.location} (version ${existing.version})\n` +
    `  Instance B: ${current.location} (version ${current.version})\n\n` +
    `Likely causes:\n` +
    `  1. Sub-dependency pinned an older @pyreon/* version → npm/bun hoisted two copies.\n` +
    `  2. Your bundler's resolver loaded the package via two different paths (Vite's [bare] vs [package entry] resolvers).\n` +
    `  3. A workspace + npm-published mix (monorepo importing both).\n\n` +
    `Fix:\n` +
    `  Vite:    @pyreon/vite-plugin injects resolve.dedupe automatically. If you have a custom Vite config, ensure resolve.dedupe includes ['@pyreon/*'].\n` +
    `  Webpack: Use resolve.alias to force a single resolution path.\n` +
    `  Diagnostic: Run 'pyreon doctor --check-dedup' to identify duplicates in your lockfile.\n` +
    `  npm:     Check 'npm ls @pyreon/*' for version conflicts.\n` +
    `  bun:     Check 'bun pm ls' for version conflicts.\n\n` +
    `Set PYREON_SINGLE_INSTANCE=warn to demote this to a warning (NOT recommended — your app's reactivity will be broken).\n` +
    `Set PYREON_SINGLE_INSTANCE=silent to disable detection entirely (only for browser extensions / micro-frontends where dual loading is intentional).`
  )
}

/**
 * Register a singleton sentinel for a `@pyreon/*` package.
 *
 * Called once at the top of every framework package's `src/index.ts`. The first
 * call registers a marker; subsequent calls with the SAME normalized location
 * are treated as HMR re-evals (silently allowed); calls with a DIFFERENT
 * location trigger detection per `PYREON_SINGLE_INSTANCE`.
 *
 * @param pkg - Package name (e.g. `'@pyreon/reactivity'`).
 * @param version - Semver from the package's package.json. Used for diagnostics.
 * @param location - `import.meta.url` of the calling module. Normalized to strip
 *   Vite's HMR query params before comparison.
 *
 * @example
 * // In @pyreon/reactivity/src/index.ts:
 * import { registerSingleton } from './singleton-sentinel'
 * registerSingleton('@pyreon/reactivity', '0.21.3', import.meta.url)
 */
export function registerSingleton(pkg: string, version: string, location: string): void {
  const state = getSentinelState()
  const marker: SingletonMarker = {
    pkg,
    version,
    location: normalizeLocation(location),
  }
  const existing = state.markers.get(pkg)
  if (!existing) {
    state.markers.set(pkg, marker)
    return
  }
  // Same normalized location → HMR re-eval / vi.resetModules() → allow silently.
  // Different location → genuine dual-instance → trigger detection.
  if (existing.location === marker.location) return
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
 * Test-only: reset the sentinel state. Tests that legitimately simulate dual-
 * loading (the dual-instance-reproducer package, etc.) need to clear markers
 * between test cases.
 *
 * @internal
 */
export function _resetSentinel(): void {
  const host = globalThis as Record<symbol, unknown>
  delete host[SENTINEL_KEY]
}
