/**
 * Pattern registry for the `get_pattern` MCP tool (T2.5.3).
 *
 * Each pattern answers a "how do I do X the right way" question with a
 * code example and rationale. The content is the body of the
 * corresponding `docs/patterns/<name>.md` file, discovered at runtime
 * by walking up from `process.cwd()` to the nearest repo that contains
 * `docs/patterns/`.
 *
 * Why a filesystem lookup instead of bundled content: the patterns
 * belong in the VitePress site (they're first-class docs), and having
 * the MCP fetch them live means the AI sees the same text the human
 * would. Bundling copies would drift.
 *
 * Fallback: if no `docs/patterns/` exists in the walk (e.g. the MCP is
 * running in a consumer repo), the tool reports the miss and lists
 * what patterns WOULD be available if running against the Pyreon
 * monorepo. The list itself is seeded from the directory walk, so
 * adding a new pattern file makes it discoverable without code changes.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface PatternFile {
  /** Slug (filename without extension) — the value consumers pass to get_pattern */
  name: string
  /** Absolute path to the source markdown file */
  path: string
  /** Raw markdown body */
  body: string
  /** Title from the frontmatter or first `# ` heading */
  title: string
  /** Optional one-line summary from the frontmatter */
  summary: string | null
  /** Cross-reference slugs from the frontmatter */
  seeAlso: string[]
}

export interface PatternRegistry {
  /** Root dir (the `docs/patterns/` directory that was found) */
  root: string | null
  /** All patterns, sorted by slug */
  patterns: PatternFile[]
}

// ═══════════════════════════════════════════════════════════════════════════════
// Directory walk
// ═══════════════════════════════════════════════════════════════════════════════

// Patterns live at `docs/docs/patterns/` — the VitePress content dir
// so the same file serves both the MCP tool AND the docs website. We
// also check the top-level `docs/patterns/` layout for forward
// compatibility, in case a future migration moves them up.
const PATTERN_PATH_CANDIDATES: ReadonlyArray<ReadonlyArray<string>> = [
  ['docs', 'docs', 'patterns'],
  ['docs', 'patterns'],
]

function findPatternsDir(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 30; i++) {
    for (const segments of PATTERN_PATH_CANDIDATES) {
      const candidate = join(dir, ...segments)
      if (existsSync(candidate) && statSync(candidate).isDirectory()) {
        return candidate
      }
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Frontmatter parser (YAML-ish — no external dep)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Minimal frontmatter parser. Supports:
 *   title: string (unquoted or quoted)
 *   summary: string
 *   seeAlso: [one, two, three]  OR  seeAlso:\n  - one\n  - two
 *
 * Anything else is ignored. Full YAML would be overkill here.
 */
function parseFrontmatter(source: string): {
  meta: { title?: string; summary?: string; seeAlso?: string[] }
  body: string
} {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source)
  if (!match) return { meta: {}, body: source }
  const rawMeta = match[1]!
  const body = match[2]!.trim()

  const meta: { title?: string; summary?: string; seeAlso?: string[] } = {}

  const lines = rawMeta.split('\n')
  let seeAlsoActive = false
  const seeAlsoItems: string[] = []

  for (const line of lines) {
    if (seeAlsoActive) {
      const bullet = /^\s*-\s*(.+?)\s*$/.exec(line)
      if (bullet) {
        seeAlsoItems.push(bullet[1]!)
        continue
      }
      seeAlsoActive = false
    }

    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line)
    if (!kv) continue
    const key = kv[1]!
    const value = kv[2]!.trim()

    if (key === 'title') {
      meta.title = value.replace(/^["']|["']$/g, '')
    } else if (key === 'summary') {
      meta.summary = value.replace(/^["']|["']$/g, '')
    } else if (key === 'seeAlso') {
      if (value.startsWith('[') && value.endsWith(']')) {
        meta.seeAlso = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)
      } else if (value === '') {
        seeAlsoActive = true
      }
    }
  }

  if (seeAlsoActive && seeAlsoItems.length > 0) {
    meta.seeAlso = seeAlsoItems
  }

  return { meta, body }
}

function extractFirstHeading(body: string): string | null {
  for (const line of body.split('\n')) {
    const h = /^#\s+(.+)$/.exec(line)
    if (h) return h[1]!
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

export function loadPatternRegistry(startDir: string = process.cwd()): PatternRegistry {
  const root = findPatternsDir(startDir)
  if (!root) return { root: null, patterns: [] }

  const patterns: PatternFile[] = []
  const entries = readdirSync(root).sort()
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    if (entry.startsWith('.') || entry === 'README.md' || entry === 'index.md') continue
    const filePath = join(root, entry)
    let source: string
    try {
      source = readFileSync(filePath, 'utf8')
    } catch {
      continue
    }
    const { meta, body } = parseFrontmatter(source)
    const name = entry.replace(/\.md$/, '')
    const title = meta.title ?? extractFirstHeading(body) ?? name
    patterns.push({
      name,
      path: filePath,
      body: source,
      title,
      summary: meta.summary ?? null,
      seeAlso: meta.seeAlso ?? [],
    })
  }

  return { root, patterns }
}

/**
 * Format the registry as a short index listing for the "no arg" case.
 * Each entry: `  - slug — title (summary)`.
 */
export function formatPatternIndex(registry: PatternRegistry): string {
  if (!registry.root || registry.patterns.length === 0) {
    return (
      'No patterns found. Patterns live at `docs/docs/patterns/<name>.md` ' +
      '(the VitePress content directory) in the Pyreon monorepo. If you ' +
      'are running the MCP in a consumer project, patterns are not ' +
      'available locally — run the MCP in the Pyreon repo to browse them.'
    )
  }

  const parts: string[] = [`# Pyreon Patterns (${registry.patterns.length})`, '']
  parts.push(
    'Call `get_pattern({ name: "<slug>" })` for the full body. Each pattern shows the canonical "do it this way" with code + rationale, plus the anti-pattern to avoid.',
  )
  parts.push('')
  for (const p of registry.patterns) {
    const summary = p.summary ? ` — ${p.summary}` : ''
    parts.push(`- **${p.name}** — ${p.title}${summary}`)
  }
  return parts.join('\n')
}

/**
 * Format a single pattern's full body for the MCP response. Prepends
 * a breadcrumb and appends a cross-reference footer if `seeAlso` was
 * populated.
 */
export function formatPatternBody(pattern: PatternFile): string {
  const parts: string[] = [pattern.body.trimEnd()]
  if (pattern.seeAlso.length > 0) {
    parts.push('')
    parts.push(
      `---\n\n**See also:** ${pattern.seeAlso.map((s) => `\`get_pattern({ name: "${s}" })\``).join(', ')}`,
    )
  }
  return parts.join('\n')
}

export function findPattern(registry: PatternRegistry, name: string): PatternFile | null {
  for (const p of registry.patterns) {
    if (p.name === name) return p
  }
  return null
}

export function suggestPatterns(registry: PatternRegistry, name: string): string[] {
  const needle = name.toLowerCase()
  const matches: string[] = []
  for (const p of registry.patterns) {
    if (p.name.toLowerCase().includes(needle) || p.title.toLowerCase().includes(needle)) {
      matches.push(p.name)
    }
  }
  return matches.slice(0, 5)
}
