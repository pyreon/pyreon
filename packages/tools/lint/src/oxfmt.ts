/**
 * Formatter presets for oxfmt — the half of "readable" that a FORMATTER owns.
 *
 * `@pyreon/lint`'s `readable` rules decide WHETHER a blank line separates two
 * statements; oxfmt owns everything inside a line, wrapping, import order and
 * JSX attribute layout. The two never fight: oxfmt keeps one blank line between
 * statements and never adds or removes one there.
 *
 * ```ts
 * // oxfmt.config.ts
 * export { readable as default } from '@pyreon/lint/oxfmt'
 * ```
 *
 * To change a value, spread the preset:
 *
 * ```ts
 * import { readable } from '@pyreon/lint/oxfmt'
 * export default { ...readable, printWidth: 120 }
 * ```
 *
 * Deliberately NOT set: `objectWrap` stays `preserve` (the author decides
 * whether an object is one line or many) and `jsdoc` formatting stays off
 * (rewrapping every doc comment is churn without a readability gain).
 */

/** The oxfmt options these presets set. Structural, so the package needs no oxfmt dependency. */
export interface OxfmtPreset {
  printWidth: number
  tabWidth: number
  useTabs: boolean
  semi: boolean
  singleQuote: boolean
  jsxSingleQuote: boolean
  quoteProps: 'as-needed' | 'consistent' | 'preserve'
  trailingComma: 'all' | 'es5' | 'none'
  arrowParens: 'always' | 'avoid'
  bracketSpacing: boolean
  bracketSameLine: boolean
  /** Imports grouped (built-ins, packages, then relative), sorted, one blank line between groups. */
  sortImports: { newlinesBetween: boolean }
  singleAttributePerLine: boolean
  ignorePatterns: string[]
}

/**
 * Pyreon's house style plus sorted, grouped imports. Width stays 100: at 80,
 * this repository would rewrap 5,939 files for no readability gain.
 */
export const readable: OxfmtPreset = {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: true,
  jsxSingleQuote: false,
  quoteProps: 'as-needed',
  trailingComma: 'all',
  arrowParens: 'always',
  bracketSpacing: true,
  bracketSameLine: false,
  sortImports: { newlinesBetween: true },
  singleAttributePerLine: false,
  // Anchored to the project root: `**/lib` would also skip an app's own
  // `src/lib/` source folder. Files in `.gitignore` are skipped anyway.
  ignorePatterns: ['/dist', '/lib', '**/*.generated.*'],
}

/**
 * `readable` with one JSX attribute per line whenever a tag wraps. Best on new
 * code (the scaffolds use it); on an existing codebase it rewraps every JSX
 * tag that does not fit on one line.
 */
export const readableStrict: OxfmtPreset = {
  ...readable,
  singleAttributePerLine: true,
}

export default readable
