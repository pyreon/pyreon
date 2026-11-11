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
 * Four invariants per published package whose `build` uses `vl_rolldown_build`:
 *   1. BUILD  — every subpath export `"./X"` (conditions-object value) has a
 *      `src/X.{ts,tsx,js,jsx}` entry (what the tool feeds rolldown).
 *   2. DEV    — the `bun` condition target file exists (the dev/workspace
 *      resolution path; a dangling target breaks `bun run dev`).
 *   3. SAME   — the `bun` target IS that convention entry. The workspace
 *      (tests, examples, `bun run dev`) resolves `bun`; consumers get what the
 *      tool built from the KEY. When the two files differ, every in-repo check
 *      exercises code that never ships. `@pyreon/runtime-dom/transition` shipped
 *      without `TransitionGroup` this way (`bun` → `transition-entry.ts`, built
 *      from `transition.ts`).
 *   4. UNIQUE — no two export keys share an output (`import`/`types`) target.
 *      The tool builds one entry per key and names the output after the target,
 *      so two keys writing one file means one entry silently replaces the other.
 *      Every compat package shipped `./jsx-runtime` and `./jsx-dev-runtime` →
 *      `lib/jsx-runtime.js`, and 0.53.0's file held the DEV entry, which had no
 *      `jsxDEV` — so `vite` dev failed on the published packages (#4283).
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
  kind:
    | 'missing-build-entry'
    | 'missing-bun-target'
    | 'bun-target-not-build-entry'
    | 'shared-output-target'
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

/** The convention entry's actual file (with extension), or undefined. */
function sourceFileOf(pathNoExt: string): string | undefined {
  for (const ext of SOURCE_EXTS) if (existsSync(`${pathNoExt}${ext}`)) return `${pathNoExt}${ext}`
  return undefined
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
  // Invariant 4 bookkeeping: output target → the first key that claimed it.
  const outputOwners = new Map<string, string>()

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

    const cond = exportVal as Record<string, unknown>

    // Invariant 4 — one output file per key.
    for (const condName of ['import', 'types'] as const) {
      const target = cond[condName]
      if (typeof target !== 'string') continue
      const normalized = resolve(pkgDir, target)
      const owner = outputOwners.get(normalized)
      if (owner !== undefined) {
        violations.push({
          pkg: name,
          exportKey,
          kind: 'shared-output-target',
          detail: `exports["${exportKey}"].${condName} → "${target}" is also exports["${owner}"].${condName}; the build writes one entry per key to that file, so one of them silently replaces the other. Give "${exportKey}" its own src/${exportKey.slice(2)}.ts and lib/${exportKey.slice(2)}.js`,
        })
      } else {
        outputOwners.set(normalized, exportKey)
      }
    }

    // Invariant 2 — the `bun` (dev/workspace) target must resolve to a file.
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
      } else if (bunPath !== sourceFileOf(entry)) {
        // Invariant 3 — the workspace must run the file that ships.
        const rel = (sourceFileOf(entry) ?? entry).replace(`${pkgDir}/`, './')
        violations.push({
          pkg: name,
          exportKey,
          kind: 'bun-target-not-build-entry',
          detail: `exports["${exportKey}"].bun → "${bunTarget}", but the build ships ${rel} for this key; the workspace would test code that is never published. Point "bun" at ${rel} (and move the subpath's exports into it)`,
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
      'from the export KEY by convention and names each output after its import/types\n' +
      'target, so "./X" should read { bun: ./src/X.ts, import: ./lib/X.js, types: ./lib/types/X.d.ts }.\n',
  )
  process.exit(1)
}

main()
