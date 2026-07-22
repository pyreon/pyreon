/**
 * Shared source-file walker for the per-file scanning gates
 * (react-patterns, pyreon-patterns, lint).
 *
 * The walker skips the standard non-source dirs (`node_modules`,
 * `dist`, `lib`, `.git`, etc.) and matches `.ts` / `.tsx` / `.js` /
 * `.jsx`. Gates consume {@link collectAuditableSourceFiles} over the
 * workspace roots resolved by
 * `utils/workspace-roots.ts:resolveWorkspaceRoots` — the scan scope is
 * the workspace's OWN declared package roots, never a hardcoded repo
 * shape. (Historically this module required the Pyreon framework
 * repo's two-level `packages/<cat>/<pkg>/src/**` layout, which scanned
 * ZERO files in any foreign workspace while the doctor still reported
 * a green score — the upstream-reported false-green bug.)
 *
 * Per-file objectivity filters are kept: test files / fixtures /
 * `.d.ts` are never audited (detector test-fixtures deliberately
 * contain anti-patterns), and per-package `src/` is preferred over the
 * package root when it exists (built output, scripts and configs are
 * not health surface). The Pyreon repo's examples/docs exclusion lives
 * in `pyreon.doctor.excludeRoots` in the root package.json — explicit
 * config, not a hardcoded shape.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

import type { WorkspaceRoots } from './workspace-roots'

const SOURCE_EXTENSIONS = new Set(['.tsx', '.jsx', '.ts', '.js'])
const IGNORE_DIRS = new Set([
  'node_modules',
  'dist',
  'lib',
  '.pyreon',
  '.git',
  '.next',
  'build',
])

const shouldSkipDirEntry = (entry: fs.Dirent): boolean => {
  if (!entry.isDirectory()) return false
  return entry.name.startsWith('.') || IGNORE_DIRS.has(entry.name)
}

const walk = (dir: string, results: string[]): void => {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (shouldSkipDirEntry(entry)) continue

    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(fullPath, results)
    } else if (
      entry.isFile() &&
      SOURCE_EXTENSIONS.has(path.extname(entry.name))
    ) {
      results.push(fullPath)
    }
  }
}

/**
 * True when `filePath` is a source file the doctor should audit —
 * source extension, not a type declaration, not a test/spec file, not
 * under a tests/fixtures dir. Layout-agnostic: root scoping is the
 * resolver's job; this predicate only applies the per-file objectivity
 * filters (detector fixtures intentionally hold anti-patterns, so
 * scoring them would produce a false grade).
 */
export const isAuditableSourceFile = (filePath: string): boolean => {
  const p = filePath.replace(/\\/g, '/')
  if (!SOURCE_EXTENSIONS.has(path.extname(p))) return false
  if (p.endsWith('.d.ts')) return false
  if (/(^|\/)(tests?|__tests__|__fixtures__|fixtures)\//.test(p)) return false
  if (/\.(test|spec|browser\.test|browser\.spec)\.[tj]sx?$/.test(p)) return false
  return true
}

/** True when `filePath` belongs to a `*-compat` package. The compat
 *  layers' public API IS React/Preact/Vue/Solid's surface by design —
 *  flagging `useState`/`className`/etc. there is a definitional false
 *  positive (the package exists precisely to expose those names). */
export const isCompatPackageFile = (filePath: string): boolean =>
  /(^|\/)[a-z][a-z0-9-]*-compat\//.test(filePath.replace(/\\/g, '/'))

/**
 * The scan root for one package dir: `<dir>/src` when it exists (the
 * shipped source surface — build output / scripts / configs at the
 * package root are not health surface), else the package dir itself
 * (flat layouts keep source at the root).
 */
export const packageScanRoot = (pkgDir: string): string => {
  const src = path.join(pkgDir, 'src')
  try {
    if (fs.statSync(src).isDirectory()) return src
  } catch {
    // no src/ — scan the package dir itself
  }
  return pkgDir
}

/**
 * Collect the auditable source files across every resolved workspace
 * package root — the objective health surface the file-scanning gates
 * share. Per package: `src/**` when present, else the package tree;
 * always minus tests / fixtures / `.d.ts` / ignored dirs.
 *
 * The per-file predicate runs against the path RELATIVE to the scan
 * root — on an absolute path, a parent dir named `test/` outside the
 * repo (e.g. `/home/x/test/repo/...`) would false-exclude every file.
 */
export const collectAuditableSourceFiles = (ws: WorkspaceRoots): string[] => {
  const all: string[] = []
  const seen = new Set<string>()
  for (const pkgDir of ws.packageDirs) {
    const root = packageScanRoot(pkgDir)
    const files: string[] = []
    walk(root, files)
    for (const f of files) {
      if (seen.has(f)) continue
      seen.add(f)
      if (isAuditableSourceFile(path.relative(root, f))) all.push(f)
    }
  }
  return all
}
