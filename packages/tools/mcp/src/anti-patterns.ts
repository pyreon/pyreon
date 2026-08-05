/**
 * Parser for `.claude/rules/anti-patterns.md`. Drives the `get_anti_patterns`
 * MCP tool (T2.5.4) and the `detector-tag-consistency` test, so a single
 * canonical source of truth produces the AI-facing list, the doc file,
 * and the drift guard.
 *
 * Format assumptions (enforced by the consistency test):
 *  - Top-level category headings are `## <Name>` (second-level). The
 *    first paragraph (before the first `## `) is intro prose and is
 *    not returned as anti-patterns.
 *  - Each anti-pattern is a line that starts with `- **Name**` at
 *    column 0 and can continue onto subsequent lines (until the next
 *    `- **` or `## `).
 *  - An optional `[detector: <code>]` tag appears anywhere in the
 *    bullet's first line — it pairs the bullet with a static
 *    `PyreonDiagnosticCode`. Missing tag means the anti-pattern is
 *    doc-only.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { resolveBundledContentPath } from './content-bundle'

export type AntiPatternCategory =
  | 'reactivity'
  | 'jsx'
  | 'context'
  | 'architecture'
  | 'islands'
  | 'ssr'
  | 'ssg'
  | 'testing'
  | 'lifecycle'
  | 'build'
  | 'ci'
  | 'best-practices'
  | 'library-api'
  | 'documentation'

export interface AntiPatternEntry {
  /** Title extracted from `**...**` in the bullet */
  name: string
  /** Normalised category slug (matches the enum above) */
  category: AntiPatternCategory
  /** Category heading as it appears in the file (e.g. "Reactivity Mistakes") */
  categoryHeading: string
  /** Body text after the title, minus the detector tag */
  description: string
  /** Detector codes listed in `[detector: X / Y]` or `null` if none */
  detectorCodes: string[]
}

/**
 * Heading → slug. EVERY `##` section in `anti-patterns.md` must appear here:
 * `parseAntiPatterns` skips an unmapped heading with a bare `continue`, so a
 * section absent from this map is silently invisible to MCP `get_anti_patterns`
 * AND to the generated troubleshooting docs — while the response header still
 * advertises a total, presenting a partial catalog as the whole one.
 *
 * That is not hypothetical: NINE sections were unmapped, dropping 86 of 236
 * entries (36%), including all 27 of `Build Pipeline Mistakes` — where most of
 * the compiler/native institutional memory lives. The catalog exists to be READ
 * by agents; a section that never reaches them is documentation that was never
 * written.
 *
 * `catalogHeadings()` below turns the silent skip into a loud failure, so adding
 * a section to the file without adding it here fails a test instead of quietly
 * shrinking the catalog.
 */
const CATEGORY_MAP: Record<string, AntiPatternCategory> = {
  'Reactivity Mistakes': 'reactivity',
  // Mapped onto `reactivity` rather than given its own slug: these ARE
  // reactivity mistakes (they just arise when Pyreon's primitives back a third
  // party's atom-style seam), so a reader hunting a reactivity bug finds them
  // in the one place they would look.
  'Reactivity-Seam Adapter Mistakes': 'reactivity',
  'JSX Mistakes': 'jsx',
  'Context & Provider Mistakes': 'context',
  'Architecture Mistakes': 'architecture',
  'Islands Mistakes': 'islands',
  'SSR-rendering Mistakes': 'ssr',
  'SSG / e2e Test-Server Mistakes': 'ssg',
  'SSG / ISR Correctness': 'ssg',
  'Testing Mistakes': 'testing',
  'Lifecycle & Cleanup Mistakes': 'lifecycle',
  'Build Pipeline Mistakes': 'build',
  'CI / Build Gate Mistakes': 'ci',
  'Best-Practice Mistakes (opt-in `@pyreon/lint` rules)': 'best-practices',
  'Library API-Shape Mistakes': 'library-api',
  'Documentation Mistakes': 'documentation',
  // `Memory Leak Classes (catalog)` is deliberately absent: it is a TABLE, not
  // a bullet list, so it contributes no entries either way. The leak classes
  // have their own documentation.
}

