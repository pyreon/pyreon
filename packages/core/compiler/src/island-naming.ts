/**
 * Island auto-name derivation — THE single source of truth.
 *
 * `const X = island(() => import('./X'), { hydrate })` (no explicit `name:`)
 * gets the derived registry name `X$<fnv1a6(relPath)>` — deterministic and
 * collision-free by construction (two files can both bind `Counter`; the
 * file-hash suffix disambiguates). Explicit `name:` always wins.
 *
 * Three consumers must derive IDENTICALLY, so the derivation lives HERE
 * (`@pyreon/compiler` is the lowest shared layer) and everything imports it:
 *
 *  - `@pyreon/vite-plugin` `injectIslandNames` (transform hook) — rewrites the
 *    source so the RUNTIME `island()` call receives the name.
 *  - `@pyreon/vite-plugin` `scanIslandDeclarations` (auto-registry prescan +
 *    transform rescan) — reads raw source from disk and re-derives.
 *  - `@pyreon/compiler` `generateContext` (project scanner) — reports the
 *    island under the name zero's hydration registry ACTUALLY uses.
 *
 * The vite-plugin previously owned these as local functions with the scanner
 * reporting bare binding names that matched nothing in the registry — the
 * exact comment-synced-copy drift this module exists to prevent. Its
 * `island-auto-name.ts` now re-exports from here; an identity parity test
 * (`expect(deriveIslandName).toBe(compilerDeriveIslandName)`) locks against a
 * local copy ever being reintroduced.
 */
import { relative } from 'node:path'

/** FNV-1a 32-bit, base36, first 6 chars — same family as the styler's hash. */
export function fnv1a6(str: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36).slice(0, 6)
}

/**
 * Normalize an absolute module id to a root-relative, forward-slash path.
 * `root` is the Vite root for the plugin consumers and the scanned project
 * cwd for the project scanner — the same directory in a standard zero app,
 * which is what keeps the two derivations byte-identical.
 */
export function islandRelPath(root: string, absPath: string): string {
  return relative(root, absPath).replace(/\\/g, '/')
}

/** The one derivation every consumer uses. */
export function deriveIslandName(varName: string, relPath: string): string {
  return `${varName}$${fnv1a6(relPath)}`
}
