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
  | 'testing'
  | 'lifecycle'
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

// Heading → slug. Keep in sync with the anti-patterns.md section list.
const CATEGORY_MAP: Record<string, AntiPatternCategory> = {
  'Reactivity Mistakes': 'reactivity',
  'JSX Mistakes': 'jsx',
  'Context & Provider Mistakes': 'context',
  'Architecture Mistakes': 'architecture',
  'Testing Mistakes': 'testing',
  'Lifecycle & Cleanup Mistakes': 'lifecycle',
  'Documentation Mistakes': 'documentation',
}

export const ANTI_PATTERN_CATEGORIES: readonly AntiPatternCategory[] = [
  'reactivity',
  'jsx',
  'context',
  'architecture',
  'testing',
  'lifecycle',
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
  const nameMatch = /^- \*\*([^*]+)\*\*/.exec(bullet)
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
      parts.push(`- **${entry.name}**${tag} — ${indexHook(entry.description)}`)
    }
    parts.push('')
  }
  return parts.join('\n').trimEnd()
}
