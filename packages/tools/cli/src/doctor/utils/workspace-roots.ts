/**
 * Workspace-root discovery for the file-scanning doctor gates.
 *
 * WHY this exists (upstream report, 2026-07): each gate used to resolve
 * its own scan root against the Pyreon framework repo's OWN layout —
 * `collectFirstPartySourceFiles` required the two-level
 * `packages/<category>/<pkg>/src/**` shape, and the compiler's
 * test-audit walked a literal `<root>/packages`. In any foreign
 * workspace (even a standard single-level `packages/*`, let alone
 * `apps/* + packages/* + modules/*`) those gates scanned ZERO files and
 * the doctor still reported 100/100 Grade A — a silent false green
 * (the documented "silent-filter on aggregate gates" anti-pattern class).
 *
 * The fix: ONE resolver that reads the workspace's own configuration —
 * `package.json` `workspaces` (array or `{ packages }` shape) or
 * `pnpm-workspace.yaml` — expands the globs to real package dirs, and
 * hands every file-scanning gate the same root set. Repos with no
 * workspaces are treated as single-package projects (the nearest
 * `package.json` dir is the one root). The Pyreon repo's own
 * examples/docs exclusion moved from a hardcoded path shape into
 * explicit config (`pyreon.doctor.excludeRoots` in the root
 * package.json) — policy out of the mechanism.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

export interface WorkspaceRoots {
  /** Absolute path discovery anchored on (workspace root / package dir / cwd). */
  repoRoot: string
  /** Absolute paths of the discovered package roots (deduped, sorted). */
  packageDirs: string[]
  /** The globs the dirs were expanded from (as written in config / flag). */
  globs: string[]
  /** Exclusion globs applied (from `pyreon.doctor.excludeRoots` or flag). */
  excluded: string[]
  /** Where the globs came from. */
  source: 'flag' | 'workspaces' | 'pnpm-workspace' | 'single-package'
}

const MAX_UPWARD_STEPS = 30
const MAX_GLOB_DEPTH = 8

const readJson = (file: string): Record<string, unknown> | null => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  } catch {
    return null
  }
}

/** Extract workspace globs from a parsed package.json (array or `{ packages }`). */
export const workspaceGlobsFromPackageJson = (
  pkg: Record<string, unknown>,
): string[] | null => {
  const ws = pkg['workspaces']
  if (Array.isArray(ws)) {
    const globs = ws.filter((g): g is string => typeof g === 'string')
    return globs.length > 0 ? globs : null
  }
  if (ws !== null && typeof ws === 'object') {
    const packages = (ws as { packages?: unknown }).packages
    if (Array.isArray(packages)) {
      const globs = packages.filter((g): g is string => typeof g === 'string')
      return globs.length > 0 ? globs : null
    }
  }
  return null
}

/**
 * Minimal `pnpm-workspace.yaml` parser — only the `packages:` list-of-
 * strings shape pnpm documents. Not a YAML engine; quoted or bare
 * `- glob` entries under a top-level `packages:` key.
 */
export const workspaceGlobsFromPnpmYaml = (yaml: string): string[] | null => {
  const lines = yaml.split(/\r?\n/)
  const globs: string[] = []
  let inPackages = false
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '')
    if (/^packages\s*:/.test(line)) {
      inPackages = true
      continue
    }
    if (inPackages) {
      const m = /^\s+-\s+(['"]?)(.+?)\1\s*$/.exec(line)
      if (m?.[2]) {
        globs.push(m[2])
        continue
      }
      // A non-list, non-blank line at column 0 ends the packages block.
      if (line.trim() !== '' && !/^\s/.test(line)) inPackages = false
    }
  }
  return globs.length > 0 ? globs : null
}

/**
 * Match a repo-root-RELATIVE dir path against a workspace-style glob.
 * Segment-wise: `*` matches exactly one segment, `**` matches any
 * number (including zero). Literal segments compare exactly. This is
 * the same dialect workspace `packages` globs use — not a general
 * matcher.
 */
