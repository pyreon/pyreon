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
  /**
   * Refcount of active "silent opt-out" scopes (see `withSilent`). When > 0,
   * `getDetectionMode()` returns `'silent'` regardless of the env var.
   *
   * The refcount replaces the prior env-var dance pattern that wrapped
   * `process.env.PYREON_SINGLE_INSTANCE` set/restore around the legitimate
   * dual-load scope (rocketstyle-collapse, zero SSG, zero dev SSR's
   * `ssrLoadModuleQuiet`). That pattern was race-prone: under concurrent
   * `Promise.all` of N opt-out scopes, the second scope captured `prev=silent`
   * (set by the first), and its `finally` restored to `silent` — leaking the
   * silence past both scopes. A refcount is order-independent: every
   * `push` matches exactly one `pop`, intermediate state during overlapping
   * scopes is always "silent", and final state after all scopes settle is
   * always 0 (= not silent).
   */
  silentDepth: number
}

const SENTINEL_KEY = Symbol.for('pyreon/singleton-sentinel-state')

function getSentinelState(): SentinelState {
  const host = globalThis as Record<symbol, unknown>
  const existing = host[SENTINEL_KEY] as SentinelState | undefined
  if (existing) {
    // Earlier versions of the sentinel had no `silentDepth` field. Defensive
    // backfill so a mixed-version graph (e.g. one of the packages bundled an
    // older sentinel via a stale lockfile entry) doesn't NaN-arithmetic.
    if (typeof existing.silentDepth !== 'number') existing.silentDepth = 0
    return existing
  }
  const state: SentinelState = { markers: new Map(), silentDepth: 0 }
  host[SENTINEL_KEY] = state
  return state
}

type DetectionMode = 'throw' | 'warn' | 'silent'

function getDetectionMode(): DetectionMode {
  // Refcount opt-out wins (used by zero's ssrLoadModuleQuiet,
  // ssg-plugin.ts, and vite-plugin's rocketstyle-collapse to scope
  // legitimate dual-load windows without env-var mutation).
  if (getSentinelState().silentDepth > 0) return 'silent'
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
  // Some runtimes don't provide a usable `import.meta.url`: Cloudflare workerd
  // (and certain bundlers) pass `undefined`. The sentinel must NEVER crash
  // module init over it — a bare `url.indexOf` here threw
  // `Cannot read properties of undefined (reading 'indexOf')` and took down
  // every @pyreon-based Cloudflare Worker at startup. Degrade gracefully:
  // without a real location the sentinel just can't distinguish a genuine
  // dual-instance from an HMR re-eval (same placeholder → treated as a re-eval
  // → allowed), which is the safe failure mode.
  if (typeof url !== 'string' || url.length === 0) return '<unknown>'
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
    // Intentionally NOT __DEV__-guarded. `PYREON_SINGLE_INSTANCE=warn` is the
    // explicit user opt-in to keep getting the diagnostic in production
    // (typically during a migration where they need their app to load + visibly
    // know reactivity is broken). Tree-shaking this away would defeat the
    // whole point of the `warn` escape hatch.
    // oxlint-disable-next-line no-console
    // pyreon-lint-disable-next-line pyreon/dev-guard-warnings
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

/**
 * Scope-style opt-out from sentinel detection — for legitimate dual-load
 * scenarios where two genuinely-different module locations of the same
 * `@pyreon/*` package must coexist briefly without throwing.
 *
 * Replaces the prior env-var dance (`process.env.PYREON_SINGLE_INSTANCE =
 * 'silent'` / capture+restore) which was race-prone under concurrent
 * execution. Use ONLY for documented dual-load patterns:
 *
 *   - `@pyreon/zero` SSG (`await import(.../entry-server.mjs)` — built bundle
 *     reships framework copies alongside the outer process's workspace copy)
 *   - `@pyreon/zero` dev SSR (`ssrLoadModule` — outer plugin chain + Vite SSR
 *     module graph see different module identities for the same source)
 *   - `@pyreon/vite-plugin` `rocketstyle-collapse` (nested Vite SSR resolver
 *     spinning a child server bound to the consumer's vite.config)
 *
 * Refcount-based: every `withSilent` push matches exactly one pop. Concurrent
 * scopes overlap correctly — depth > 0 throughout the union of all active
 * scopes, returns to 0 when all settle. Order-independent (unlike env-var
 * mutation which is race-prone under `Promise.all`).
 *
 * @example
 * import { withSilent } from '@pyreon/reactivity'
 * await withSilent(async () => {
 *   return await server.ssrLoadModule(specifier)
 * })
 *
 * @example
 * // Multi-call concurrent shape — works correctly under refcount,
 * // would leak `silent` permanently under the env-var dance.
 * await Promise.all([
 *   withSilent(() => loadA()),
 *   withSilent(() => loadB()),
 *   withSilent(() => loadC()),
 * ])
 */
export async function withSilent<T>(fn: () => Promise<T> | T): Promise<T> {
  const state = getSentinelState()
  state.silentDepth += 1
  try {
    return await fn()
  } finally {
    state.silentDepth -= 1
    if (state.silentDepth < 0) state.silentDepth = 0 // defensive: never go negative
  }
}

/**
 * Synchronous variant of `withSilent` for code paths that can't `await` (e.g.
 * module-load-time registration inside a custom test harness). Prefer
 * `withSilent` whenever the work is async.
 *
 * @example
 * withSilentSync(() => {
 *   registerSingleton('@pyreon/X', '1.0.0', someLocation)
 * })
 */
export function withSilentSync<T>(fn: () => T): T {
  const state = getSentinelState()
  state.silentDepth += 1
  try {
    return fn()
  } finally {
    state.silentDepth -= 1
    if (state.silentDepth < 0) state.silentDepth = 0
  }
}