export const ANTI_PATTERN_CATEGORIES: readonly AntiPatternCategory[] = [
  'reactivity',
  'jsx',
  'context',
  'architecture',
  'islands',
  'ssr',
  'ssg',
  'testing',
  'lifecycle',
  'build',
  'ci',
  'best-practices',
  'library-api',
  'documentation',
] as const

function normaliseCategory(heading: string): AntiPatternCategory | null {
  const trimmed = heading.trim()
  return CATEGORY_MAP[trimmed] ?? null
}

function splitSections(doc: string): Array<{ heading: string; body: string }> {
  const lines = doc.split('\n')
  const sections: Array<{ heading: string; body: string }> = []
  let currentHeading: string | null = null
  let currentBody: string[] = []
  for (const line of lines) {
    const headingMatch = /^## (.+)$/.exec(line)
    if (headingMatch) {
      if (currentHeading !== null) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n') })
      }
      currentHeading = headingMatch[1]!
      currentBody = []
    } else if (currentHeading !== null) {
      currentBody.push(line)
    }
  }
  if (currentHeading !== null) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n') })
  }
  return sections
}

function splitBullets(sectionBody: string): string[] {
  // Split on lines that start with `- **` at column 0. Continuation
  // lines (any indented or non-bullet content) stay attached to the
  // previous bullet.
  const lines = sectionBody.split('\n')
  const bullets: string[] = []
  let current: string[] = []
  for (const line of lines) {
    if (line.startsWith('- **')) {
      if (current.length > 0) bullets.push(current.join('\n').trim())
      current = [line]
    } else if (current.length > 0) {
      current.push(line)
    }
  }
  if (current.length > 0) bullets.push(current.join('\n').trim())
  return bullets.filter((b) => b.length > 0)
}

function parseBullet(bullet: string): {
  name: string
  description: string
  detectorCodes: string[]
} | null {
  // `- **Name** [detector: ...]: body...` or `- **Name**: body...`
  // Extract the **bolded** name first.
  //
  // NON-GREEDY up to the closing `**`, rather than "any run of non-asterisks".
  // The exclusion form silently rejected a title containing a LITERAL asterisk
  // — `` `node:*` ``, `@pyreon/*`, `packages/*` are all natural here — and a
  // rejected bullet is dropped with a bare `continue`, so the entry simply
  // never existed for MCP or the docs. Same silent-drop shape as the unmapped
  // -heading skip above, one level down.
  const nameMatch = /^- \*\*(.+?)\*\*/s.exec(bullet)
  if (!nameMatch) return null
  const name = nameMatch[1]!.trim()

  const afterName = bullet.slice(nameMatch[0].length)

  // Pull out the detector tag if present. It can appear as:
  //   ` [detector: code]`
  //   ` \`[detector: code]\``
  const detectorMatch = /`?\[detector:\s*([a-z0-9\-/ ]+)\]`?/i.exec(afterName)
  const detectorCodes: string[] = []
  if (detectorMatch) {
    for (const code of detectorMatch[1]!.split('/')) {
      const c = code.trim()
      if (c) detectorCodes.push(c)
    }
  }

  // Strip the detector tag + any leading `:` or spaces from the body.
  let description = afterName
  if (detectorMatch) {
    description = description.replace(detectorMatch[0], '')
  }
  description = description.replace(/^[\s:]+/, '').trim()

  return { name, description, detectorCodes }
}

/**
 * Locate `.claude/rules/anti-patterns.md` by walking up from `startDir`.
 * Returns the file contents or null if not found within 30 levels.
 */
