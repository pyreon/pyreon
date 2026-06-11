/**
 * Project-wide content audit — scans `content.config.{ts,mts,js,mjs}`
 * declarations + walks each collection's content path looking for
 * footguns that the runtime can't surface as a build error. Three
 * detector codes ship today:
 *
 *  - **`missing-frontmatter-title`**: a `.md` file under a collection
 *    has no `title:` in its YAML frontmatter (every schema in the
 *    wild requires it for sidebar / SEO / route naming). The
 *    content() plugin's schema validator catches this at build time
 *    — the audit catches it at edit time so authors don't ship a
 *    silently broken page.
 *
 *  - **`broken-internal-link`**: a markdown `[text](/path)` link
 *    where `/path` matches the collection's URL pattern but no entry
 *    with that slug exists. Users hit 404 at runtime; the audit
 *    catches it at edit time so the link can be fixed alongside the
 *    referenced page's rename / removal.
 *
 *  - **`orphaned-md-file`**: a `.md` file living under `src/content/`
 *    (or any common content root) that isn't under ANY declared
 *    collection's path. The runtime ignores it silently; the user
 *    thinks the page is published but the build skips it.
 *
 * Real-app coverage:
 *   - Per-code synthetic-fixture tests in `tests/content-audit.test.ts`
 *     (one fixture per finding type, bisect-verified by reverting the
 *     detector's match condition)
 *   - Doctor wiring at `packages/tools/cli/src/doctor/gates/content-audit.ts`,
 *     CLI flag `pyreon doctor --check-content [--json]`
 *
 * Same syntactic-only style as `island-audit.ts` / `ssg-audit.ts` —
 * no type-check pass, no module resolution. False negatives
 * acceptable; false positives must be rare. Every finding ships with
 * file path + line/column + actionable fix suggestion.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import ts from 'typescript'

export type ContentFindingCode =
  | 'missing-frontmatter-title'
  | 'broken-internal-link'
  | 'orphaned-md-file'

export interface ContentLocation {
  /** Absolute path */
  path: string
  /** Path relative to the repo root for readable reporting */
  relPath: string
  /** 1-based line number */
  line: number
  /** 1-based column number */
  column: number
}

export interface ContentFinding {
  code: ContentFindingCode
  /** One-paragraph human-readable explanation, including the fix path. */
  message: string
  /** Where the finding surfaces. */
  location: ContentLocation
  /**
   * Companion locations for cross-file findings (e.g. broken link
   * pointer back to the config). Used by `broken-internal-link` to
   * surface the collection that defined the URL pattern.
   */
  related?: ContentLocation[] | undefined
}

export interface CollectionDecl {
  /** The collection name (key in `defineConfig({ collections: {...} })`). */
  name: string
  /** `'pages'` (routable) or `'data'` (query-only). */
  type: 'pages' | 'data' | 'unknown'
  /** Absolute path to the collection's content directory. */
  contentDir: string
  /** Where the collection was declared (the config file + line). */
  declaredAt: ContentLocation
}

