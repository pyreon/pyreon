import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Finding } from '../types'
import type { ClaimCheck } from './doc-claims'
import type { ClaimSpec } from './doc-claims-site'
import { SITE_ANTI_PATTERN_CLAIMS, SITE_PACKAGE_COUNT_CLAIMS, SITE_PACKAGE_COUNT_FILE, SITE_PRODUCT_COUNT_CLAIMS } from './doc-claims-site'

// The sources of truth for the marketing-site claims in doc-claims-site.ts. They text-parse the in-repo files
// (see the note above `countLintRules` in doc-claims.ts: an import would resolve a stale cache).

/** Products on the marketing site: one id per product page in `products/_index.json`. */
const countSiteProducts = (repoRoot: string): number => {
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
const countAntiPatternEntries = (repoRoot: string): number => {
  const p = join(repoRoot, '.agents/rules/anti-patterns.md')
  if (!existsSync(p)) return 0
  return (readFileSync(p, 'utf8').match(/^- \*\*/gm) ?? []).length
}

/** The package count the marketing site is told to state: the one constant in the content set. */
const readSitePackageCount = (repoRoot: string): number => {
  const p = join(repoRoot, SITE_PACKAGE_COUNT_FILE)
  if (!existsSync(p)) return 0
  try {
    const n = (JSON.parse(readFileSync(p, 'utf8')) as { packages?: unknown }).packages
    return typeof n === 'number' ? n : 0
  } catch {
    return 0
  }
}

/** The marketing-site count checks, appended to the gate's list. */
export const SITE_COUNT_CHECKS: ClaimCheck[] = [
  {
    name: 'site product count',
    codeId: 'site-product-count',
    actual: countSiteProducts,
    claims: SITE_PRODUCT_COUNT_CLAIMS,
  },
  {
    name: 'site anti-pattern total',
    codeId: 'site-anti-pattern-count',
    actual: countAntiPatternEntries,
    claims: SITE_ANTI_PATTERN_CLAIMS,
  },
  {
    // Deliberately NOT the published count: the site states the maintainer's decision (see doc-claims-site.ts).
    name: 'site package count (the content set constant)',
    codeId: 'site-package-count',
    actual: readSitePackageCount,
    claims: SITE_PACKAGE_COUNT_CLAIMS,
  },
]

/** The keys a `{{@key}}` placeholder may name: the same list as `DERIVED_KEYS` in docs/src/site/derived.ts (a docs test keeps them equal). */
export const SITE_DERIVED_KEYS = ['antiPatternCount', 'hookCount', 'lintCategoryCount', 'lintRuleCount', 'mcpToolCount', 'packageCount', 'productCount'] as const

const contentJson = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) contentJson(p, out)
    else if (name.endsWith('.json')) out.push(p)
  }

  return out
}

/** A `{{@…}}` in the site content that the build could not resolve: a key that is not derived, or a malformed marker. */
export const findUnknownPlaceholders = (repoRoot: string): Finding[] => {
  const root = join(repoRoot, 'docs/src/site/content')
  if (!existsSync(root)) return []
  const findings: Finding[] = []
  for (const path of contentJson(root)) {
    const relPath = path.slice(repoRoot.length + 1)
    for (const m of readFileSync(path, 'utf8').matchAll(/\{\{@([^{}]*)\}\}|\{\{@(?![^{}]*\}\})/g)) {
      if (m[1] !== undefined && (SITE_DERIVED_KEYS as readonly string[]).includes(m[1])) continue
      findings.push({
        category: 'documentation',
        severity: 'error',
        code: 'doc-claims/site-derived-placeholder',
        gate: 'doc-claims',
        message: `${relPath}: ${m[1] === undefined ? 'a malformed "{{@" placeholder' : `unknown derived count "{{@${m[1]}}}"`}; the build would fail. Known keys: ${SITE_DERIVED_KEYS.join(', ')}.`,
        location: { path, relPath },
      })
    }
  }

  return findings
}

/**
 * The verdict on one claim site whose number the site content derives at build time (docs/src/site/derived.ts): the
 * sentence must carry the placeholder, and a count in digits is an error whatever its value, because it goes stale with
 * the next pull request that changes the thing counted. No findings when the sentence is fine.
 */
export const derivedClaimFindings = (filePath: string, claim: ClaimSpec, check: { name: string; codeId: string }, actual: number): Finding[] => {
  // A derived claim in a file that is not there states nothing in digits.
  if (!existsSync(filePath)) return []
  const content = readFileSync(filePath, 'utf8')
  const key = claim.derived as string
  const flags = claim.pattern.flags.replace('g', '')
  const hardCoded = content.match(new RegExp(claim.pattern.source, flags))
  const base = { category: 'documentation', gate: 'doc-claims', location: { path: filePath, relPath: claim.file } } as const
  if (hardCoded?.[1]) {
    return [
      {
        ...base,
        severity: 'error',
        code: `doc-claims/${check.codeId}-hardcoded`,
        message: `${check.name}: ${claim.file} states "${hardCoded[1]}" in digits; this count is derived (actual ${actual}).`,
        fix: `Write {{@${key}}} where the number goes (in the staging content set first, then sync)`,
      },
    ]
  }
  if (content.match(new RegExp(claim.pattern.source.replace('(\\d+)', `(\\{\\{@${key}\\}\\})`), flags))) return []

  return [
    {
      ...base,
      severity: 'warning',
      code: `doc-claims/${check.codeId}-pattern-miss`,
      message: `${check.name}: neither the placeholder {{@${key}}} nor a count was found by the pattern in ${claim.file} (the sentence was likely deleted or rephrased).`,
    },
  ]
}