function findAntiPatternsFile(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 30; i++) {
    const candidate = join(dir, '.claude', 'rules', 'anti-patterns.md')
    if (existsSync(candidate)) {
      try {
        return readFileSync(candidate, 'utf8')
      } catch {
        return null
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/**
 * Load the anti-patterns catalog doc. Prefers the live monorepo source found
 * by walking up from `startDir` (so in-repo dev sees the latest), but only
 * when that file is actually Pyreon's catalog (it parses to ≥1 entry — a
 * consumer's own unrelated `.claude/rules/anti-patterns.md` parses to zero
 * and MUST NOT shadow the bundled Pyreon snapshot). Falls back to the
 * package's bundled `content/anti-patterns.md` (the `bunx @pyreon/mcp`
 * consumer case). Returns null only when neither source exists.
 *
 * `bundledFile` is injectable for tests; production auto-resolves it.
 */
export function loadAntiPatternsDoc(
  startDir: string = process.cwd(),
  bundledFile: string | null = resolveBundledContentPath('anti-patterns.md'),
): string | null {
  const live = findAntiPatternsFile(startDir)
  if (live !== null && parseAntiPatterns(live).length > 0) return live
  if (bundledFile && existsSync(bundledFile)) {
    try {
      return readFileSync(bundledFile, 'utf8')
    } catch {
      // fall through to the last-resort live doc
    }
  }
  return live
}

/**
 * Every `##` heading in the catalog, paired with the slug it maps to (or `null`
 * when unmapped). The gate that keeps `CATEGORY_MAP` honest: an unmapped
 * heading is dropped SILENTLY, so without this the only symptom is a total that
 * quietly under-counts.
 *
 * Exported so the test can assert against the real catalog file rather than a
 * fixture — a fixture would only ever agree with whatever the map contains.
 */
export function catalogHeadings(doc: string): Array<{
  heading: string
  category: AntiPatternCategory | null
}> {
  return splitSections(doc).map(({ heading }) => ({
    heading,
    category: normaliseCategory(heading),
  }))
}

export function parseAntiPatterns(doc: string): AntiPatternEntry[] {
  const sections = splitSections(doc)
  const entries: AntiPatternEntry[] = []
  for (const { heading, body } of sections) {
    const category = normaliseCategory(heading)
    if (!category) continue
    for (const bullet of splitBullets(body)) {
      const parsed = parseBullet(bullet)
      if (!parsed) continue
      entries.push({
        name: parsed.name,
        category,
        categoryHeading: heading,
        description: parsed.description,
        detectorCodes: parsed.detectorCodes,
      })
    }
  }
  return entries
}

/** Format a list of entries into a single Markdown block suitable for MCP. */
export function formatAntiPatterns(
  entries: AntiPatternEntry[],
  filterCategory: AntiPatternCategory | 'all',
): string {
  if (entries.length === 0) {
    return filterCategory === 'all'
      ? 'No anti-patterns found. Check that `.claude/rules/anti-patterns.md` is reachable.'
      : `No anti-patterns found in category '${filterCategory}'. Valid categories: ${ANTI_PATTERN_CATEGORIES.join(', ')}, all.`
  }

  // Group by category preserving the file order.
  const byCategory = new Map<AntiPatternCategory, AntiPatternEntry[]>()
  for (const entry of entries) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, [])
    byCategory.get(entry.category)!.push(entry)
  }

  const parts: string[] = []
  const header =
    filterCategory === 'all'
      ? `# Pyreon Anti-Patterns (${entries.length} total, ${byCategory.size} categor${byCategory.size === 1 ? 'y' : 'ies'})`
      : `# Pyreon Anti-Patterns — ${filterCategory} (${entries.length})`
  parts.push(header)
  parts.push('')
  parts.push(
    'Each entry is a known mistake documented at `.claude/rules/anti-patterns.md`. Entries tagged `[detector: <code>]` are caught statically by the MCP `validate` tool — the rest require a human / AI review. Read them BEFORE writing new code, not during code review.',
  )
  parts.push('')

  for (const [, catEntries] of byCategory) {
    parts.push(`## ${catEntries[0]!.categoryHeading} (${catEntries.length})`)
    parts.push('')
    for (const entry of catEntries) {
      const tag =
        entry.detectorCodes.length > 0
          ? ` \`[detector: ${entry.detectorCodes.join(' / ')}]\``
          : ''
      parts.push(`- **${entry.name}**${tag}: ${entry.description}`)
    }
    parts.push('')
  }

  return parts.join('\n').trimEnd()
}

/**
 * Compact INDEX of anti-patterns — one short line per entry instead of
 * the full body. This is the default `get_anti_patterns()` response.
 *
 * Why: the full catalog is ~14K tokens. An agent calling
 * `get_anti_patterns()` to orient ("what should I avoid?") almost never
 * needs every full body at once — it needs the map, then the one or two
 * entries relevant to what it's writing. The index is ~1.5K tokens (a
 * ~90% cut on the common path); full bodies stay one explicit call away
 * (`{ category }`, `{ name }`, or `{ full: true }`).
 *
 * Structural markers are deliberately preserved: the `# Pyreon
 * Anti-Patterns — index (...)` header and per-category `## <Heading>`
 * sections mean an agent can still discover categories from the index
 * without a second call, and the detector tag stays inline (short +
 * high-signal: tells the agent the mistake is auto-caught by
 * `validate`). Only the prose body is elided, replaced by a truncated
 * one-sentence hook.
 */
const INDEX_HOOK_MAX = 100

/**
 * A hook is added only when the entry's TITLE is at most this many characters.
 *
 * The hook exists to disambiguate a title that does not stand on its own —
 * "Missing batch" needs "3+ signal updates without `batch()`"; it means nothing
 * without it. But this catalog's convention is that a title carries the whole
 * CLAIM ("A drain that visits queued recomputes in SUBSCRIPTION order while
 * relying on visit-time PULLS of un-dirtied deps …"), and for those the hook is
 * a truncated restatement of the body's opening that adds nothing to discovery
 * while costing as much as the title itself.
 *
 * So the hook follows the need rather than the format: terse titles keep it,
 * self-describing ones do not. Measured over the current 236 entries: 8,064
 * index tokens instead of 11,329 — hooks retained on 88, dropped on 148 — which
 * moves the index from 94% of the 12,000-token design boundary in
 * `token-budget.test.ts` to 67%, i.e. from ~14 entries of headroom to ~115.
 *
 * Chosen over the two alternatives for a reason. Shortening the clamp uniformly
 * (100 -> 45 chars) reaches a similar total but pays for it by truncating the
 * hooks that are actually load-bearing. Paginating — the other option the budget
 * test names — costs a second round trip on the discovery path, which is the one
 * path that should stay a single call.
 */
const INDEX_HOOK_TITLE_MAX = 70

function indexHook(description: string): string {
  // First non-empty line, first sentence-ish, bounded.
  const firstLine = description.split('\n').find((l) => l.trim().length > 0) ?? ''
  const trimmed = firstLine.trim()
  if (trimmed.length <= INDEX_HOOK_MAX) return trimmed
  // Cut on the last word boundary before the cap so we never split a word.
  const slice = trimmed.slice(0, INDEX_HOOK_MAX)
  const lastSpace = slice.lastIndexOf(' ')
  return `${slice.slice(0, lastSpace > 40 ? lastSpace : INDEX_HOOK_MAX).trimEnd()}…`
}

export function formatAntiPatternsIndex(entries: AntiPatternEntry[]): string {
  if (entries.length === 0) {
    return 'No anti-patterns found. Check that `.claude/rules/anti-patterns.md` is reachable.'
  }
  const byCategory = new Map<AntiPatternCategory, AntiPatternEntry[]>()
  for (const entry of entries) {
    if (!byCategory.has(entry.category)) byCategory.set(entry.category, [])
    byCategory.get(entry.category)!.push(entry)
  }
  const parts: string[] = [
    `# Pyreon Anti-Patterns — index (${entries.length} total, ${byCategory.size} categor${byCategory.size === 1 ? 'y' : 'ies'})`,
    '',
    'Compact index — one line per entry. For the full body of an entry call `get_anti_patterns({ name: "<title>" })`; for every entry in a category call `get_anti_patterns({ category: "<slug>" })`; for the entire catalog (~14K tokens) call `get_anti_patterns({ full: true })`. Entries tagged `[detector: <code>]` are caught statically by the `validate` tool.',
    '',
  ]
  for (const [, catEntries] of byCategory) {
    parts.push(`## ${catEntries[0]!.categoryHeading} (${catEntries.length})`)
    parts.push('')
    for (const entry of catEntries) {
      const tag =
        entry.detectorCodes.length > 0
          ? ` \`[detector: ${entry.detectorCodes.join(' / ')}]\``
          : ''
      const hook =
        entry.name.length <= INDEX_HOOK_TITLE_MAX ? ` — ${indexHook(entry.description)}` : ''
      parts.push(`- **${entry.name}**${tag}${hook}`)
    }
    parts.push('')
  }
  return parts.join('\n').trimEnd()
}
