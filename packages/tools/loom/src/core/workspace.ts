/**
 * Workspace discovery — root manifest → member globs → member manifests.
 *
 * Reads the same declarations an install tool reads: `workspaces` in the root
 * package.json (array or `{ packages }` object form — npm/bun/yarn), plus
 * `pnpm-workspace.yaml`'s `packages:` list when present. Glob support is the
 * subset workspace declarations actually use: literal dirs, `dir/*`, and
 * `dir/**` — resolved against real directories containing a package.json.
 *
 * No install tool is invoked and no lockfile is parsed: Loom reads DECLARED
 * truth. (Installed-resolution analysis — lockfile duplicates, hoisting — is
 * a documented later layer, not quietly half-done here.)
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import type { DeclaredDep, DepField, WorkspaceModel, WorkspacePackage, WorkspaceRoot } from './types'

const DEP_FIELDS: DepField[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

interface RawManifest {
  name?: string
  loom?: { ignore?: unknown }
  version?: string
  private?: boolean
  license?: string
  workspaces?: string[] | { packages?: string[] }
  overrides?: Record<string, unknown>
  resolutions?: Record<string, unknown>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

function readJson(path: string): RawManifest | null {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as RawManifest
  } catch {
    return null
  }
}

/** Root workspace globs from package.json (+ pnpm-workspace.yaml when present). */
export function readWorkspaceGlobs(rootDir: string): string[] {
  const globs: string[] = []
  const manifest = readJson(join(rootDir, 'package.json'))
  const ws = manifest?.workspaces
  if (Array.isArray(ws)) globs.push(...ws)
  else if (ws && Array.isArray(ws.packages)) globs.push(...ws.packages)

  // pnpm keeps globs in its own YAML. The file's shape in practice is a flat
  // `packages:` list — parse exactly that (a `- 'glob'` line per entry), not
  // general YAML.
  try {
    const yaml = readFileSync(join(rootDir, 'pnpm-workspace.yaml'), 'utf8')
    for (const line of yaml.split('\n')) {
      const m = /^\s*-\s*['"]?([^'"#\s]+)['"]?\s*$/.exec(line)
      if (m?.[1]) globs.push(m[1])
    }
  } catch {
    // no pnpm workspace file — the common case
  }
  return globs
}

/**
 * Directories (relative to root) matched by one workspace glob.
 *
 * Segment-wise matcher: `*` matches one segment, `**` any depth — so
 * `packages/*\/*` (the two-level layout this repo itself uses) resolves
 * correctly. The first cut only handled a TRAILING star and silently found a
 * third of this monorepo — the dogfood run caught it (57 of 90+, zero edges).
 */
function expandGlob(rootDir: string, glob: string): string[] {
  const segments = glob.replace(/\/$/, '').split('/')
  const out: string[] = []

  const walk = (dir: string, segIndex: number) => {
    if (segIndex === segments.length) {
      try {
        readFileSync(join(rootDir, dir, 'package.json'), 'utf8')
        out.push(dir)
      } catch {
        // matched dir without a manifest — not a package
      }
      return
    }
    const seg = segments[segIndex]!
    if (seg === '**') {
      // Any depth including zero — try the rest here, then descend.
      walk(dir, segIndex + 1)
      let entries: string[]
      try {
        entries = readdirSync(join(rootDir, dir))
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        walk(dir ? join(dir, entry) : entry, segIndex)
      }
      return
    }
    if (seg === '*') {
      let entries: string[]
      try {
        entries = readdirSync(join(rootDir, dir))
      } catch {
        return
      }
      for (const entry of entries) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue
        walk(dir ? join(dir, entry) : entry, segIndex + 1)
      }
      return
    }
    walk(dir ? join(dir, seg) : seg, segIndex + 1)
  }

  walk('', 0)
  return out
}

function declaredDeps(m: RawManifest): DeclaredDep[] {
  const out: DeclaredDep[] = []
  for (const field of DEP_FIELDS) {
    const rec = m[field]
    if (!rec) continue
    for (const [name, range] of Object.entries(rec)) out.push({ name, range, field })
  }
  return out
}

/**
 * Scan a workspace root into the model. Throws with an actionable message
 * when `rootDir` has no package.json — a scan of nothing must not report a
 * clean workspace (the empty-scan-is-not-a-pass rule).
 */
export function scanWorkspace(rootDir: string): WorkspaceModel {
  const rootManifest = readJson(join(rootDir, 'package.json'))
  if (!rootManifest) {
    throw new Error(`[Pyreon] loom: no package.json at ${rootDir} — point loom at a workspace root.`)
  }

  const globs = readWorkspaceGlobs(rootDir)
  const include = globs.filter((g) => !g.startsWith('!'))
  const exclude = new Set(globs.filter((g) => g.startsWith('!')).map((g) => g.slice(1).replace(/\/$/, '')))

  const dirs = new Set<string>()
  for (const glob of include) {
    for (const dir of expandGlob(rootDir, glob)) {
      // Normalize to forward slashes so the model is OS-stable.
      const norm = dir.split(sep).join('/')
      if (!exclude.has(norm)) dirs.add(norm)
    }
  }

  const packages: WorkspacePackage[] = []
  for (const dir of [...dirs].sort()) {
    const m = readJson(join(rootDir, dir, 'package.json'))
    if (!m?.name) continue
    packages.push({
      name: m.name,
      version: m.version ?? '0.0.0',
      dir,
      private: m.private === true,
      ...(m.license ? { license: m.license } : {}),
      deps: declaredDeps(m),
    })
  }

  const overrides: Record<string, string> = {}
  for (const source of [rootManifest.overrides, rootManifest.resolutions]) {
    if (!source) continue
    for (const [k, v] of Object.entries(source)) {
      if (typeof v === 'string') overrides[k] = v
    }
  }

  const ignores: import('./types').LoomIgnore[] = []
  const rawIgnore = rootManifest.loom?.ignore
  if (rawIgnore !== undefined) {
    if (!Array.isArray(rawIgnore)) {
      throw new Error('[Pyreon] loom: root `loom.ignore` must be an array of { pkg?, dep?, code?, reason } objects.')
    }
    for (const entry of rawIgnore) {
      const e = entry as Record<string, unknown>
      if (typeof e?.reason !== 'string' || e.reason.trim() === '') {
        throw new Error(
          `[Pyreon] loom: every \`loom.ignore\` entry needs a non-empty \`reason\` — an unexplained suppression is a lie waiting to age (offending entry: ${JSON.stringify(entry)}).`,
        )
      }
      ignores.push({
        ...(typeof e.pkg === 'string' ? { pkg: e.pkg } : {}),
        ...(typeof e.dep === 'string' ? { dep: e.dep } : {}),
        ...(typeof e.code === 'string' ? { code: e.code } : {}),
        reason: e.reason,
      })
    }
  }

  const root: WorkspaceRoot = {
    ...(rootManifest.name ? { name: rootManifest.name } : {}),
    dir: relative(process.cwd(), rootDir) || '.',
    overrides,
    workspaceGlobs: globs,
    ignores,
  }

  return { root, packages }
}
