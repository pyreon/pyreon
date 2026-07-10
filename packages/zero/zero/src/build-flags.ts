/**
 * Inner-build env-flag registry — the ONE home for the per-mode gate
 * flags that keep zero's recursive Vite sub-builds from re-triggering
 * their own `closeBundle` hooks.
 *
 * `buildSsrBundle` (ssr-build-shared.ts) runs a nested programmatic
 * Vite build whose plugin chain re-instantiates `ssgPlugin` /
 * `ssrPlugin`. Each mode owns its own flag namespace so the SSR
 * plugin's recursive sub-build can never collide with SSG's flag and
 * vice-versa (the cross-mode flag-leak failure class).
 *
 * Historically each plugin declared its own literal and kept the OTHER
 * plugin's literal in sync BY COMMENT ("keep in sync with
 * ssg-plugin.ts:SSG_BUILD_FLAG") — a drift hazard this module removes.
 * Both plugins + the shared build helper import from here.
 */

/** Gate for the SSR/ISR plugin's recursive server sub-build. */
export const SSR_BUILD_FLAG = 'PYREON_ZERO_SSR_INNER_BUILD'

/** Gate for the SSG plugin's recursive prerender sub-build. */
export const SSG_BUILD_FLAG = 'PYREON_ZERO_SSG_INNER_BUILD'

/**
 * True when EITHER inner-build flag is set — i.e. the current process
 * env claims we're inside one of zero's recursive sub-builds.
 */
export function innerBuildFlagSet(env: Record<string, string | undefined> = process.env): boolean {
  return env[SSR_BUILD_FLAG] === '1' || env[SSG_BUILD_FLAG] === '1'
}

/**
 * In-process marker distinguishing a GENUINE inner sub-build (launched
 * by `buildSsrBundle` in THIS process — the only launcher) from an env
 * flag LEAKED from a parent process or shell (`export
 * PYREON_ZERO_SSR_INNER_BUILD=1` in CI, a crashed prior orchestrator,
 * etc.). A leaked flag silently disables the whole SSR/SSG post-step of
 * a top-level build — the plugins use this marker to print a one-line
 * notice instead of skipping in total silence.
 *
 * A counter (not a boolean) so nested enter/exit pairs compose; reads
 * are only meaningful in the same module instance `buildSsrBundle`
 * runs in — a second copy of `@pyreon/zero` in the process would see
 * `false` and print a spurious (but harmless, and diagnostically
 * useful) leak notice.
 */
let _innerBuildDepth = 0

/** @internal Called by `buildSsrBundle` before launching the sub-build. */
export function _enterInnerBuild(): void {
  _innerBuildDepth++
}

/** @internal Called by `buildSsrBundle` when the sub-build settles. */
export function _exitInnerBuild(): void {
  if (_innerBuildDepth > 0) _innerBuildDepth--
}

/**
 * True while `buildSsrBundle` is running a genuine inner sub-build in
 * this process. Combined with `innerBuildFlagSet()`: flag set but NOT
 * active in-process ⇒ the flag leaked in from outside.
 */
export function innerBuildActiveInProcess(): boolean {
  return _innerBuildDepth > 0
}
