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
import { matchesPathGlob } from './imports'
import type { DeclaredDep, DepField, WorkspaceModel, WorkspacePackage, WorkspaceRoot } from './types'

const DEP_FIELDS: DepField[] = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

interface RawManifest {
  name?: string
  loom?: { ignore?: unknown; devPaths?: unknown }
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

/**
 * Read a manifest. `null` means the file does not EXIST — and only that.
 *
 * A file that exists but does not parse is an error, not an absence. Treating
 * the two alike silently dropped a malformed member from the workspace (so
 * every sibling depending on it saw an EXTERNAL package, and the graph lost
 * its edges) and reported a malformed ROOT as "no package.json", sending the
 * reader to look for a file that was right there.
 */
function readJson(path: string): RawManifest | null {
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
  try {
    return JSON.parse(raw) as RawManifest
  } catch (err) {
    throw new Error(`[Pyreon] loom: ${path} is not valid JSON: ${(err as Error).message}`)
  }
}

/**
 * The `packages:` list from a pnpm-workspace.yaml — and nothing else.
 *
 * Not a YAML parser: it reads the one key, in block form (`- 'glob'` lines
 * under it) or flow form (`packages: ['a', 'b']`). Scoping to the key is the
 * point — the same file carries other lists (`onlyBuiltDependencies`,
 * `catalog` entries), and reading every `- item` line anywhere turned each of
 * those into a workspace glob.
 */
export function parsePnpmWorkspacePackages(yaml: string): string[] {
  const out: string[] = []
  const unquote = (v: string): string => v.trim().replace(/^['"]|['"]$/g, '')
  let inPackages = false
  for (const rawLine of yaml.split('\n')) {
    const line = rawLine.replace(/\s+#.*$/, '').replace(/^#.*$/, '')
    if (line.trim() === '') continue
    const top = /^([A-Za-z0-9_-]+)\s*:(.*)$/.exec(line)
    if (top) {
      inPackages = top[1] === 'packages'
      const rest = top[2]!.trim()
      if (inPackages && rest.startsWith('[')) {
        for (const item of rest.replace(/^\[|\]$/g, '').split(',')) {
          const v = unquote(item)
          if (v) out.push(v)
        }
        inPackages = false
      }
      continue
    }
    if (!inPackages) continue
    const m = /^\s*-\s*(.+?)\s*$/.exec(line)
    if (m?.[1]) {
      const v = unquote(m[1])
      if (v) out.push(v)
    }
  }
  return out
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
    globs.push(...parsePnpmWorkspacePackages(yaml))
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
  // A negation is a GLOB like any other (`!packages/*/fixtures`), not a literal
  // path — matched with the same segment-wise matcher the rest of loom uses.
  const exclude = globs
    .filter((g) => g.startsWith('!'))
    .map((g) => g.slice(1).replace(/^\.\//, '').replace(/\/$/, ''))

  const dirs = new Set<string>()
  for (const glob of include) {
    for (const dir of expandGlob(rootDir, glob)) {
      // Normalize to forward slashes so the model is OS-stable.
      const norm = dir.split(sep).join('/')
      if (!exclude.some((g) => matchesPathGlob(norm, g))) dirs.add(norm)
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

  // `loom.devPaths` — package-relative globs that are NOT shipping source.
  // Validated the same way `ignore` is: a malformed value is a loud error, not
  // a silently-ignored config, because a suppression that quietly does nothing
  // is worse than no suppression at all.
  const devPaths: string[] = []
  const rawDevPaths = rootManifest.loom?.devPaths
  if (rawDevPaths !== undefined) {
    if (!Array.isArray(rawDevPaths) || rawDevPaths.some((g) => typeof g !== 'string')) {
      throw new Error(
        '[Pyreon] loom: root `loom.devPaths` must be an array of package-relative globs ' +
          "(e.g. [\"src/manifest.ts\", \"**/*.gen.ts\"]).",
      )
    }
    devPaths.push(...(rawDevPaths as string[]))
  }

  const root: WorkspaceRoot = {
    ...(rootManifest.name ? { name: rootManifest.name } : {}),
    dir: relative(process.cwd(), rootDir) || '.',
    overrides,
    workspaceGlobs: globs,
    ignores,
    devPaths,
  }

  return { root, packages }
}
