/**
 * Shared source-file walker for the per-file scanning gates
 * (react-patterns, pyreon-patterns).
 *
 * The walker skips the standard non-source dirs (`node_modules`,
 * `dist`, `lib`, `.git`, etc.) and matches `.ts` / `.tsx` / `.js` /
 * `.jsx`. It's a thin wrapper around the original `collectSourceFiles`
 * that lived in `doctor.ts` pre-PR-2; extracted here so any gate can
 * use it without import-cycling through the doctor module.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

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

export const collectSourceFiles = (cwd: string): string[] => {
  const results: string[] = []
  walk(cwd, results)
  return results
}

// ─── Objective first-party scope ─────────────────────────────────────────────
//
// A project-health auditor must measure the source the project actually
// SHIPS and MAINTAINS — not example apps (intentionally framework-idiomatic),
// e2e/docs/scripts, or detector test-fixtures (which deliberately contain
// anti-patterns so the detectors can be tested). Scoring those as "codebase
// health" produces a false grade (PR: doctor reported F=55 where ~705/987
// errors were examples + test-fixtures and the rest were by-design / never
// CI-enforced advisory findings).
//
// First-party source = `packages/<category>/<pkg>/src/**` minus test files.
// This is the same surface every per-package `tsconfig`/build ships. The
// predicate below is pure + unit-tested (the "no subprocess-tested policy"
// rule): a false-negative here silently shrinks the audited set, so it is
// covered, not just smoke-checked.

/**
 * True when `relPath` (a path relative to the repo root, or absolute) is
 * a first-party published-package source file the doctor should audit.
 *
 * Included: any file under a `packages/.../src/` segment with a source
 * extension. Excluded: everything outside `packages/`, anything not under
 * a `src/` segment, and test files (`*.test.*`, `*.spec.*`,
 * `**\/tests/**`, `**\/__tests__/**`, `*.d.ts`).
 */
export const isFirstPartySourceFile = (filePath: string): boolean => {
  const p = filePath.replace(/\\/g, '/')
  // Must live inside a published package's src/ tree.
  if (!/(^|\/)packages\/[^/]+\/[^/]+\/src\//.test(p)) return false
  if (!SOURCE_EXTENSIONS.has(path.extname(p))) return false
  // Drop type-declaration + test/fixture files — not shipped runtime
  // source, and detector-fixture files intentionally hold anti-patterns.
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
  /(^|\/)packages\/[^/]+\/[a-z]+-compat\/src\//.test(
    filePath.replace(/\\/g, '/'),
  )

/**
 * Collect ONLY first-party published-package source files under `cwd`
 * — the objective health surface. Skips `examples/`, `e2e/`, `docs/`,
 * `scripts/`, root-level files, and (via {@link isFirstPartySourceFile})
 * test files / fixtures / `.d.ts`.
 */
export const collectFirstPartySourceFiles = (cwd: string): string[] => {
  const pkgRoot = path.join(cwd, 'packages')
  const all: string[] = []
  walk(pkgRoot, all)
  return all.filter(isFirstPartySourceFile)
}
