/**
 * `@pyreon/styler/internal` — NOT public API.
 *
 * The seams other `@pyreon` packages wire styler through. Nothing here carries
 * a semver promise: it changes in lockstep with the packages that import it
 * (see "What counts as public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 *
 * `setStyleExtraction` turns on Custom-Property Style Extraction; `@pyreon/ui-core`
 * calls it for `init({ styleExtraction: true })`.
 */
export { setStyleExtraction } from './cpse-state'
