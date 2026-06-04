/**
 * `get_content_collection` + `get_content_entry` MCP tools.
 *
 * AI agents writing docs / blog content against a `@pyreon/zero-content`
 * app benefit from being able to query the catalogue directly:
 *
 *   - "what pages exist in the docs collection?" → get_content_collection
 *   - "show me the frontmatter + headings of /docs/getting-started" → get_content_entry
 *
 * Without these, agents read raw markdown files one at a time and miss
 * structural information (the collection's schema, every entry's slug,
 * the heading outline). Both tools surface ~that.
 *
 * Implementation reuses `parseContentConfig` + `findContentConfigs` +
 * `findMarkdownFiles` / `deriveSlug` from `@pyreon/compiler:content-audit`
 * — same syntactic, no-runtime-dep walker the doctor audit uses.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import {
  type CollectionDecl,
  deriveSlug,
  findContentConfigs,
  parseContentConfig,
  readFrontmatter,
  readTitleFromFrontmatter,
} from '@pyreon/compiler'

export interface ContentEntrySummary {
  /** Slug under the collection (`""` for index, `"getting-started"`, etc.) */
  slug: string
  /** Absolute path to the .md / .mdx file */
  path: string
  /** Path relative to the cwd root for readable reporting */
  relPath: string
  /** Title from frontmatter, or null if missing */
  title: string | null
}

export interface ContentEntryDetail extends ContentEntrySummary {
  /** Raw YAML frontmatter body (one YAML line per entry) */
  frontmatterRaw: string
  /** Parsed key→value frontmatter pairs (simple line-level parse) */
  frontmatter: Record<string, string>
  /** Heading outline: every `# H1` / `## H2` / etc. as level+text */
  headings: { level: number; text: string }[]
  /** Total source size in bytes (gives agents a sense of scope) */
  bytes: number
}

export interface CollectionSummary {
  name: string
  type: 'pages' | 'data' | 'unknown'
  contentDir: string
  configPath: string
  entries: ContentEntrySummary[]
}

/**
 * Enumerate every collection across every `content.config.{ts,...}`
 * the project carries. Returns one summary per collection.
 */
export function getContentCollections(cwd: string): CollectionSummary[] {
  const configs = findContentConfigs(cwd)
  const summaries: CollectionSummary[] = []
  for (const cfg of configs) {
    const decls = parseContentConfig(cfg)
    for (const decl of decls) {
      summaries.push(buildSummary(decl, cfg, cwd))
    }
  }
  return summaries
}

/**
 * Return the one collection by name (or null if not found).
 */
export function getContentCollection(
  cwd: string,
  name: string,
): CollectionSummary | null {
  const all = getContentCollections(cwd)
  return all.find((c) => c.name === name) ?? null
}

/**
 * Return a single entry by `collection` + `slug`. Loads + parses the
 * file's frontmatter and heading outline. Returns null if no matching
 * entry exists.
 */
export function getContentEntry(
  cwd: string,
  collectionName: string,
  slug: string,
): ContentEntryDetail | null {
  const collection = getContentCollection(cwd, collectionName)
  if (!collection) return null
  const entry = collection.entries.find((e) => e.slug === slug)
  if (!entry) return null
  let body: string
  try {
    body = readFileSync(entry.path, 'utf8')
  } catch {
    return null
  }
  const fm = readFrontmatter(body)
  const frontmatter: Record<string, string> = {}
  for (const line of fm.body.split('\n')) {
    const m = line.match(/^([A-Za-z_][\w.-]*):\s*(.*)$/)
    if (!m) continue
    const k = m[1]!
    let v = (m[2] ?? '').trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (v) frontmatter[k] = v
  }
  const markdownStart = fm.endLine
    ? body.split(/\r?\n/, fm.endLine).join('\n').length + 1
    : 0
  const markdownBody = body.slice(markdownStart)
  const headings = extractHeadings(markdownBody)
  return {
    ...entry,
    frontmatterRaw: fm.body,
    frontmatter,
    headings,
    bytes: Buffer.byteLength(body, 'utf8'),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internals
// ═══════════════════════════════════════════════════════════════════════════════

function buildSummary(
  decl: CollectionDecl,
  configPath: string,
  cwd: string,
): CollectionSummary {
  const mdFiles = findMarkdownFiles(decl.contentDir)
  const entries: ContentEntrySummary[] = mdFiles
    .map((md) => {
      const slug = deriveSlug(md, decl.contentDir)
      const relPath = relative(cwd, md)
      let title: string | null = null
      try {
        const fm = readFrontmatter(readFileSync(md, 'utf8'))
        title = readTitleFromFrontmatter(fm.body)
      } catch {
        // unreadable — keep title null
      }
      return { slug, path: md, relPath, title }
    })
    // Stable, predictable order for AI agents — slug ascending.
    .sort((a, b) => a.slug.localeCompare(b.slug))
  return {
    name: decl.name,
    type: decl.type,
    contentDir: decl.contentDir,
    configPath,
    entries,
  }
}

function findMarkdownFiles(contentDir: string): string[] {
  const out: string[] = []
  walk(contentDir, 0)
  return out

  function walk(dir: string, depth: number) {
    if (depth > 32) return
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.')) continue
      const full = join(dir, name)
      let isDir = false
      try {
        isDir = statSync(full).isDirectory()
      } catch {
        continue
      }
      if (isDir) {
        walk(full, depth + 1)
        continue
      }
      if (name.endsWith('.md') || name.endsWith('.mdx')) out.push(full)
    }
  }
}

function extractHeadings(markdown: string): { level: number; text: string }[] {
  const out: { level: number; text: string }[] = []
  const lines = markdown.split(/\r?\n/)
  let inFence = false
  for (const line of lines) {
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*$/)
    if (m) {
      out.push({ level: m[1]!.length, text: m[2]!.trim() })
    }
  }
  return out
}
