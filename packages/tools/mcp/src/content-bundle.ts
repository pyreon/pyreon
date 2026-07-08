/**
 * Resolver for the package's bundled `content/` snapshot.
 *
 * `get_pattern` / `get_anti_patterns` / `get_changelog` read their data from
 * monorepo files that do NOT exist in a `bunx @pyreon/mcp` consumer install.
 * At build time `scripts/copy-content.ts` snapshots those files into a
 * `content/` dir the package ships; the loaders fall back to it when the
 * live monorepo source isn't reachable from `process.cwd()`.
 *
 * This module resolves that dir relative to its OWN location (`import.meta.url`)
 * so it works from both the built `lib/` layout and the `src/` dev layout —
 * it walks up looking for a `content/` sibling of the package root, tolerating
 * whatever nesting the bundler produces.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Resolve a path inside the bundled `content/` dir (e.g. `('patterns')`,
 * `('anti-patterns.md')`, `('changelogs')`). Returns the absolute path if it
 * exists, else `null`. Walks up from this module so it resolves whether the
 * caller runs from `src/` (dev, bun condition) or `lib/` (built).
 */
export function resolveBundledContentPath(...segments: string[]): string | null {
  let dir = dirname(fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'content', ...segments)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}
