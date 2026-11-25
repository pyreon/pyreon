/**
 * `@pyreon/ui-core/internal` — NOT public API.
 *
 * The theme-engine registration seam that breaks the ui-core ↔ unistyle
 * dependency cycle: `@pyreon/unistyle` registers its engine with
 * `setThemeEngine` at module load, and `<PyreonUI>` and `@pyreon/rocketstyle`
 * read it with `getThemeEngine`. Nothing here carries a semver promise: it
 * changes in lockstep with the packages that import it (see "What counts as
 * public API" on the stability page,
 * docs/src/content/docs/stability-and-direction.md). Application code must not
 * import from this subpath.
 */
export type { ThemeEngine } from './theme-engine'
export { getThemeEngine, setThemeEngine } from './theme-engine'
