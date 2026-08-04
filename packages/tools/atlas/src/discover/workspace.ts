/**
 * Workspace detection — find the packages worth documenting, with no config.
 *
 * ── The question this answers ─────────────────────────────────────────────
 *
 * `atlas.config.ts`'s `projects` lets a monorepo declare its packages. Making
 * someone write that list is the wrong default: the workspace already declares
 * it, in `package.json` `workspaces` or `pnpm-workspace.yaml`, and re-typing it
 * into a second file is a list that goes stale the first time a package is
 * added.
 *
 * So this reads the declaration the workspace already has, and probes each
 * package for components. A package with no components is not a documentation
 * site's problem — listing it produces an empty group, which reads as a broken
 * scan rather than as an unrelated package.
 *
 * ── Why not reuse @pyreon/cli's resolver ──────────────────────────────────
 *
 * `@pyreon/cli`'s `doctor/utils/workspace-roots.ts` also expands workspace
 * globs, and this is deliberately NOT a copy of it: the two answer different
 * questions. That one asks "given a cwd anywhere in the tree, which roots
 * should I AUDIT" — hence upward walking and exclusion lists. This asks "given
 * this root, which packages have components worth DOCUMENTING" — hence the
 * component probe, which that one has no use for. The shared part is glob
 * expansion, and it is small enough here to be read at a glance.
 *
 * Importing across them is not available anyway: `@pyreon/cli` delegates to
 * Atlas by spawning it, and both are published, so a dependency either way
 * would drag a whole CLI into a workbench install (or the reverse).
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { ProjectRoot } from './config'
import { discoverComponents } from './discover'

/** How deep a `*`/`**` glob is allowed to walk — a bound, not a preference. */
const MAX_GLOB_DEPTH = 6

/** Directories never worth descending into while expanding a glob. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'lib', 'build', 'coverage', '.next'])

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Workspace globs from a parsed package.json — array or `{ packages }` shape. */
export function workspaceGlobs(pkg: Record<string, unknown>): string[] {
  const ws = pkg.workspaces
  if (Array.isArray(ws)) return ws.filter((g): g is string => typeof g === 'string')
  if (ws && typeof ws === 'object') {
    const packages = (ws as { packages?: unknown }).packages
    if (Array.isArray(packages)) return packages.filter((g): g is string => typeof g === 'string')
  }
  return []
}

/**
 * Globs from `pnpm-workspace.yaml` — only the `packages:` list-of-strings shape
 * pnpm documents. Not a YAML engine.
 */
export function pnpmWorkspaceGlobs(yaml: string): string[] {
  const globs: string[] = []
  let inPackages = false
  for (const raw of yaml.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '')
    if (/^packages\s*:/.test(line)) {
      inPackages = true
      continue
    }
    if (!inPackages) continue
    const trimmed = line.trim()
    // Indented `- glob`, optionally quoted.
    if (/^\s/.test(line) && trimmed.startsWith('- ')) {
      let value = trimmed.slice(2).trim()
      if (
        value.length >= 2 &&
        ((value.startsWith("'") && value.endsWith("'")) ||
          (value.startsWith('"') && value.endsWith('"')))
      ) {
        value = value.slice(1, -1)
      }
      if (value) globs.push(value)
      continue
    }
    // A non-blank line back at column 0 closes the block.
    if (trimmed !== '' && !/^\s/.test(line)) inPackages = false
  }
  return globs
}

/**
 * Every workspace package directory, from the declared globs.
 *
 * Exported so the SCAN can build a name → dir map from the same expansion
 * `detectProjects` uses. Two answers to "where are this workspace's packages"
 * is how a monorepo tool starts disagreeing with itself.
 */
export function workspacePackageDirs(root: string): string[] {
  const globs = readWorkspaceGlobs(root)
  const seen = new Set<string>()
  for (const glob of globs) for (const dir of expandGlob(root, glob)) seen.add(dir)
  return [...seen]
}

/** Every workspace glob a root declares, from either source. */
export function readWorkspaceGlobs(root: string): string[] {
  const pkg = readJson(join(root, 'package.json'))
  const fromPkg = pkg ? workspaceGlobs(pkg) : []
  if (fromPkg.length > 0) return fromPkg

  const yamlPath = join(root, 'pnpm-workspace.yaml')
  if (!existsSync(yamlPath)) return []
  try {
    return pnpmWorkspaceGlobs(readFileSync(yamlPath, 'utf8'))
  } catch {
    return []
  }
}

/**
 * Expand one glob to the directories it names.
 *
 * Supports the two shapes workspace globs actually use — a trailing `*`
 * (`packages/*`) and a trailing `**` (`packages/**`) — plus literal paths.
 * A `*` in the middle of a segment is NOT supported and is treated literally;
 * no workspace field in the wild uses one, and pretending otherwise would mean
 * shipping a glob engine to answer a question that never asks for it.
 */
