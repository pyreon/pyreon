import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

/**
 * The counts the site prints that are facts about this repository, computed from their sources at build time and
 * written into the content through placeholders, so no content file, and no staging copy of it, holds a number that
 * a pull request elsewhere can make stale.
 *
 * A content string carries `{{@key}}` where the number goes (`"{{@antiPatternCount}} known mistakes"`). The
 * `derivedCounts` plugin (`vite-plugins/derived-counts.ts`) resolves every placeholder in every content JSON file as it
 * is imported, in the build, the dev server and the unit tests alike, and throws on an unknown key or a placeholder it
 * cannot resolve, so a typo fails the build instead of printing `{{@…}}`. `{{count}}`, `{{name}}` and the like in
 * i18n examples are not placeholders: the marker is `{{@`.
 *
 * Not derived, on purpose: the package count (`packageCount` reads the one constant `_counts.json`, the maintainer's
 * decision of 2026-11-18, 80, ahead of npm). Counts printed inside generated images and their alt text
 * (`_assets.json`) cannot be placeholders: the doctor gate (doc-claims, `site-*`) checks those against the repository.
 */

/** Every key a placeholder may name. */
export const DERIVED_KEYS = [
  'antiPatternCount',
  'hookCount',
  'lintCategoryCount',
  'lintRuleCount',
  'mcpToolCount',
  'packageCount',
  'productCount',
] as const
export type DerivedKey = (typeof DERIVED_KEYS)[number]
export type DerivedCounts = Record<DerivedKey, number>

/** The marker. `{{@key}}`: the `@` keeps it apart from the `{{count}}` of i18n examples. */
export const PLACEHOLDER = /\{\{@([^{}]*)\}\}/g

const REPO = resolve(import.meta.dirname, '../../..')
const read = (root: string, rel: string): string | undefined => {
  const p = join(root, rel)
  return existsSync(p) ? readFileSync(p, 'utf8') : undefined
}

/** The `- **Name**` bullets of the anti-pattern catalog: what the MCP `get_anti_patterns` index counts as "N total". */
const antiPatterns = (root: string): number => (read(root, '.agents/rules/anti-patterns.md')?.match(/^- \*\*/gm) ?? []).length

const hooks = (root: string): number =>
  new Set([...(read(root, 'packages/fundamentals/hooks/src/index.ts') ?? '').matchAll(/^export \{ (?:default as )?(use[A-Z][a-zA-Z]+) \}/gm)].map((m) => m[1])).size

const lintRules = (root: string): number => {
  const m = read(root, 'packages/tools/lint/src/rules/index.ts')?.match(/export const allRules: Rule\[\] = \[([\s\S]*?)\n\]/)
  return (m?.[1] ?? '').split('\n').filter((l) => /^\s+[a-zA-Z][a-zA-Z0-9]*,?\s*$/.test(l)).length
}

const lintCategories = (root: string): number => {
  const dir = join(root, 'packages/tools/lint/src/rules')
  const cats = new Set<string>()
  if (!existsSync(dir)) return 0
  for (const cat of readdirSync(dir)) {
    const sub = join(dir, cat)
    if (!statSync(sub).isDirectory()) continue
    for (const f of readdirSync(sub)) {
      const m = f.endsWith('.ts') ? readFileSync(join(sub, f), 'utf8').match(/category:\s*'([a-z0-9-]+)'/) : null
      if (m?.[1]) cats.add(m[1])
    }
  }
  return cats.size
}

/** A manifest `api[]` entry whose signature starts with `tool: ` is a live MCP tool (the scan `check-mcp-docs` uses). */
const mcpTools = (root: string): number => {
  const entry = /name:\s*'([a-z_][a-z0-9_]*)',\s*kind:\s*'[^']*',\s*signature:\s*['"]([^'"]+)['"]/gs
  return [...(read(root, 'packages/tools/mcp/src/manifest.ts') ?? '').matchAll(entry)].filter((m) => m[2]?.startsWith('tool: ')).length
}

const json = (root: string, rel: string): Record<string, unknown> => JSON.parse(read(root, rel) ?? '{}') as Record<string, unknown>
const products = (root: string): number => {
  const order = json(root, 'docs/src/site/content/products/_index.json').order
  return Array.isArray(order) ? new Set(order).size : 0
}
const packages = (root: string): number => {
  const n = json(root, 'docs/src/site/content/_counts.json').packages
  return typeof n === 'number' ? n : 0
}

/** The counts of the tree at `root`. A source that is missing counts 0, and a 0 is refused when it is used. */
export function computeDerived(root: string = REPO): DerivedCounts {
  return {
    antiPatternCount: antiPatterns(root),
    hookCount: hooks(root),
    lintCategoryCount: lintCategories(root),
    lintRuleCount: lintRules(root),
    mcpToolCount: mcpTools(root),
    packageCount: packages(root),
    productCount: products(root),
  }
}

let cached: DerivedCounts | undefined
/** The counts of this checkout, computed once per process. */
export const derived = (): DerivedCounts => (cached ??= computeDerived())

/**
 * Replace every `{{@key}}` in `text` with its count. Throws on a key that is not in {@link DERIVED_KEYS} and on a count
 * that could not be computed (0), naming `where`; a marker that survives is a build error, never page text.
 */
export function resolveDerived(text: string, counts: DerivedCounts, where: string): string {
  const out = text.replace(PLACEHOLDER, (_m, key: string) => {
    if (!(DERIVED_KEYS as readonly string[]).includes(key)) {
      throw new Error(`[Pyreon] ${where}: unknown derived count "{{@${key}}}". Known keys: ${DERIVED_KEYS.join(', ')} (docs/src/site/derived.ts).`)
    }
    const n = counts[key as DerivedKey]
    if (!(n > 0)) throw new Error(`[Pyreon] ${where}: "{{@${key}}}" could not be computed from this checkout (got ${n}); its source is missing or changed shape (docs/src/site/derived.ts).`)
    return String(n)
  })
  if (out.includes('{{@')) throw new Error(`[Pyreon] ${where}: a "{{@" placeholder is malformed. Write {{@key}} with a key from docs/src/site/derived.ts.`)
  return out
}
