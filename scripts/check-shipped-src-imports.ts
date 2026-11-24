#!/usr/bin/env bun
/**
 * Nothing a package SHIPS may import from its own `src/` when the publish
 * strips `src/`.
 *
 * `scripts/publish.ts` drops `src` from `files` for every package that builds
 * to `lib/` (`stripSrcFromFiles` / `packageBuildsToLib`). A file shipped from
 * another directory — the `app/` that `atlas build` and `loom build` run — that
 * imports `../../src/ui` works in this monorepo, where `src/` is on disk, and
 * fails in every install: `UNRESOLVED_IMPORT '../../src/ui'`. Loom shipped
 * that way for a release; Atlas nearly did. The fix is the package's own
 * public subpath (`@pyreon/atlas/ui`), which resolves to `lib/` once
 * published.
 *
 * Scans every file under every shipped entry except `lib/` (built output) and
 * `src/` itself, for relative imports that land inside `<package>/src` and for
 * `<own name>/src/...` specifiers. Static imports, re-exports, dynamic
 * `import()`, `import('…')` type references and `require()` are all read.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packageBuildsToLib, stripSrcFromFiles } from './strip-bun-condition'

export interface ShippedSrcImport {
  pkg: string
  file: string
  specifier: string
}

const CODE = /\.(?:[cm]?[jt]sx?|d\.[cm]?ts)$/

const SPECIFIERS = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]

/** Never part of a package's shipped source, wherever they sit. */
const SKIP_DIRS = new Set(['node_modules', '.pyreon', '.cache'])

function filesUnder(path: string): string[] {
  let st: ReturnType<typeof statSync>
  try {
    st = statSync(path)
  } catch {
    return []
  }
  if (st.isFile()) return CODE.test(path) ? [path] : []
  const out: string[] = []
  for (const entry of readdirSync(path)) {
    if (SKIP_DIRS.has(entry)) continue
    out.push(...filesUnder(join(path, entry)))
  }

  return out
}

/** The violations in one package directory (empty when it ships `src/`). */
export function shippedSrcImports(pkgDir: string): ShippedSrcImport[] {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
    name?: string
    files?: unknown
  } & Parameters<typeof packageBuildsToLib>[0]
  if (!pkg.name || !Array.isArray(pkg.files) || !packageBuildsToLib(pkg)) return []
  const shipped = stripSrcFromFiles(pkg.files) as string[]
  if (shipped.some((f) => f === 'src' || f.startsWith('src/'))) return []
  const srcDir = join(pkgDir, 'src')
  const out: ShippedSrcImport[] = []
  for (const entry of shipped) {
    if (entry.startsWith('!') || entry === 'lib' || entry.startsWith('lib/')) continue
    for (const file of filesUnder(join(pkgDir, entry))) {
      const code = readFileSync(file, 'utf8')
      for (const re of SPECIFIERS) {
        for (const m of code.matchAll(re)) {
          const spec = m[1] as string
          const intoSrc = spec.startsWith('.')
            ? (resolve(dirname(file), spec) + sep).startsWith(srcDir + sep)
            : spec === `${pkg.name}/src` || spec.startsWith(`${pkg.name}/src/`)
          if (intoSrc) out.push({ pkg: pkg.name, file: relative(pkgDir, file), specifier: spec })
        }
      }
    }
  }

  return out
}

/** Every `packages/<category>/<name>` directory with a manifest. */
export function workspacePackageDirs(root: string): string[] {
  const out: string[] = []
  for (const cat of readdirSync(join(root, 'packages'))) {
    const catDir = join(root, 'packages', cat)
    if (!statSync(catDir).isDirectory()) continue
    for (const name of readdirSync(catDir)) {
      if (existsSync(join(catDir, name, 'package.json'))) out.push(join(catDir, name))
    }
  }

  return out
}

if (import.meta.main) {
  const root = fileURLToPath(new URL('..', import.meta.url))
  const dirs = workspacePackageDirs(root)
  if (dirs.length === 0) {
    console.error('[check-shipped-src-imports] FAIL — found no packages. The gate is broken.')
    process.exit(1)
  }
  const found = dirs.flatMap(shippedSrcImports)
  if (found.length > 0) {
    console.error(
      `[check-shipped-src-imports] FAIL — ${found.length} shipped file(s) import from src/, which the publish strips:\n`,
    )
    for (const v of found) console.error(`  ${v.pkg}  ${v.file}  →  '${v.specifier}'`)
    console.error(
      "\n  Import the package's own public subpath instead (e.g. '@pyreon/atlas/ui'); it resolves to lib/ once published.",
    )
    process.exit(1)
  }
  console.log(`[check-shipped-src-imports] OK — ${dirs.length} packages; no shipped file imports a stripped src/.`)
}
