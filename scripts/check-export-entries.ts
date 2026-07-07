/**
 * check-export-entries — release-build guard for the export/entry convention.
 *
 * The shared build tool (`@vitus-labs/tools-rolldown` → `vl_rolldown_build`)
 * derives every JS **and** DTS entry from the package.json `exports` KEY by
 * convention — `"./X"` → `src/X.ts` — and IGNORES the `bun`/`import`/`types`
 * targets. So a subpath export `"./matchers"` whose source file is actually
 * `src/matchers-register.ts` (no `src/matchers.ts`) builds fine on every
 * INCREMENTAL/cached CI build but fails the RELEASE's clean `build-batched`
 * with `[UNRESOLVED_ENTRY] Cannot resolve entry module src/matchers` —
 * aborting the publish of every package. (That is exactly what blocked the
 * 0.40.0 release; see PR that added this gate.)
 *
 * This gate reproduces the tool's entry derivation statically, in <1s, so the
 * mismatch fails the PR that introduces it instead of the release weeks later.
 *
 * Two invariants per published package whose `build` uses `vl_rolldown_build`:
 *   1. BUILD  — every subpath export `"./X"` (conditions-object value) has a
 *      `src/X.{ts,tsx,js,jsx}` entry (what the tool feeds rolldown).
 *   2. DEV    — the `bun` condition target file exists (the dev/workspace
 *      resolution path; a dangling target breaks `bun run dev`).
 *
 * String-valued passthrough exports (e.g. `"./package.json"`) are skipped,
 * mirroring the tool. Packages that don't use `vl_rolldown_build` (e.g.
 * `@pyreon/typescript`, an `echo 'nothing to build'` JSON-preset package) are
 * skipped — the convention doesn't apply to them.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')

const SOURCE_EXTS = ['.ts', '.tsx', '.js', '.jsx'] as const

interface Violation {
  pkg: string
  exportKey: string
  kind: 'missing-build-entry' | 'missing-bun-target'
  detail: string
}

/** Mirror of the tool's `resolveSubpathInput`: "." → src/index, "./X" → src/X. */
function conventionEntry(sourceDir: string, exportKey: string): string {
  if (exportKey === '.') return join(sourceDir, 'index')
  return join(sourceDir, exportKey.slice(2)) // strip leading "./"
}

function resolvesToSource(pathNoExt: string): boolean {
  return SOURCE_EXTS.some((ext) => existsSync(`${pathNoExt}${ext}`))
}

function collectPackageDirs(): string[] {
  const out: string[] = []
  for (const cat of readdirSync(PACKAGES_DIR)) {
    const catPath = join(PACKAGES_DIR, cat)
    if (!statSync(catPath).isDirectory()) continue
    for (const pkg of readdirSync(catPath)) {
      const pkgPath = join(catPath, pkg)
      if (!statSync(pkgPath).isDirectory()) continue
      if (existsSync(join(pkgPath, 'package.json'))) out.push(pkgPath)
    }
  }
  return out
}

function checkPackage(pkgDir: string): Violation[] {
  const pkgJsonPath = join(pkgDir, 'package.json')
  const pkg = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as {
    name?: string
    private?: boolean
    scripts?: Record<string, string>
    exports?: Record<string, unknown>
  }
  const name = pkg.name ?? pkgDir

  // Only packages that actually run the convention-based build tool.
  const buildScript = pkg.scripts?.build ?? ''
  if (!buildScript.includes('vl_rolldown_build')) return []

  const exportsObj = pkg.exports
  if (!exportsObj || typeof exportsObj !== 'object') return []

  const sourceDir = join(pkgDir, 'src')
  const violations: Violation[] = []

  for (const [exportKey, exportVal] of Object.entries(exportsObj)) {
    // Passthrough exports (string value, e.g. "./package.json") — the tool
    // skips them, so do we.
    if (typeof exportVal === 'string') continue
    if (exportKey === './package.json') continue

    // Invariant 1 — the BUILD entry the tool derives from the KEY must exist.
    const entry = conventionEntry(sourceDir, exportKey)
    if (!resolvesToSource(entry)) {
      const rel = entry.replace(`${REPO_ROOT}/`, '')
      violations.push({
        pkg: name,
        exportKey,
        kind: 'missing-build-entry',
        detail: `exports["${exportKey}"] → the build tool needs ${rel}.{ts,tsx} but no such file exists (it derives the entry from the export KEY, not the target)`,
      })
      // A missing build entry is the release-blocker; skip the dev check for
      // this key (it'd be noise).
      continue
    }

    // Invariant 2 — the `bun` (dev/workspace) target must resolve to a file.
    const cond = exportVal as Record<string, unknown>
    const bunTarget = cond.bun
    if (typeof bunTarget === 'string') {
      const bunPath = resolve(pkgDir, bunTarget)
      if (!existsSync(bunPath)) {
        violations.push({
          pkg: name,
          exportKey,
          kind: 'missing-bun-target',
          detail: `exports["${exportKey}"].bun → "${bunTarget}" does not exist (breaks dev/workspace resolution)`,
        })
      }
    }
  }

  return violations
}

function main(): void {
  const violations = collectPackageDirs().flatMap(checkPackage)

  if (violations.length === 0) {
    console.log(
      '✓ check-export-entries: every published package\'s subpath exports resolve to a build entry.',
    )
    return
  }

  console.error(
    `\n✗ check-export-entries found ${violations.length} export/entry violation(s) that WILL fail the release build:\n`,
  )
  for (const v of violations) {
    console.error(`  ${v.pkg}  [${v.kind}]`)
    console.error(`    ${v.detail}`)
  }
  console.error(
    '\nFix: rename the source file to match the export subpath (./X → src/X.ts),\n' +
      'or change the export key to match the file. The build tool derives entries\n' +
      'from the export KEY by convention and ignores the bun/import/types targets.\n',
  )
  process.exit(1)
}

main()
