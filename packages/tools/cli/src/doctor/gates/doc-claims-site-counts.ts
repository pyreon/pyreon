import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SITE_PACKAGE_COUNT_FILE } from './doc-claims-site'

// The sources of truth for the marketing-site claims in doc-claims-site.ts. They text-parse the in-repo files
// (see the note above `countLintRules` in doc-claims.ts: an import would resolve a stale cache).

/** Products on the marketing site: one id per product page in `products/_index.json`. */
export const countSiteProducts = (repoRoot: string): number => {
  const p = join(repoRoot, 'docs/src/site/content/products/_index.json')
  if (!existsSync(p)) return 0
  try {
    const order = (JSON.parse(readFileSync(p, 'utf8')) as { order?: unknown }).order
    return Array.isArray(order) ? new Set(order).size : 0
  } catch {
    return 0
  }
}

/** Entries in the anti-pattern catalog: the bullets the MCP `get_anti_patterns` parser counts. */
export const countAntiPatternEntries = (repoRoot: string): number => {
  const p = join(repoRoot, '.agents/rules/anti-patterns.md')
  if (!existsSync(p)) return 0
  return (readFileSync(p, 'utf8').match(/^- \*\*/gm) ?? []).length
}

/** The package count the marketing site is told to state: the one constant in the content set. */
export const readSitePackageCount = (repoRoot: string): number => {
  const p = join(repoRoot, SITE_PACKAGE_COUNT_FILE)
  if (!existsSync(p)) return 0
  try {
    const n = (JSON.parse(readFileSync(p, 'utf8')) as { packages?: unknown }).packages
    return typeof n === 'number' ? n : 0
  } catch {
    return 0
  }
}