export function expandGlob(root: string, glob: string): string[] {
  const parts = glob.split('/').filter(Boolean)
  let dirs = [root]

  for (const [index, part] of parts.entries()) {
    const isLast = index === parts.length - 1
    if (part === '*' || part === '**') {
      const deep = part === '**'
      const next: string[] = []
      for (const dir of dirs) next.push(...childDirs(dir, deep ? MAX_GLOB_DEPTH : 1))
      dirs = next
      continue
    }
    dirs = dirs.map((dir) => join(dir, part)).filter((dir) => existsSync(dir))
    if (isLast) break
  }
  return dirs
}

/** Directories under `dir`, up to `depth` levels, skipping the usual noise. */
function childDirs(dir: string, depth: number): string[] {
  if (depth <= 0) return []
  let entries: { name: string; isDirectory(): boolean }[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const name = String(entry.name)
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    out.push(full)
    if (depth > 1) out.push(...childDirs(full, depth - 1))
  }
  return out
}

/**
 * A project name from a package name.
 *
 * `@acme/design-core` → `Design Core`. The scope is dropped (every package in a
 * workspace usually shares it, so it is noise in every sidebar heading) and the
 * rest is title-cased, because this string is a heading a person reads, not an
 * identifier.
 */
export function projectNameFor(packageName: string, dir: string): string {
  const bare = packageName.includes('/')
    ? (packageName.split('/').pop() ?? packageName)
    : packageName
  const cleaned = bare.replace(/^@/, '').trim()
  const source = cleaned.length > 0 ? cleaned : (dir.split('/').pop() ?? dir)
  return source
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export interface DetectOptions {
  /** Directory within each package to scan (default `src`, falling back to the package root). */
  dir?: string
  /** Overrides the component probe. Injected so detection is testable without a disk. */
  hasComponents?: (dir: string) => boolean
}

/** A detected package, before it becomes a `ProjectRoot`. */
export interface DetectedProject extends ProjectRoot {
  /** The package's own name, for reporting. */
  packageName: string
}

/**
 * The packages in this workspace that have components.
 *
 * Returns `[]` for a single-package project — no workspaces declared, or none of
 * them contain anything to document. Callers treat that as "not a monorepo" and
 * fall back to the ordinary single-root scan, so this can never make a working
 * project worse.
 */
export function detectProjects(root: string, options: DetectOptions = {}): DetectedProject[] {
  const scanDir = options.dir ?? 'src'
  const probe =
    options.hasComponents ??
    // Counts COMPONENTS, not files. A file count was wrong the moment `.ts`
    // joined the scanned extensions: a utils package full of `math.ts` then
    // read as "has components" and earned an empty sidebar group. Parsing is
    // the only honest answer to "is there anything to document here", and it
    // runs once per candidate package.
    ((dir: string) => discoverComponents({ cwd: dir, dir: '.' }).length > 0)

  const globs = readWorkspaceGlobs(root)
  if (globs.length === 0) return []

  const seen = new Set<string>()
  const found: DetectedProject[] = []
  const names = new Set<string>()

  for (const glob of globs) {
    for (const dir of expandGlob(root, glob)) {
      if (seen.has(dir)) continue
      seen.add(dir)

      const pkg = readJson(join(dir, 'package.json'))
      if (!pkg) continue // a directory the glob matched that is not a package
      // A private package is still documentable — `private: true` says "do not
      // publish", not "do not show the team what it contains".

      // Prefer the conventional `src`, but accept a package that keeps its
      // components at the root rather than reporting it as empty.
      const candidates = [join(dir, scanDir), dir]
      const sourceDir = candidates.find((c) => existsSync(c) && probe(c))
      if (!sourceDir) continue

      const packageName = typeof pkg.name === 'string' ? pkg.name : ''
      let name = projectNameFor(packageName, dir)
      // Two packages whose names title-case to the same heading would key their
      // components identically — the exact collapse `project` prevents. Suffix
      // rather than drop: a visible `Core (2)` is diagnosable, a missing package
      // is not.
      if (names.has(name)) {
        let n = 2
        while (names.has(`${name} (${n})`)) n += 1
        name = `${name} (${n})`
      }
      names.add(name)

      found.push({
        name,
        // Relative, because that is what `atlas.config.ts` stores and what
        // `atlas init` writes — an absolute path would not survive a clone.
        dir: relativeDir(root, sourceDir),
        packageName,
      })
    }
  }

  return found
}

/** `root`-relative POSIX path — config files are read on every platform. */
function relativeDir(root: string, dir: string): string {
  const normalizedRoot = resolve(root)
  const normalized = resolve(dir)
  const rel = normalized.startsWith(normalizedRoot)
    ? normalized.slice(normalizedRoot.length).replace(/^[/\\]/, '')
    : normalized
  return rel.split(/[/\\]/).filter(Boolean).join('/')
}