export const globMatchesDir = (glob: string, relDir: string): boolean => {
  const g = glob.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  const d = relDir.replace(/\\/g, '/').replace(/\/+$/, '').split('/')
  const match = (gi: number, di: number): boolean => {
    if (gi === g.length) return di === d.length
    const seg = g[gi]!
    if (seg === '**') {
      for (let skip = di; skip <= d.length; skip++) {
        if (match(gi + 1, skip)) return true
      }
      return false
    }
    if (di === d.length) return false
    if (seg === '*' || seg === d[di]) return match(gi + 1, di + 1)
    return false
  }
  return match(0, 0)
}

const listSubdirs = (dir: string): string[] => {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter(
      (e) =>
        e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules',
    )
    .map((e) => path.join(dir, e.name))
}

const expandGlobSegments = (
  base: string,
  segments: string[],
  idx: number,
  out: string[],
  depth: number,
): void => {
  if (depth > MAX_GLOB_DEPTH) return
  if (idx === segments.length) {
    out.push(base)
    return
  }
  const seg = segments[idx]!
  if (seg === '*') {
    for (const sub of listSubdirs(base)) {
      expandGlobSegments(sub, segments, idx + 1, out, depth + 1)
    }
    return
  }
  if (seg === '**') {
    // `**` matches zero-or-more segments: the current dir plus every
    // descendant dir (bounded by MAX_GLOB_DEPTH).
    expandGlobSegments(base, segments, idx + 1, out, depth + 1)
    for (const sub of listSubdirs(base)) {
      expandGlobSegments(sub, segments, idx, out, depth + 1)
    }
    return
  }
  const next = path.join(base, seg)
  let isDir = false
  try {
    isDir = fs.statSync(next).isDirectory()
  } catch {
    return
  }
  if (isDir) expandGlobSegments(next, segments, idx + 1, out, depth + 1)
}

/** Expand one workspace glob (relative to `base`) to existing dirs. */
export const expandWorkspaceGlob = (base: string, glob: string): string[] => {
  const normalized = glob.replace(/\\/g, '/').replace(/\/+$/, '')
  const out: string[] = []
  expandGlobSegments(base, normalized.split('/').filter(Boolean), 0, out, 0)
  return out
}

const hasPackageJson = (dir: string): boolean => {
  try {
    return fs.statSync(path.join(dir, 'package.json')).isFile()
  } catch {
    return false
  }
}

/** Read `pyreon.doctor.excludeRoots` from a parsed root package.json. */
export const excludeRootsFromPackageJson = (
  pkg: Record<string, unknown> | null,
): string[] => {
  const pyreon = pkg?.['pyreon']
  if (pyreon === null || typeof pyreon !== 'object') return []
  const doctor = (pyreon as { doctor?: unknown }).doctor
  if (doctor === null || typeof doctor !== 'object') return []
  const exclude = (doctor as { excludeRoots?: unknown }).excludeRoots
  if (!Array.isArray(exclude)) return []
  return exclude.filter((g): g is string => typeof g === 'string')
}

interface Anchor {
  dir: string
  globs: string[]
  source: 'workspaces' | 'pnpm-workspace'
}

