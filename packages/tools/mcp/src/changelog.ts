/**
 * Changelog parser + registry for the `get_changelog` MCP tool (T2.5.8).
 *
 * AI agents often ask "what changed in @pyreon/X recently?" before
 * writing code against the package — a stale mental model is a
 * frequent bug source. `get_changelog` surfaces recent release notes
 * without the agent having to scrape `git log` or read raw markdown.
 *
 * The parser reads `CHANGELOG.md` files populated by changesets. Each
 * changeset-managed package has a predictable shape:
 *
 *   # @pyreon/<name>
 *
 *   ## <version>
 *
 *   ### Minor Changes | Patch Changes | Major Changes
 *
 *   - [#PR] [`sha`] Thanks [@author]! - <body>
 *
 *     <continuation>
 *
 *   - Updated dependencies [[`sha`]]:
 *     - @pyreon/core@0.13.0
 *
 * The parser extracts each `## <version>` section, collecting the
 * user-facing body plus the dependency bumps separately. Consumers
 * typically want the N most recent non-empty versions (the tool's
 * default is 5).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export interface ChangelogEntry {
  /** Version string as it appears in the heading (`0.13.0`, `1.0.0-alpha.3`, etc.) */
  version: string
  /** Extracted bullets from `### Minor/Patch/Major Changes` sections. Each bullet is a single paragraph. */
  changes: string[]
  /** Extracted `- Updated dependencies [...]` bullets — usually noise for AI consumers, kept separately so the tool can hide them */
  dependencyUpdates: string[]
  /** True if `changes` is empty AND `dependencyUpdates` is empty — these are purely ceremonial version bumps */
  empty: boolean
}

export interface PackageChangelog {
  /** Package name, e.g. `@pyreon/query` */
  packageName: string
  /** Path to the CHANGELOG.md file */
  path: string
  /** Package directory (the dir containing the CHANGELOG) */
  dir: string
  /** All entries, newest first (as the file ordering implies) */
  entries: ChangelogEntry[]
}

export interface ChangelogRegistry {
  /** The repo root discovered via directory walk, or null if none found */
  root: string | null
  /** All package changelogs, keyed by package name */
  byName: Map<string, PackageChangelog>
}

// ═══════════════════════════════════════════════════════════════════════════════
// Discovery
// ═══════════════════════════════════════════════════════════════════════════════

