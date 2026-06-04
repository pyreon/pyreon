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
  // String-based parse — the equivalent
  // `^([A-Za-z_][\w.-]*):\s*(.*)$` regex was flagged by CodeQL as
  // polynomial on runs of whitespace. Linear ops eliminate the
  // backtrack risk while preserving the same surface contract.
  for (const line of fm.body.split('\n')) {
    const colon = line.indexOf(':')
    if (colon <= 0) continue
    const k = line.slice(0, colon)
    if (!isYamlKey(k)) continue
    let v = line.slice(colon + 1).trim()
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
    // String-based parse — the equivalent `^(#{1,6})\s+(.+?)\s*#*$`
    // regex was flagged by CodeQL as polynomial on runs of whitespace
    // / trailing `#`. Linear ops eliminate the backtrack risk.
    if (!line.startsWith('#')) continue
    let i = 0
    while (i < line.length && i < 6 && line[i] === '#') i++
    if (i === 0 || i === line.length) continue
    if (line[i] !== ' ' && line[i] !== '\t') continue
    let text = line.slice(i + 1).trim()
    // Strip trailing closing `#` markers (ATX-closed headings).
    let end = text.length
    while (end > 0 && text[end - 1] === '#') end--
    text = text.slice(0, end).trimEnd()
    if (!text) continue
    out.push({ level: i, text })
  }
  return out
}

/**
 * Recognise a frontmatter key (YAML identifier): leading
 * `[A-Za-z_]`, then any of `[\w.-]`. Linear-time scan.
 */
function isYamlKey(s: string): boolean {
  if (s.length === 0) return false
  const c0 = s.charCodeAt(0)
  const isAlpha = (c: number) =>
    (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 // [A-Za-z_]
  const isWord = (c: number) =>
    isAlpha(c) || (c >= 48 && c <= 57) || c === 46 || c === 45 // + 0-9 . -
  if (!isAlpha(c0)) return false
  for (let i = 1; i < s.length; i++) {
    if (!isWord(s.charCodeAt(i))) return false
  }
  return true
}
