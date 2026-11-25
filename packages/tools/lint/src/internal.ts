/**
 * `@pyreon/lint/internal` — INTERNAL entry, NOT public API.
 *
 * Nothing here carries a semver promise: any export may change or disappear
 * in any release (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * It holds `_workerEntry`, the resolver for the parallel driver's worker file.
 * The driver itself does not need it exported (it resolves the worker through
 * the package's own `./lint-worker` export); it is here so the package's tests
 * can check the BUILT resolution from outside the bundle.
 *
 * It also holds `lintSlice`, the worker body (so tests run it without
 * spawning), and the CLI's test seams: the `--list` / `--init` renderers and
 * the `--preset` / `--rule-options` value parsers (the `./cli` entry exports
 * only `runCli`), and `exitAfterFlush` for the hand-written bin.
 */

import { exitAfterFlush as flushThenExit } from '@pyreon/ansi'

export {
  formatInitResult,
  formatRuleList,
  parsePresetList,
  parseRuleOptionsOverride,
} from './cli-helpers'
export { lintSlice } from './lint-slice'
export { _workerEntry } from './parallel'

/**
 * For the hand-written `bin/pyreon-lint.js`, which cannot import the private,
 * bundled `@pyreon/ansi`: exit once stdout/stderr have flushed, so a piped
 * `--format json` report stays whole (#4799).
 * @internal
 */
export function exitAfterFlush(code: number): Promise<never> {
  return flushThenExit(code)
}