/** Walk up from `cwd` for the nearest workspace-declaring root. */
const findWorkspaceAnchor = (cwd: string): Anchor | null => {
  let dir = path.resolve(cwd)
  for (let i = 0; i < MAX_UPWARD_STEPS; i++) {
    const pkg = readJson(path.join(dir, 'package.json'))
    if (pkg) {
      const globs = workspaceGlobsFromPackageJson(pkg)
      if (globs) return { dir, globs, source: 'workspaces' }
    }
    try {
      const yaml = fs.readFileSync(path.join(dir, 'pnpm-workspace.yaml'), 'utf8')
      const globs = workspaceGlobsFromPnpmYaml(yaml)
      if (globs) return { dir, globs, source: 'pnpm-workspace' }
    } catch {
      // no pnpm workspace file here
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

/** Walk up from `cwd` for the nearest dir carrying a package.json. */
const findNearestPackageDir = (cwd: string): string | null => {
  let dir = path.resolve(cwd)
  for (let i = 0; i < MAX_UPWARD_STEPS; i++) {
    if (hasPackageJson(dir)) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

export interface ResolveWorkspaceRootsOptions {
  /**
   * Explicit root globs (the `--roots` flag), resolved relative to
   * `cwd`. Overrides discovery entirely; dirs are NOT required to
   * carry a package.json (a bare source root is a valid target).
   */
  roots?: string[] | undefined
}

/**
 * Resolve the set of package roots every file-scanning doctor gate
 * should audit. Precedence: `--roots` flag > `workspaces` field >
 * `pnpm-workspace.yaml` > single-package (nearest package.json) > cwd.
 *
 * Exclusions: `pyreon.doctor.excludeRoots` globs in the workspace
 * root's package.json drop matching package dirs (the Pyreon repo
 * excludes `examples/*` + `docs` — demo/docs workspaces whose health
 * must not grade the framework).
 */
export const resolveWorkspaceRoots = (
  cwd: string,
  options: ResolveWorkspaceRootsOptions = {},
): WorkspaceRoots => {
  const absCwd = path.resolve(cwd)

  if (options.roots && options.roots.length > 0) {
    const dirs = new Set<string>()
    for (const glob of options.roots) {
      for (const dir of expandWorkspaceGlob(absCwd, glob)) dirs.add(dir)
    }
    return {
      repoRoot: absCwd,
      packageDirs: [...dirs].sort(),
      globs: [...options.roots],
      excluded: [],
      source: 'flag',
    }
  }

  const anchor = findWorkspaceAnchor(absCwd)
  if (anchor) {
    const rootPkg = readJson(path.join(anchor.dir, 'package.json'))
    const excluded = excludeRootsFromPackageJson(rootPkg)
    const dirs = new Set<string>()
    // Workspace globs support `!negation` entries (bun/yarn dialect).
    const positive = anchor.globs.filter((g) => !g.startsWith('!'))
    const negative = anchor.globs
      .filter((g) => g.startsWith('!'))
      .map((g) => g.slice(1))
    for (const glob of positive) {
      for (const dir of expandWorkspaceGlob(anchor.dir, glob)) {
        if (!hasPackageJson(dir)) continue
        const rel = path.relative(anchor.dir, dir)
        if (negative.some((n) => globMatchesDir(n, rel))) continue
        if (excluded.some((e) => globMatchesDir(e, rel))) continue
        dirs.add(dir)
      }
    }
    return {
      repoRoot: anchor.dir,
      packageDirs: [...dirs].sort(),
      globs: positive,
      excluded,
      source: anchor.source,
    }
  }

  const pkgDir = findNearestPackageDir(absCwd)
  const root = pkgDir ?? absCwd
  return {
    repoRoot: root,
    packageDirs: [root],
    globs: ['.'],
    excluded: [],
    source: 'single-package',
  }
}

/** Short human description of the resolved scope, for skip reasons + headers. */
export const describeWorkspaceRoots = (ws: WorkspaceRoots): string => {
  const from =
    ws.source === 'flag'
      ? '--roots'
      : ws.source === 'pnpm-workspace'
        ? 'pnpm-workspace.yaml'
        : ws.source === 'workspaces'
          ? 'package.json workspaces'
          : 'single package'
  const globs = ws.globs.join(', ')
  const excluded =
    ws.excluded.length > 0 ? ` · excluded: ${ws.excluded.join(', ')}` : ''
  return `${ws.packageDirs.length} package root(s) from ${from} (${globs})${excluded}`
}