export interface ContentAuditResult {
  root: string | null
  findings: ContentFinding[]
  summary: {
    configFilesScanned: number
    collectionsScanned: number
    mdFilesScanned: number
    findingsByCode: Record<ContentFindingCode, number>
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════════════════════

function findMonorepoRoot(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 30; i++) {
    try {
      if (statSync(join(dir, 'packages')).isDirectory()) return dir
    } catch {
      // fall through
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

const CONFIG_FILENAMES = new Set([
  'content.config.ts',
  'content.config.mts',
  'content.config.js',
  'content.config.mjs',
])

const SKIP_DIRS = new Set([
  'node_modules',
  'lib',
  'dist',
  '__tests__',
  'tests',
  '.git',
  '.next',
  '.pyreon',
  '.vitepress',
])

/**
 * Walk the project tree looking for `content.config.{ts,mts,js,mjs}`
 * files. Skips dependency / build / vcs directories.
 */
export function findContentConfigs(startDir: string, max = 32): string[] {
  const out: string[] = []
  walk(startDir, 0)
  return out

  function walk(dir: string, depth: number) {
    if (depth > max) return
    if (out.length >= 64) return // sanity cap for huge monorepos
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const name of entries) {
      if (name.startsWith('.') && name !== '.pyreon') {
        // skip dotfiles except .pyreon (gitignored generated dir)
        continue
      }
      if (SKIP_DIRS.has(name)) continue
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
      if (CONFIG_FILENAMES.has(name)) out.push(full)
    }
  }
}

/**
 * Walk a content directory collecting `.md` (+ `.mdx`) file paths.
 */
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

// ═══════════════════════════════════════════════════════════════════════════════
// Config parsing (TypeScript compiler API)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a `content.config.{ts,mts,js,mjs}` file and return every
 * collection it declares. Strictly syntactic — we don't resolve
 * imports or run the file; the rule is "look for object literals
 * inside `defineCollection(...)` calls and read their `path` / `type`
 * properties from string-literal values."
 */
export function parseContentConfig(filePath: string): CollectionDecl[] {
  let source: string
  try {
    source = readFileSync(filePath, 'utf8')
  } catch {
    return []
  }
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  )
  const configDir = dirname(filePath)
  const collections: CollectionDecl[] = []

  // First pass — find `defineConfig({ collections: { ... } })` to
  // discover the canonical (name → object literal) map. Then for each
  // entry, the value is either an inline `{ ... }` OR a
  // `defineCollection({ ... })` call.
  ts.forEachChild(sf, visit)
  return collections

  function visit(node: ts.Node) {
    // export default defineConfig({ collections: {...} })
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'defineConfig' &&
      node.arguments[0] &&
      ts.isObjectLiteralExpression(node.arguments[0])
    ) {
      readConfigBody(node.arguments[0])
    }
    ts.forEachChild(node, visit)
  }

  function readConfigBody(obj: ts.ObjectLiteralExpression) {
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = readPropName(prop.name)
      if (key !== 'collections') continue
      if (!ts.isObjectLiteralExpression(prop.initializer)) continue
      for (const sub of prop.initializer.properties) {
        if (!ts.isPropertyAssignment(sub)) continue
        const collectionName = readPropName(sub.name)
        if (!collectionName) continue
        const decl = readCollectionInitializer(sub.initializer, collectionName)
        if (decl) collections.push(decl)
      }
    }
  }

  function readCollectionInitializer(
    init: ts.Expression,
    collectionName: string,
  ): CollectionDecl | null {
    // defineCollection({ ... })
    if (
      ts.isCallExpression(init) &&
      ts.isIdentifier(init.expression) &&
      init.expression.text === 'defineCollection' &&
      init.arguments[0] &&
      ts.isObjectLiteralExpression(init.arguments[0])
    ) {
      return readCollectionBody(init.arguments[0], collectionName)
    }
    // Bare object literal (less common but still valid)
    if (ts.isObjectLiteralExpression(init)) {
      return readCollectionBody(init, collectionName)
    }
    return null
  }

  function readCollectionBody(
    obj: ts.ObjectLiteralExpression,
    collectionName: string,
  ): CollectionDecl | null {
    let pathValue: string | undefined
    let typeValue: 'pages' | 'data' | undefined
    for (const prop of obj.properties) {
      if (!ts.isPropertyAssignment(prop)) continue
      const key = readPropName(prop.name)
      if (key === 'path' && ts.isStringLiteral(prop.initializer)) {
        pathValue = prop.initializer.text
      } else if (key === 'type' && ts.isStringLiteral(prop.initializer)) {
        const t = prop.initializer.text
        if (t === 'pages' || t === 'data') typeValue = t
      }
    }
    const resolvedPath = pathValue
      ? resolve(configDir, pathValue)
      : resolve(configDir, 'src', 'content', collectionName)
    const lc = sf.getLineAndCharacterOfPosition(obj.getStart(sf))
    return {
      name: collectionName,
      type: typeValue ?? 'unknown',
      contentDir: resolvedPath,
      declaredAt: locFrom(filePath, lc.line, lc.character),
    }
  }
}

