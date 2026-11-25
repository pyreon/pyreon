/**
 * `@pyreon/atlas/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page).
 * Application code must not import from this subpath.
 */
import { exitAfterFlush as flushThenExit } from '@pyreon/ansi'

/**
 * For the hand-written `bin/atlas.js`, which cannot import the private,
 * bundled `@pyreon/ansi`: exit once stdout/stderr have flushed (#4799).
 * @internal
 */
export function exitAfterFlush(code: number): Promise<never> {
  return flushThenExit(code)
}