function findMonorepoRoot(startDir: string): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 30; i++) {
    if (existsSync(join(dir, 'packages')) && statSync(join(dir, 'packages')).isDirectory()) {
      return dir
    }
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

function walkPackages(
  dir: string,
  out: Array<{ name: string; dir: string; changelogPath: string }>,
  depth = 0,
): void {
  if (depth > 4) return
  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(dir, name)
    let isDir = false
    try {
      isDir = statSync(full).isDirectory()
    } catch {
      continue
    }
    if (!isDir) continue

    const pkgJsonPath = join(full, 'package.json')
    const changelogPath = join(full, 'CHANGELOG.md')
    if (existsSync(pkgJsonPath) && existsSync(changelogPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as { name?: unknown }
        if (typeof pkg.name === 'string') {
          out.push({ name: pkg.name, dir: full, changelogPath })
        }
      } catch {
        // ignore malformed package.json
      }
      continue // don't recurse into a package directory
    }
    if (existsSync(pkgJsonPath)) continue // package with no changelog — skip & don't recurse
    walkPackages(full, out, depth + 1)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Parser
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a CHANGELOG.md body into version entries. The parser assumes
 * the changesets format but tolerates:
 *  - empty `## <version>` sections with no body (ceremonial bumps)
 *  - mixed `### Patch Changes` / `### Minor Changes` / `### Major Changes` under one version
 *  - bullets with multi-line continuations (indented with 2+ spaces)
 *  - `- Updated dependencies …` bullets, split off separately
 */
export function parseChangelog(body: string): ChangelogEntry[] {
  const lines = body.split('\n')
  const entries: ChangelogEntry[] = []
  let currentVersion: string | null = null
  let currentBullets: string[] = []
  let currentDepUpdates: string[] = []
  let currentBuf: string[] = []
  let bufKind: 'change' | 'dep' | null = null

  const flushBullet = (): void => {
    if (currentBuf.length > 0 && bufKind !== null) {
      const text = currentBuf.join('\n').trim()
      if (text.length > 0) {
        if (bufKind === 'dep') currentDepUpdates.push(text)
        else currentBullets.push(text)
      }
    }
    currentBuf = []
    bufKind = null
  }

  const flushVersion = (): void => {
    flushBullet()
    if (currentVersion !== null) {
      entries.push({
        version: currentVersion,
        changes: currentBullets,
        dependencyUpdates: currentDepUpdates,
        empty: currentBullets.length === 0 && currentDepUpdates.length === 0,
      })
    }
    currentVersion = null
    currentBullets = []
    currentDepUpdates = []
  }

  for (const line of lines) {
    const versionMatch = /^## (.+)$/.exec(line)
    if (versionMatch) {
      flushVersion()
      currentVersion = versionMatch[1]!.trim()
      continue
    }

    if (currentVersion === null) continue // top-of-file prose — ignore

    // `### Patch Changes` / `### Minor Changes` / `### Major Changes` — ignore
    // the heading itself but keep reading bullets under it.
    if (/^### /.test(line)) {
      flushBullet()
      continue
    }

    // Start of a new top-level bullet.
    if (/^- /.test(line)) {
      flushBullet()
      currentBuf = [line.replace(/^- /, '')]
      bufKind = /^- Updated dependencies/.test(line) ? 'dep' : 'change'
      continue
    }

    // Continuation lines — indented bullets or prose.
    if (bufKind !== null && line.length > 0 && /^\s/.test(line)) {
      currentBuf.push(line.replace(/^ {2,4}/, ''))
      continue
    }

    // Blank line inside a bullet — keep it as a paragraph break.
    if (bufKind !== null && line === '') {
      currentBuf.push('')
      continue
    }

    // Anything else closes the current bullet.
    flushBullet()
  }
  flushVersion()
  return entries
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API
// ═══════════════════════════════════════════════════════════════════════════════

export function loadChangelogRegistry(startDir: string = process.cwd()): ChangelogRegistry {
  const root = findMonorepoRoot(startDir)
  if (!root) return { root: null, byName: new Map() }

  const found: Array<{ name: string; dir: string; changelogPath: string }> = []
  walkPackages(join(root, 'packages'), found)

  const byName = new Map<string, PackageChangelog>()
  for (const { name, dir, changelogPath } of found) {
    let source: string
    try {
      source = readFileSync(changelogPath, 'utf8')
    } catch {
      continue
    }
    byName.set(name, {
      packageName: name,
      path: changelogPath,
      dir,
      entries: parseChangelog(source),
    })
  }
  return { root, byName }
}

export function findChangelog(
  registry: ChangelogRegistry,
  packageName: string,
): PackageChangelog | null {
  // Accept both `@pyreon/foo` and `foo` forms so the MCP tool can be
  // called with either a fully-qualified name or the short slug.
  if (registry.byName.has(packageName)) {
    return registry.byName.get(packageName)!
  }
  if (!packageName.startsWith('@')) {
    const qualified = `@pyreon/${packageName}`
    if (registry.byName.has(qualified)) return registry.byName.get(qualified)!
  }
  return null
}

export function suggestChangelogs(registry: ChangelogRegistry, needle: string): string[] {
  const lower = needle.toLowerCase()
  const matches: string[] = []
  for (const name of registry.byName.keys()) {
    if (name.toLowerCase().includes(lower)) matches.push(name)
  }
  return matches.slice(0, 5)
}

// ═══════════════════════════════════════════════════════════════════════════════
// Formatters
// ═══════════════════════════════════════════════════════════════════════════════

export interface FormatOptions {
  /** How many non-empty versions to include. Default 5. */
  limit?: number | undefined
  /** Show `Updated dependencies` bullets. Default false — AI consumers rarely care. */
  includeDependencyUpdates?: boolean | undefined
}

/**
 * Format a package's changelog for the MCP response. Filters empty
 * versions and slices to the `limit` most recent.
 */
export function formatChangelog(
  changelog: PackageChangelog,
  { limit = 5, includeDependencyUpdates = false }: FormatOptions = {},
): string {
  const nonEmpty = changelog.entries.filter((e) => !e.empty)
  const sliced = nonEmpty.slice(0, limit)

  if (sliced.length === 0) {
    const ceremonial = changelog.entries.length
    const versions = changelog.entries.slice(0, 3).map((e) => e.version).join(', ')
    return (
      `# ${changelog.packageName} — no substantive changes\n\n` +
      `CHANGELOG.md has ${ceremonial} version entr${ceremonial === 1 ? 'y' : 'ies'} ` +
      `(${versions}${ceremonial > 3 ? ', …' : ''}) but every one is a ceremonial ` +
      `version bump with no user-facing body. This usually means the package ` +
      `only received dependency updates during the captured history. Check ` +
      `\`get_changelog({ includeDependencyUpdates: true })\` or the git log ` +
      `if you need the bumps themselves.`
    )
  }

  const parts: string[] = []
  parts.push(`# ${changelog.packageName} — changelog (${sliced.length}/${nonEmpty.length} shown)`)
  parts.push('')
  if (nonEmpty.length > limit) {
    parts.push(
      `Showing the ${limit} most recent substantive versions. ` +
        `${nonEmpty.length - limit} older versions omitted. Pass \`limit\` to expand.`,
    )
    parts.push('')
  }

  for (const entry of sliced) {
    parts.push(`## ${entry.version}`)
    parts.push('')
    for (const change of entry.changes) {
      parts.push(`- ${change}`)
      parts.push('')
    }
    if (includeDependencyUpdates && entry.dependencyUpdates.length > 0) {
      parts.push('### Updated dependencies')
      for (const dep of entry.dependencyUpdates) {
        parts.push(`- ${dep}`)
      }
      parts.push('')
    }
  }

  return parts.join('\n').trimEnd()
}

/**
 * Format the registry as an index when `get_changelog` is called
 * with no package name. Lists every package with its latest
 * substantive version (for orientation).
 */
export function formatChangelogIndex(registry: ChangelogRegistry): string {
  if (!registry.root || registry.byName.size === 0) {
    return (
      'No changelogs found. This tool reads CHANGELOG.md files from the ' +
      'Pyreon monorepo. If you are running the MCP in a consumer project ' +
      'without the Pyreon packages directory, run the MCP from the Pyreon ' +
      'repo root to browse releases.'
    )
  }

  const names = [...registry.byName.keys()].sort()
  const parts: string[] = [`# Pyreon Changelogs (${names.length} packages)`, '']
  parts.push(
    `Call \`get_changelog({ package: "<name>" })\` for per-package release notes. Pass \`limit\` to control how many versions (default 5). The short form \`foo\` maps to \`@pyreon/foo\`.`,
  )
  parts.push('')

  for (const name of names) {
    const cl = registry.byName.get(name)!
    const latest = cl.entries.find((e) => !e.empty)
    const summary = latest
      ? `latest substantive: v${latest.version}`
      : 'ceremonial bumps only'
    parts.push(`- **${name}** — ${summary}`)
  }

  return parts.join('\n')
}