function readPropName(name: ts.PropertyName): string | null {
  if (ts.isIdentifier(name)) return name.text
  if (ts.isStringLiteral(name)) return name.text
  if (ts.isNoSubstitutionTemplateLiteral(name)) return name.text
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// Frontmatter helpers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pull the YAML frontmatter block out of a markdown source. Returns
 * the raw inner body + the offset of the closing `---` so callers can
 * report line numbers correctly.
 *
 * Strict shape: leading `---\n` + lines until a closing `---\n`. No
 * frontmatter → empty body, offsetLine = 0.
 */
export function readFrontmatter(source: string): {
  body: string
  startLine: number
  endLine: number
} {
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) {
    return { body: '', startLine: 0, endLine: 0 }
  }
  const lines = source.split(/\r?\n/)
  // line[0] is the opening '---'
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      return {
        body: lines.slice(1, i).join('\n'),
        startLine: 1,
        endLine: i + 1,
      }
    }
  }
  return { body: '', startLine: 0, endLine: 0 }
}

/**
 * Pull the bare `title:` value from a YAML frontmatter body. Returns
 * null if missing. Handles quoted + unquoted values.
 *
 * String-based parse — the equivalent `^title:\s*(.+)$` regex was
 * flagged by CodeQL as polynomial-time on adversarial inputs (long
 * runs of whitespace after `title:`). Linear ops eliminate the
 * backtrack risk while preserving the same surface contract.
 */
export function readTitleFromFrontmatter(body: string): string | null {
  for (const line of body.split('\n')) {
    if (!line.startsWith('title:')) continue
    let v = line.slice('title:'.length).trim()
    if (!v) return null
    // Strip surrounding quotes if any.
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    return v
  }
  return null
}

/**
 * Convert a `.md` file path to its slug under the collection's content
 * dir. Mirrors the runtime's `deriveSlug` from `@pyreon/zero-content`:
 * strip the extension, strip a trailing `/index`.
 */
