/**
 * Barrel export for the three doctor renderers.
 *
 * ANSI helpers used to be re-exported here via `export * from './ansi'`,
 * but the ansi surface now lives in `@pyreon/ansi` — the canonical
 * shared module that backs every Pyreon CLI surface (also consumed
 * by `@pyreon/lint`'s reporter). Consumers that need the wrappers
 * import from `@pyreon/ansi` directly; nothing inside this monorepo
 * goes through this barrel for ANSI.
 */

export { renderText, type TextRenderOptions } from './text'
export { renderJson } from './json'
export { renderGha } from './gha'