export function deriveSlug(absoluteMdPath: string, contentDir: string): string {
  let rel = relative(contentDir, absoluteMdPath)
  if (sep !== '/') rel = rel.split(sep).join('/')
  // Strip the extension.
  const lastDot = rel.lastIndexOf('.')
  if (lastDot > 0) rel = rel.slice(0, lastDot)
  // Strip a trailing /index segment.
  if (rel.endsWith('/index')) rel = rel.slice(0, -'/index'.length)
  if (rel === 'index') rel = ''
  return rel
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal-link extraction
// ═══════════════════════════════════════════════════════════════════════════════

interface InlineLink {
  url: string
  line: number
  column: number
}

/**
 * Walk markdown body looking for `[text](url)` inline links. Naïve
 * regex parse — only inspects links whose URL starts with `/` (so we
 * leave external + anchor + relative refs alone).
 *
 * Skips fenced code blocks (``` ... ```). Returns 1-based positions.
 */
export function extractInternalLinks(markdown: string): InlineLink[] {
  const links: InlineLink[] = []
  const lines = markdown.split(/\r?\n/)
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    // Skip inline code spans by masking them out first.
    const stripped = line.replace(/`[^`]*`/g, (m) => ' '.repeat(m.length))
    const re = /\[([^\]]+)\]\(([^)\s]+)\)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(stripped))) {
      const url = m[2] ?? ''
      if (!url.startsWith('/')) continue
      // Drop trailing fragment / query.
      const cleanUrl = url.split('#')[0]!.split('?')[0]!
      if (!cleanUrl) continue
      links.push({
        url: cleanUrl,
        line: i + 1,
        column: (m.index ?? 0) + 1,
      })
    }
  }
  return links
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

export interface AuditContentOptions {
  /**
   * Root from which to start searching for `content.config.*` files.
   * Defaults to the monorepo root inferred from `cwd`.
   */
  startDir?: string
  /**
   * The URL prefix each `pages` collection mounts under at runtime.
   * Used to validate internal links. Defaults to the collection's name
   * (matches the convention `/docs/...` for a `docs` collection).
   */
  urlPrefixFor?: (name: string) => string
}

/**
 * Run the content audit. Walks the project for `content.config.*`,
 * parses each, then walks each declared collection's content
 * directory looking for missing-title / broken-link / orphaned-md
 * findings.
 *
 * @param cwd - the directory from which the audit starts. The repo
 *   root is inferred by walking up until a `packages/` directory is
 *   found.
 */
export function auditContent(
  cwd: string,
  options: AuditContentOptions = {},
): ContentAuditResult {
  const startDir = options.startDir ?? cwd
  const root = findMonorepoRoot(startDir) ?? startDir
  const configs = findContentConfigs(root)
  const findings: ContentFinding[] = []
  const summary = {
    configFilesScanned: configs.length,
    collectionsScanned: 0,
    mdFilesScanned: 0,
    findingsByCode: {
      'missing-frontmatter-title': 0,
      'broken-internal-link': 0,
      'orphaned-md-file': 0,
    } as Record<ContentFindingCode, number>,
  }

  // Track every .md path we've claimed under a collection so we can
  // detect orphans (Pass 3, global across configs).
  const claimedMdPaths = new Set<string>()

  // Resolve links PER-CONFIG. Two separate zero-content apps in one
  // monorepo (e.g. the main `docs/` site and an `examples/*` mini-app)
  // can BOTH declare a `docs` collection mounting `/docs`. Keying slug
  // sets GLOBALLY by collection name/prefix let the second config
  // OVERWRITE the first's slug set, so every valid link in the larger
  // app was flagged broken. Each config's pages validate against ITS
  // OWN collections; a link to another app's prefix is `no-match`
  // (left alone — cross-app links can't be resolved here).
  for (const cfg of configs) {
    const decls = parseContentConfig(cfg)

    // Build this config's maps (prefix → collection, name → slug set).
    const prefixToCollection = new Map<string, CollectionDecl>()
    const knownSlugs = new Map<string, Set<string>>()
    for (const decl of decls) {
      summary.collectionsScanned++
      const prefix = (options.urlPrefixFor ?? defaultUrlPrefix)(decl.name)
      prefixToCollection.set(prefix, decl)
      const slugs = knownSlugs.get(decl.name) ?? new Set<string>()
      for (const md of findMarkdownFiles(decl.contentDir)) {
        summary.mdFilesScanned++
        claimedMdPaths.add(md)
        slugs.add(deriveSlug(md, decl.contentDir))
      }
      knownSlugs.set(decl.name, slugs)
    }

    // Validate this config's files against this config's maps.
    for (const decl of decls) {
      for (const md of findMarkdownFiles(decl.contentDir)) {
        let body: string
        try {
          body = readFileSync(md, 'utf8')
        } catch {
          continue
        }
        const relPath = relative(root, md)
        // ── Missing title ────────────────────────────────────────
        if (decl.type === 'pages' || decl.type === 'unknown') {
          const fm = readFrontmatter(body)
          if (!fm.body || readTitleFromFrontmatter(fm.body) === null) {
            findings.push({
              code: 'missing-frontmatter-title',
              message: `Page \`${relPath}\` is missing a \`title:\` field in its frontmatter. The \`${decl.name}\` collection's schema requires it (every documented collection schema does). Add \`title: ...\` to the YAML block at the top of the file.`,
              location: locFrom(md, fm.startLine || 0, 0, relPath),
              related: [decl.declaredAt],
            })
            summary.findingsByCode['missing-frontmatter-title']++
          }
        }
        // ── Broken internal links ────────────────────────────────
        const fm2 = readFrontmatter(body)
        const markdownBody = body.slice(
          fm2.endLine > 0
            ? body.split(/\r?\n/, fm2.endLine).join('\n').length + 1
            : 0,
        )
        const links = extractInternalLinks(markdownBody)
        const linkLineOffset = fm2.endLine
        for (const link of links) {
          const result = resolveInternalLink(
            link.url,
            prefixToCollection,
            knownSlugs,
          )
          if (result === 'no-match') continue // external / unknown prefix — leave alone
          if (result === 'broken') {
            findings.push({
              code: 'broken-internal-link',
              message: `Internal link \`${link.url}\` in \`${relPath}\` does not match any entry in any declared collection. Rename the link to the correct slug, or remove it if the target page was intentionally removed.`,
              location: locFrom(
                md,
                link.line + linkLineOffset,
                link.column,
                relPath,
              ),
              related: [decl.declaredAt],
            })
            summary.findingsByCode['broken-internal-link']++
          }
        }
      }
    }
  }

  // Pass 3 — orphaned `.md` files. Walk common content roots and
  // surface any markdown file that wasn't claimed by a collection.
  for (const cfg of configs) {
    const cfgRoot = dirname(cfg)
    const contentRoots = [
      join(cfgRoot, 'src', 'content'),
      join(cfgRoot, 'content'),
    ]
    for (const cr of contentRoots) {
      const exists = (() => {
        try {
          return statSync(cr).isDirectory()
        } catch {
          return false
        }
      })()
      if (!exists) continue
      for (const md of findMarkdownFiles(cr)) {
        if (claimedMdPaths.has(md)) continue
        const relPath = relative(root, md)
        findings.push({
          code: 'orphaned-md-file',
          message: `Markdown file \`${relPath}\` lives under \`src/content/\` but is not under any declared collection's \`path\`. The runtime ignores it. Either add it to a collection's directory, declare a new collection that includes its path, or move/remove the file.`,
          location: locFrom(md, 1, 1, relPath),
        })
        summary.findingsByCode['orphaned-md-file']++
      }
    }
  }

  return { root, findings, summary }
}

function defaultUrlPrefix(collectionName: string): string {
  return `/${collectionName}`
}

function resolveInternalLink(
  url: string,
  urlPrefixToCollection: Map<string, CollectionDecl>,
  allKnownSlugs: Map<string, Set<string>>,
): 'ok' | 'broken' | 'no-match' {
  // Try every declared prefix (longest first so /docs/foo/bar doesn't
  // match a `/docs` prefix when `/docs/foo` is also declared).
  const prefixes = [...urlPrefixToCollection.keys()].sort(
    (a, b) => b.length - a.length,
  )
  for (const prefix of prefixes) {
    if (url === prefix || url.startsWith(prefix + '/')) {
      const decl = urlPrefixToCollection.get(prefix)!
      const slug = url === prefix ? '' : url.slice(prefix.length + 1)
      const slugs = allKnownSlugs.get(decl.name)
      if (!slugs) return 'broken'
      return slugs.has(slug) ? 'ok' : 'broken'
    }
  }
  return 'no-match'
}

function locFrom(
  path: string,
  line: number,
  column: number,
  relPath?: string,
): ContentLocation {
  return {
    path,
    relPath: relPath ?? path,
    line: Math.max(1, line),
    column: Math.max(1, column),
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Formatter
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pretty-printed audit output for the CLI text renderer. Returns one
 * `Finding N — code` line + the finding's full message + the
 * `path:line:column` pointer per finding.
 */
export function formatContentFindings(
  result: ContentAuditResult,
  options: { color?: boolean } = {},
): string {
  if (result.findings.length === 0) {
    return `No content audit findings (${result.summary.collectionsScanned} collection(s), ${result.summary.mdFilesScanned} markdown file(s) scanned).`
  }
  const c = options.color === false ? null : ansiPalette
  const lines: string[] = []
  lines.push(
    `${result.findings.length} content audit finding(s) — ${[
      `${result.summary.findingsByCode['missing-frontmatter-title']} missing-title`,
      `${result.summary.findingsByCode['broken-internal-link']} broken-link`,
      `${result.summary.findingsByCode['orphaned-md-file']} orphaned`,
    ].join(' / ')}`,
  )
  result.findings.forEach((f, i) => {
    lines.push('')
    lines.push(
      `${c ? c.bold(`Finding ${i + 1}`) : `Finding ${i + 1}`} — ${
        c ? c.red(f.code) : f.code
      }`,
    )
    lines.push(`  ${f.message}`)
    lines.push(
      `  at ${c ? c.cyan(`${f.location.relPath}:${f.location.line}:${f.location.column}`) : `${f.location.relPath}:${f.location.line}:${f.location.column}`}`,
    )
    if (f.related && f.related.length > 0) {
      for (const r of f.related) {
        lines.push(
          `    declared at ${c ? c.dim(`${r.relPath}:${r.line}:${r.column}`) : `${r.relPath}:${r.line}:${r.column}`}`,
        )
      }
    }
  })
  return lines.join('\n')
}

const ansiPalette = {
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
}
