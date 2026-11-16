#!/usr/bin/env bun
/**
 * check-bundle-budgets — bundle-size budget gate.
 *
 * For every published `@pyreon/*` package, bundles the BUILT main entry
 * (`lib/index.js` — the exact code that ships to npm, not the TS source)
 * with Bun's bundler (minified, workspace-externalized) and judges the
 * gzipped size: on a pull request against the same package on the commit it
 * merges into, on the default branch against the package's ceiling in
 * `scripts/size-budgets/packages/`. The rules are in `size-budget-policy.ts`.
 *
 * A gate that derives a NUMBER has to be able to say the number is invalid,
 * so every bundle is checked before it is compared to a budget — see
 * {@link diagnoseMeasurement}. Seven packages were previously guarded by a
 * budget over an un-importable stub (`@pyreon/lint` held a 512-byte budget
 * over a package that really measures ~65 KB), because a pure re-export
 * barrel bundles to an export clause whose bindings the bundler already
 * dropped. A measurement that cannot be trusted is now reported as a
 * FAILURE, never as a small size.
 *
 * Why this exists: an audit caught `@pyreon/flow` shipping 6.8 MB
 * unpacked. The 6.8 MB number was misleading (3.8 MB was source maps,
 * the elk lazy-chunk is correctly architected) — but the audit was
 * the wrong shape of catch. We don't want eyeballed `du -sh` to be
 * the tool that flags bundle regressions. A CI gate is the structural
 * answer: a PR that grows a main entry past the per-PR allowance fails
 * until it accepts the growth by setting that package's ceiling.
 *
 * Externalization: bundling externalizes `@pyreon/*` and `node:*` so
 * each measurement reflects the UNIQUE bytes that package adds to a
 * consumer bundle, not bytes shared with workspace deps. Lazy-loaded
 * dynamic-import chunks (e.g. flow's elkjs, document's PDF/DOCX
 * renderers) are NOT counted toward the main-entry budget — by design,
 * they're only fetched when the consumer invokes the feature.
 *
 * Run:
 *   bun run check-bundle-budgets                       # local: build and measurement failures, ceilings reported
 *   bun run check-bundle-budgets --mode=main           # fail on any package over its ceiling
 *   bun run check-bundle-budgets --mode=pr --base=<f>  # fail on this change's own growth (f: size-base.ts output)
 *   bun run check-bundle-budgets --json                # machine-readable
 *   bun run check-bundle-budgets --measure-only --json # sizes only, no ceilings read
 *   bun run check-bundle-budgets --update=@pyreon/pkg  # accept that package's size: set its ceiling
 *   bun run check-bundle-budgets --update              # seed new packages, raise the ones over
 */

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { staticClosureCode } from './bundle-static-closure'
import { parseSync, Visitor } from 'oxc-parser'

import { isUpdateMode } from './bundle-budget-policy'
import { isModuleEntry } from './is-entry'
import {
  formatVerdicts,
  judgeFamily,
  nextCeiling,
  resolveBasePath,
  resolveSizeMode,
  type SizeBaseFile,
} from './size-budget-policy'
import { ceilingFile, loadCeilings, resolveBudgetsDir, writeCeiling } from './size-budget-store'

// Minimal ambient for Bun's bundler, so this file stays importable from a
// program without `@types/bun`. Its sibling `check-import-budgets.ts` already
// does exactly this, for exactly this reason, and `serve-ssg.ts` before it —
// but this file did not, so the moment a test imported it for the pure helpers
// below, `@pyreon/test-utils` (types: ["vitest/globals", "node"]) failed with
// TS2868 plus two implicit-any params inferred off the missing type. The
// helpers now live in `./bundle-budget-policy`, which is the better home
// because BOTH gates consume them — this ambient is the second half, so the
// next person to import something from here does not hit the same wall.
declare const Bun: {
  version: string
  build(options: {
    entrypoints: string[]
    minify?: boolean
    target?: string
    splitting?: boolean
    outdir?: string
    external?: string[]
    define?: Record<string, string>
  }): Promise<{
    success: boolean
    logs: unknown[]
    outputs: Array<{ kind: string; path: string; text(): Promise<string> }>
  }>
}

// `import.meta.dirname` is the STANDARD property (Node 20.11+, and Bun), which is
// what every sibling gate uses (`affected.ts`, `check-coverage.ts`). The Bun-only
// `import.meta.dir` is absent from TypeScript's `ImportMeta` unless a program
// declares bun types, so reaching for it breaks any tsconfig that does not.
const REPO_ROOT = resolve(import.meta.dirname, '..')
/**
 * Process-scoped scratch root for bundler output and the barrel-safe entries.
 *
 * `mkdtemp` rather than a fixed `/tmp/check-bundle-budgets` path: on a shared
 * machine a predictable temp path can be pre-created (or symlinked) by another
 * user, and BOTH things written here are inputs the gate then trusts — the
 * generated entry is handed to the bundler, and the bundler's own output is
 * what gets measured. Redirecting either would let someone else decide the
 * number this gate reports. `mkdtemp` creates the directory atomically with
 * 0700, so neither can be pre-empted. (CodeQL `js/insecure-temporary-file`.)
 */
const SCRATCH_ROOT = mkdtempSync(join(tmpdir(), 'pyreon-bundle-budgets-'))
// Removed on exit, including the `process.exit(1)` failure paths. Without this
// every run left its measured bundles behind in the OS temp dir.
process.on('exit', () => rmSync(SCRATCH_ROOT, { recursive: true, force: true }))

/**
 * Override `<REPO_ROOT>/packages` discovery with a custom directory.
 * Used by the regression test in test-utils to point the script at a
 * controlled fixture (a fake package with an unresolvable import) and
 * assert that the `failures[]` field surfaces the bundle failure
 * instead of silently dropping it. Production runs always use the
 * real `packages/` directory.
 */
function getPackagesRoot(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--packages-root='))
  if (flag) return resolve(flag.slice('--packages-root='.length))
  return join(REPO_ROOT, 'packages')
}

interface PackageInfo {
  name: string
  dir: string
  entry: string
  externals: string[]
  /**
   * Bytes of the package's OWN built code that a consumer importing the main
   * entry statically pulls in — the transitive closure of `lib/index.js` over
   * RELATIVE static imports. Dynamic `import()` is deliberately not followed:
   * it is the lazy boundary, and the whole point of `splitting: true` below is
   * to keep those chunks out of the number.
   *
   * This is the denominator of the "did the measurement actually reach the
   * implementation?" check in {@link diagnoseMeasurement}.
   */
  reachBytes: number
}

/**
 * Published packages that declare a JS entry but have no `lib/index.js`.
 *
 * Populated by {@link findPackages} and reported as build FAILURES — see the
 * comment at the `continue` there for why a skip is the wrong answer.
 */
const missingBuilds: string[] = []

/** Whether a manifest promises a JavaScript entry point at all. */
function declaresJsEntry(pj: Record<string, unknown>): boolean {
  // `mainField`, not `main`: the script's own entry point is a function called
  // `main`, and shadowing it here is a lint error rather than a style note.
  const mainField = pj.main
  if (typeof mainField === 'string' && mainField.endsWith('.js')) return true
  const walk = (v: unknown): boolean => {
    if (typeof v === 'string') return v.endsWith('.js')
    if (v && typeof v === 'object') return Object.values(v).some(walk)
    return false
  }
  return walk(pj.exports)
}

function findPackages(): PackageInfo[] {
  const result: PackageInfo[] = []
  const packagesRoot = getPackagesRoot()
  for (const cat of readdirSync(packagesRoot)) {
    const catDir = join(packagesRoot, cat)
    // A stray FILE in the packages root used to crash discovery outright:
    // `readdirSync` on a file throws ENOTDIR, and that throw was outside the
    // per-package try/catch. The gate dying on an unrelated file is a worse
    // failure than skipping it.
    let categoryEntries: string[]
    try {
      if (!statSync(catDir).isDirectory()) continue
      categoryEntries = readdirSync(catDir)
    } catch {
      continue
    }
    for (const pkg of categoryEntries) {
      const pkgDir = join(catDir, pkg)
      const pjPath = join(pkgDir, 'package.json')
      try {
        const pj = JSON.parse(readFileSync(pjPath, 'utf8'))
        if (pj.private) continue
        // Measure the BUILT entry (`lib/index.js`), not the TS source.
        // Bundling `src/index.ts` from inside the monorepo triggers
        // package.json exports-field resolution where relative imports
        // get treated as external (Bun looks up `./batch` against the
        // package's `exports` field, finds nothing, treats as external)
        // — every package measures at ~400 bytes of pure re-exports.
        // Bundling `lib/index.js` is also more accurate: it's the
        // exact code that ships to npm, after the package's build tool
        // has already resolved imports + applied any compile-time
        // transforms.
        const entry = join(pkgDir, 'lib', 'index.js')
        if (!fileExists(entry)) {
          // A published package with no built entry used to be SKIPPED, and a
          // skip is indistinguishable from a pass: the count silently dropped
          // (71 -> 70) while the gate still printed "All 70 package(s) within
          // budget". A package that failed to build is exactly the one whose
          // size nobody is checking, so it must be LOUD.
          //
          // Not every published package HAS a JS entry, so the distinction is
          // derived from the manifest rather than a hand-maintained list that
          // would rot: the four `native-*` runtime/router packages ship Swift
          // and Kotlin SOURCE, and `@pyreon/typescript` ships tsconfig JSON.
          // None of them declares a `.js` main or export, so none is expected
          // to have `lib/index.js` — and a package that grows one, or loses
          // one, changes its own answer here without anyone editing a list.
          if (declaresJsEntry(pj)) missingBuilds.push(pj.name as string)
          continue
        }
        // Collect every bare-module specifier referenced anywhere in
        // lib/ (the ENTIRE built tree, not just the entry). Some
        // packages vendor third-party renderers into split chunks that
        // re-import other third-parties (e.g. document's pptxgenjs
        // chunk imports `jszip`). Without this, Bun.build follows the
        // import graph through the chunk and fails on the unresolved
        // transitive — silently dropped from the measurement before
        // this fix landed. See gap #2 investigation in fix PR.
        const externals = collectBareModuleImports(join(pkgDir, 'lib'))
        result.push({
          name: pj.name,
          dir: pkgDir,
          entry,
          externals,
          reachBytes: staticReachBytes(entry),
        })
      } catch {
        // Skip — no package.json or unreadable
      }
    }
  }
  return result
}

function fileExists(path: string): boolean {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * Walks every `*.js` file under `dir` and extracts non-relative module
 * specifiers from `import` / `export from` / dynamic `import()` /
 * `require()` syntax via AST analysis. Used to externalize every
 * third-party dep this package's built code touches, regardless of
 * whether it's a direct dep, optional dep, or a transitive of one of
 * those that ended up inlined into a chunk.
 *
 * Why scan source instead of using package.json `dependencies`:
 * `@pyreon/document` declares `pdfmake`/`pptxgenjs`/etc. as
 * `optionalDependencies`, but those packages' own internals
 * (`jszip`, etc.) get vendored INTO `document/lib/` as split chunks
 * that the consumer never sees declared. We need to externalize the
 * transitive too, or Bun.build fails resolving it.
 *
 * Why AST instead of regex (gap #4 closure):
 * `@pyreon/compiler` vendors its own JS transform output as STRING
 * LITERALS containing `import ... from "..."` — a regex can't tell
 * those apart from real import statements without a separate
 * sanitization pass (`validSpec` allowlist, etc.). The AST walker
 * sees a `Literal` node inside an `ExpressionStatement`, NOT an
 * `ImportDeclaration.source`, so it never confuses code-as-string with
 * actual imports. Reuses the same `parseSync` + `Visitor` pattern as
 * `@pyreon/lint`'s rule infrastructure.
 */
function collectBareModuleImports(dir: string): string[] {
  const found = new Set<string>()
  function record(spec: string | undefined): void {
    if (!spec) return
    // Skip relative + absolute paths — those aren't third-party.
    if (spec.startsWith('.') || spec.startsWith('/')) return
    // Skip node: builtins (already externalized via 'node:*').
    if (spec.startsWith('node:')) return
    // Skip @pyreon/* (already externalized via '@pyreon/*').
    if (spec.startsWith('@pyreon/')) return
    found.add(spec)
    // Also externalize subpath imports of the same package
    // (e.g. `lodash/fp`) so a partial-match against the package
    // root still externalizes correctly.
    const slashIdx = spec.startsWith('@')
      ? spec.indexOf('/', spec.indexOf('/') + 1)
      : spec.indexOf('/')
    if (slashIdx > 0) found.add(spec.slice(0, slashIdx) + '/*')
  }

  function extractFromFile(filePath: string, src: string): void {
    let program
    try {
      const result = parseSync(filePath, src, { sourceType: 'module', lang: 'js' })
      program = result.program
    } catch {
      // If oxc-parser can't parse the file (corrupt build artifact,
      // unsupported syntax, etc.), skip it — the bundle build itself
      // will surface the real error, we don't need to duplicate it.
      return
    }
    const callbacks: Record<string, (node: any) => void> = {
      // `import x from 'foo'` / `import 'foo'` / `import * as x from 'foo'`
      ImportDeclaration: (node) => {
        record(typeof node.source?.value === 'string' ? node.source.value : undefined)
      },
      // `export { x } from 'foo'` (re-export — `node.source` is non-null)
      ExportNamedDeclaration: (node) => {
        if (node.source) {
          record(typeof node.source.value === 'string' ? node.source.value : undefined)
        }
      },
      // `export * from 'foo'` / `export * as ns from 'foo'`
      ExportAllDeclaration: (node) => {
        record(typeof node.source?.value === 'string' ? node.source.value : undefined)
      },
      // Dynamic `import('foo')`. oxc represents this as ImportExpression.
      ImportExpression: (node) => {
        if (node.source?.type === 'Literal' && typeof node.source.value === 'string') {
          record(node.source.value)
        }
      },
      // CommonJS `require('foo')`. Bun's build may emit a chunk that
      // uses require for some dynamic specifiers — handle conservatively.
      CallExpression: (node) => {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return
        const arg = node.arguments?.[0]
        if (arg?.type === 'Literal' && typeof arg.value === 'string') {
          record(arg.value)
        }
      },
    }
    try {
      const visitor = new Visitor(callbacks)
      visitor.visit(program)
    } catch {
      // Defensive — if visitor throws, the partial collection is
      // still useful and the bundle build will surface real errors.
    }
  }

  function walk(d: string): void {
    let entries: string[]
    try {
      entries = readdirSync(d)
    } catch {
      return
    }
    for (const e of entries) {
      const p = join(d, e)
      let stat
      try {
        stat = statSync(p)
      } catch {
        continue
      }
      if (stat.isDirectory()) {
        walk(p)
      } else if (e.endsWith('.js')) {
        let src: string
        try {
          src = readFileSync(p, 'utf8')
        } catch {
          continue
        }
        extractFromFile(p, src)
      }
    }
  }
  walk(dir)
  return [...found]
}

/**
 * Bytes of the transitive closure of `entry` over RELATIVE static imports
 * (`import`, `export … from`, `export * from`). Dynamic `import()` is NOT
 * followed — it is the lazy-chunk boundary the budget deliberately excludes.
 *
 * Used as the denominator for the "the bundle never reached the
 * implementation" check. It is measured against the package's OWN built
 * output rather than `src/`, so it is directly comparable to the bundle:
 * the same code, before bundling and tree-shaking rather than after.
 */
function staticReachBytes(entry: string): number {
  const seen = new Set<string>()
  const stack = [entry]
  let bytes = 0
  const resolveRelative = (from: string, spec: string): string | null => {
    const base = resolve(dirname(from), spec)
    for (const candidate of [base, base + '.js', join(base, 'index.js')]) {
      try {
        if (statSync(candidate).isFile()) return candidate
      } catch {
        // not this candidate — try the next
      }
    }
    return null
  }
  while (stack.length > 0) {
    const file = stack.pop() as string
    if (seen.has(file)) continue
    seen.add(file)
    let src: string
    try {
      src = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    bytes += Buffer.byteLength(src, 'utf-8')
    let program
    try {
      program = parseSync(file, src, { sourceType: 'module', lang: 'js' }).program
    } catch {
      continue
    }
    const push = (spec: unknown): void => {
      if (typeof spec !== 'string' || !spec.startsWith('.')) return
      const resolved = resolveRelative(file, spec)
      if (resolved) stack.push(resolved)
    }
    try {
      new Visitor({
        ImportDeclaration: (node: any) => push(node.source?.value),
        ExportNamedDeclaration: (node: any) => {
          if (node.source) push(node.source.value)
        },
        ExportAllDeclaration: (node: any) => push(node.source?.value),
      }).visit(program)
    } catch {
      // Partial closure is still a useful denominator.
    }
  }
  return bytes
}

/**
 * Export specifiers in `code` whose LOCAL name is not bound anywhere in the
 * module — i.e. `export { i as Chart }` with no `i` in scope.
 *
 * Such a module is not merely small, it is INVALID: instantiating it is an
 * early SyntaxError (`Export 'i' is not defined in module`), so it could never
 * have been the code a consumer ships. Finding one is a PROOF that the
 * measurement is not a measurement — no threshold, no judgement call.
 *
 * Only specifiers on a source-less `export { … }` are checked; a re-export
 * with a source (`export { x } from './y'`) needs no local binding.
 */
function unboundExportSpecifiers(code: string): string[] {
  let program
  try {
    program = parseSync('bundle.js', code, { sourceType: 'module', lang: 'js' }).program
  } catch {
    // Unparseable output is itself a broken measurement, but the bundler would
    // have failed first; leave that path to the build error.
    return []
  }
  const bound = new Set<string>()
  const exported: { local: string; as: string }[] = []
  const bindPattern = (pat: any): void => {
    if (!pat) return
    switch (pat.type) {
      case 'Identifier':
        bound.add(pat.name)
        break
      case 'ObjectPattern':
        for (const prop of pat.properties ?? []) bindPattern(prop.value ?? prop.argument)
        break
      case 'ArrayPattern':
        for (const el of pat.elements ?? []) bindPattern(el)
        break
      case 'AssignmentPattern':
        bindPattern(pat.left)
        break
      case 'RestElement':
        bindPattern(pat.argument)
        break
      default:
        break
    }
  }
  for (const node of program.body as any[]) {
    switch (node.type) {
      case 'ImportDeclaration':
        for (const spec of node.specifiers ?? []) if (spec.local?.name) bound.add(spec.local.name)
        break
      case 'VariableDeclaration':
        for (const decl of node.declarations ?? []) bindPattern(decl.id)
        break
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
        if (node.id?.name) bound.add(node.id.name)
        break
      case 'ExportDefaultDeclaration':
        if (node.declaration?.id?.name) bound.add(node.declaration.id.name)
        break
      case 'ExportNamedDeclaration': {
        const decl = node.declaration
        if (decl?.type === 'VariableDeclaration') {
          for (const d of decl.declarations ?? []) bindPattern(d.id)
        } else if (decl?.id?.name) {
          bound.add(decl.id.name)
        }
        if (!node.source) {
          for (const spec of node.specifiers ?? []) {
            if (spec.local?.name) {
              exported.push({ local: spec.local.name, as: spec.exported?.name ?? spec.local.name })
            }
          }
        }
        break
      }
      default:
        break
    }
  }
  return exported.filter((e) => !bound.has(e.local)).map((e) => `${e.local} as ${e.as}`)
}

/** Does `entry` expose a default export? (`export *` does not carry one.) */
function hasDefaultExport(entry: string): boolean {
  let program
  try {
    const src = readFileSync(entry, 'utf8')
    program = parseSync(entry, src, { sourceType: 'module', lang: 'js' }).program
  } catch {
    return false
  }
  for (const node of program.body as any[]) {
    if (node.type === 'ExportDefaultDeclaration') return true
    if (
      node.type === 'ExportNamedDeclaration' &&
      (node.specifiers ?? []).some((s: any) => s.exported?.name === 'default')
    ) {
      return true
    }
  }
  return false
}

/**
 * The floor below which the reach-ratio check is not applied, and the ratio it
 * enforces. See {@link diagnoseMeasurement} for the reasoning and the measured
 * distribution these came from.
 */
const REACH_RATIO_FLOOR_BYTES = 4096
const MIN_REACH_RATIO = 0.05

/**
 * Decides whether a bundle is a MEASUREMENT or a measurement FAILURE, and
 * returns the failure's explanation (or `null` when the number is sound).
 *
 * Two signals, and they are not the same kind of thing:
 *
 * 1. **Invalid module (a proof).** Every export specifier must resolve to a
 *    local binding. A bundle that fails this cannot be instantiated at all, so
 *    whatever it weighs is not the weight of anything shippable. This is the
 *    signal that actually caught the whole class: a pure re-export barrel
 *    (`import { t as useHead } from './_chunks/…'; export { useHead }`) has
 *    nothing in its body referencing the imported bindings, so the bundler
 *    drops them as unused and leaves the export clause dangling. Seven
 *    packages were measuring an un-importable stub this way.
 *
 *    The bundler bug behind it is FIXED in bun 1.4.4: the same barrel now
 *    bundles to the real implementation (measured: 38 B un-importable under
 *    1.4.0, 246 B valid under 1.4.4). The detector stays, because the gate's
 *    whole job is to never report a number it cannot stand behind, and a
 *    future bundler can regress the same way; with a fixed bundler the
 *    barrel-safe repair below simply never triggers.
 *
 * 2. **Reach ratio (a heuristic backstop).** A bundle whose raw bytes are a
 *    negligible fraction of the code the entry statically reaches did not pull
 *    the implementation in. This exists to catch a future variant that is
 *    *valid* but gutted, which signal 1 cannot see.
 *
 * **Telling "shook away" apart from "genuinely small".** The ratio is
 * scale-free — a package is compared against ITS OWN reachable source, never
 * against an absolute floor — so a genuinely tiny package (`@pyreon/config`,
 * a single 973-byte module, measures 237 B ⇒ 0.24) passes for exactly the same
 * reason a large one does, and a re-export-only package over EXTERNALISED
 * workspace deps (`@pyreon/meta`, whose reachable closure is just its own
 * entry) is compared against that entry and passes at 1.26. Nothing here needs
 * a hand-maintained exemption list, which would rot. The `REACH_RATIO_FLOOR_BYTES`
 * guard only skips packages whose entire reachable tree is smaller than a few
 * KB, where minifier preamble noise makes any ratio meaningless.
 *
 * The 0.05 threshold has ~4x margin: measured across all 71 budgeted packages,
 * the lowest LEGITIMATE ratio is 0.2004 (`@pyreon/reactivity`), and the cluster
 * above it starts at 0.2020. Be honest about the limit, though — the ratio
 * alone would NOT have caught two of the seven: `@pyreon/storybook` sat at
 * 0.0687 and `@pyreon/meta` at 0.5374, a perfectly healthy-looking number for a
 * bundle that could not be imported. Signal 1 is the detector; signal 2 is
 * defence in depth, not a substitute.
 */
/** @internal exported for unit testing — see check-bundle-budgets-failures.test.ts */
export function diagnoseMeasurement(
  code: string,
  raw: number,
  pkg: Pick<PackageInfo, 'reachBytes'>,
): string | null {
  const unbound = unboundExportSpecifiers(code)
  if (unbound.length > 0) {
    const shown = unbound.slice(0, 4).join(', ')
    const more = unbound.length > 4 ? `, +${unbound.length - 4} more` : ''
    return (
      `the bundle is not a valid module — ${unbound.length} export(s) reference a binding that does not exist (${shown}${more}). ` +
      `Importing it fails with "Export '${unbound[0]?.split(' ')[0]}' is not defined in module", so ${raw} B is not this package's size. ` +
      `Likely cause: lib/index.js is a pure re-export barrel — nothing in its body uses the imported bindings, so the bundler dropped them and left the export clause dangling.`
    )
  }
  if (pkg.reachBytes >= REACH_RATIO_FLOOR_BYTES && raw < pkg.reachBytes * MIN_REACH_RATIO) {
    const pct = ((raw / pkg.reachBytes) * 100).toFixed(2)
    return (
      `the bundle is ${raw} B against ${pkg.reachBytes} B of statically-reachable built code (${pct}%, floor ${(MIN_REACH_RATIO * 100).toFixed(0)}%) — ` +
      `the implementation never made it into the measurement. ` +
      `Likely cause: the entry is a re-export barrel that shook away, or an import the bundler resolved to nothing.`
    )
  }
  return null
}

interface BundleResult {
  name: string
  raw: number
  gzip: number
  failed?: boolean
  error?: string
  /** Set when the number cannot be trusted — see {@link diagnoseMeasurement}. */
  unmeasurable?: string
  /** Set when the direct build was invalid and the barrel-safe entry was used. */
  repaired?: boolean
  /** sha256 of the exact bytes that were gzipped (the minified bundle). */
  sha256?: string
}

/** Prefix of every line of the measurement block (grep-able in a CI log). */
export const MEASURE_PREFIX = '[budget-measure]'

/**
 * The measurement as a compact, machine-readable block: one header line with
 * the bundler version and platform, one line per package, one trailer with the
 * count. Printed on EVERY run (green or red), so any two runs — a CI Build log
 * and a local run of the same commit — can be compared with `diff`.
 *
 * Why it exists: budgets have passed locally and failed in CI (or the reverse)
 * by ~1%, which was attributed to the platform's gzip. Given the same bundle
 * bytes, gzip is bit-identical on macOS arm64 and Linux arm64/x64 (bun 1.4.0
 * and 1.4.4), and so is `Bun.build` given the same `lib/`. So the difference is
 * in the INPUT, and `sha256` (of the pre-compression bundle) says which
 * packages' inputs differ.
 */
export function formatMeasureBlock(
  results: readonly BundleResult[],
  env: { bun: string; platform: string },
): string[] {
  const lines = [`${MEASURE_PREFIX} env bun=${env.bun} platform=${env.platform}`]
  for (const r of [...results].sort((a, b) => a.name.localeCompare(b.name))) {
    if (r.failed) {
      lines.push(`${MEASURE_PREFIX} ${r.name} failed`)
      continue
    }
    const flags = `${r.repaired ? ' repaired' : ''}${r.unmeasurable ? ' unmeasurable' : ''}`
    lines.push(`${MEASURE_PREFIX} ${r.name} raw=${r.raw} gzip=${r.gzip} sha256=${r.sha256 ?? '-'}${flags}`)
  }
  lines.push(`${MEASURE_PREFIX} end count=${results.length}`)
  return lines
}

/** sha256 hex of a string's UTF-8 bytes. */
export function bundleSha256(code: string): string {
  return createHash('sha256').update(code, 'utf8').digest('hex')
}

/**
 * Builds `entry` with the gate's settings. Split out of {@link measurePackage}
 * so the same options can be applied to the real entry AND to the barrel-safe
 * wrapper entry without the two drifting apart.
 */
async function buildEntry(
  pkg: PackageInfo,
  entrypoint: string,
  outSuffix: string,
): Promise<{ code: string } | { error: string }> {
  try {
    const result = await Bun.build({
      entrypoints: [entrypoint],
      minify: true,
      // target: 'bun' auto-externalizes Node builtins (`module`,
      // `child_process`, `fs`, etc.) which is what server-side
      // packages (cli, mcp, lint, compiler, zero-cli) need. For pure-
      // browser packages with no Node imports the byte output is
      // identical to target: 'browser', so this is the universal
      // choice. Pre-fix the script used 'browser' and silently failed
      // on every server-side package.
      target: 'bun',
      // splitting: true keeps dynamic imports as separate chunks so we
      // can measure ONLY the main entry-point cost — flow's elkjs and
      // document's PDF/DOCX renderers are dynamic imports that load
      // on-demand, not on page load. Without splitting, Bun inlines
      // them into the main bundle and inflates the measurement to
      // include cost the consumer never actually pays unless they
      // invoke the lazy feature.
      splitting: true,
      // outdir is required when splitting:true. Bun writes files but
      // we read from result.outputs in memory, so the directory is
      // basically a sink — set to a Bun-managed temp.
      outdir: join(SCRATCH_ROOT, `${pkg.name.replace('@', '').replace('/', '-')}${outSuffix}`),
      external: [
        // Externalize all workspace packages — measure THIS package's
        // unique bytes, not bytes from cross-package deps.
        '@pyreon/*',
        // Externalize Node built-ins so server-only packages still
        // measure the right user-bundle weight (target: 'bun' already
        // handles most of these but the explicit list is harmless).
        'node:*',
        // Every bare-module specifier the package's built code
        // imports — auto-collected from `lib/**/*.js` so the gate
        // doesn't need a hardcoded allowlist that drifts.
        ...pkg.externals,
      ],
      // Measure the PRODUCTION-stripped size — what consumers actually
      // ship after their bundler (Vite/Webpack/esbuild/etc.) applies
      // its own `define: NODE_ENV=production`. Without this, the
      // measurement INCLUDES every `if (process.env.NODE_ENV !==
      // 'production') console.warn(...)` string from the lib/ output,
      // overstating the real consumer bundle by 5-20% per package and
      // forcing budget bumps for dev-only diagnostic growth that never
      // reaches end users. Matches the convention Vue/React/Preact use
      // for their published-size baselines.
      define: { 'process.env.NODE_ENV': '"production"' },
    })
    if (!result.success) {
      return { error: result.logs.map((l) => String(l)).join('\n') }
    }
    // The entry-point output PLUS every chunk it imports statically; chunks
    // behind a dynamic import() stay out. Measuring the entry file alone made
    // the number depend on where the bundler happened to draw chunk
    // boundaries — see bundle-static-closure.ts.
    const code = await staticClosureCode(result.outputs)
    if (code === null) return { error: 'no entry-point output' }
    return { code }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Writes a wrapper module that re-exports everything from `pkg.entry`, so the
 * bundler sees the package's exports being CONSUMED rather than merely
 * re-declared. That is the whole repair: a pure re-export barrel has nothing in
 * its body referencing its imported bindings, so bundling it directly lets them
 * shake away; making the entry a dependency of a module that re-exports it
 * keeps them live.
 *
 * `export *` deliberately does not carry `default`, so the default re-export is
 * emitted only when the entry actually has one — an unconditional
 * `export { default } from …` is a build error against a package without it.
 */
function writeBarrelSafeEntry(pkg: PackageInfo): string {
  const dir = join(SCRATCH_ROOT, 'barrel-safe', pkg.name.replace(/[@/]/g, '-'))
  mkdirSync(dir, { recursive: true })
  const file = join(dir, 'entry.js')
  const spec = JSON.stringify(pkg.entry)
  const lines = [`export * from ${spec}`]
  if (hasDefaultExport(pkg.entry)) lines.push(`export { default } from ${spec}`)
  writeFileSync(file, lines.join('\n') + '\n')
  return file
}

/**
 * Measures one package, and refuses to report a number it cannot stand behind.
 *
 * The direct build is tried FIRST and kept whenever it is sound, because it is
 * the exact thing a consumer bundles — measured across all 71 budgeted
 * packages, the barrel-safe wrapper changes 64 of them by 0.0-0.5% but it is
 * not free everywhere: an entry with no named exports at all (`@pyreon/zero-cli`
 * is a side-effect-only CLI script) or one whose only export is `default` under
 * `sideEffects: false` (`@pyreon/create-zero`) collapses to 28 B through the
 * wrapper. So the wrapper is a REPAIR applied on proof of breakage, never a
 * blanket change of how everything is measured — which also means this fix
 * re-baselines only the packages that were actually wrong.
 */
async function measurePackage(pkg: PackageInfo): Promise<BundleResult> {
  const direct = await buildEntry(pkg, pkg.entry, '')
  if ('error' in direct) {
    return { name: pkg.name, raw: 0, gzip: 0, failed: true, error: direct.error }
  }

  let code = direct.code
  let repaired = false
  let diagnosis = diagnoseMeasurement(code, Buffer.byteLength(code, 'utf-8'), pkg)

  // `PYREON_BUDGETS_NO_REPAIR=1` disables the repair so the DETECTOR can be
  // asserted on its own. Without it the two are only testable together, and a
  // detector that is never exercised against a broken bundle is a detector
  // nobody has proof of — see the regression test in `@pyreon/test-utils`.
  if (diagnosis !== null && process.env.PYREON_BUDGETS_NO_REPAIR !== '1') {
    const wrapped = await buildEntry(pkg, writeBarrelSafeEntry(pkg), '-barrel-safe')
    if (!('error' in wrapped)) {
      const rawWrapped = Buffer.byteLength(wrapped.code, 'utf-8')
      const wrappedDiagnosis = diagnoseMeasurement(wrapped.code, rawWrapped, pkg)
      if (wrappedDiagnosis === null) {
        code = wrapped.code
        repaired = true
        diagnosis = null
      } else {
        diagnosis = wrappedDiagnosis
      }
    }
  }

  const raw = Buffer.byteLength(code, 'utf-8')
  const gzip = gzipSync(code, { level: 9 }).byteLength
  const sha256 = bundleSha256(code)
  // A number we cannot stand behind is reported as a FAILURE, never as a small
  // size. A budget compared against a bundle that shook to nothing is a gate
  // that cannot fail, which this repo treats as worse than no gate at all.
  if (diagnosis !== null) {
    return { name: pkg.name, raw, gzip, sha256, unmeasurable: diagnosis }
  }
  return { name: pkg.name, raw, gzip, sha256, ...(repaired ? { repaired: true } : {}) }
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const jsonMode = args.includes('--json')
  // `--update=@pyreon/pkg` is the DOCUMENTED scoped form, but `includes` is an
  // exact match, so it never enabled update mode — the scoped form silently ran
  // as a plain check for its whole life. Latent until this change made the scoped
  // form the only way to lower a budget; a unit test on the pure helper passed
  // throughout, which is why the end-to-end run is the one that found it.
  const updateMode = isUpdateMode(args)

  const packages = findPackages()

  // Measure all in parallel — Bun.build is async and CPU-light per call.
  const results: BundleResult[] = await Promise.all(packages.map(measurePackage))
  const measureEnv = { bun: Bun.version, platform: `${process.platform}-${process.arch}` }
  if (!jsonMode) {
    const unbuilt = missingBuilds.map((name) => ({ name, raw: 0, gzip: 0, failed: true }))
    // eslint-disable-next-line no-console
    for (const line of formatMeasureBlock([...results, ...unbuilt], measureEnv)) console.log(line)
  }
  // A package whose bundle could not be trusted is EXCLUDED from `measured`.
  // Leaving it in would let a meaningless number be compared against a budget
  // and pass — the exact shape this gate exists to make impossible.
  const measured = results
    .filter((r) => !r.failed && !r.unmeasurable)
    .sort((a, b) => a.name.localeCompare(b.name))
  const unmeasurable = results
    .filter((r) => r.unmeasurable)
    .map((r) => ({ name: r.name, raw: r.raw, reason: r.unmeasurable as string }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const repaired = results
    .filter((r) => r.repaired)
    .map((r) => r.name)
    .sort()
  const failures = [
    ...results.filter((r) => r.failed).map((r) => ({ name: r.name, error: r.error ?? 'unknown' })),
    // A package that never built is a failure to MEASURE, not an absence of
    // one — reported alongside bundle errors rather than dropped.
    ...missingBuilds.map((name) => ({
      name,
      error:
        'no lib/index.js — the package declares a JS entry but was not built. Run `bun scripts/bootstrap.ts`.',
    })),
  ].sort((a, b) => a.name.localeCompare(b.name))

  const budgetsDir = resolveBudgetsDir(args, REPO_ROOT)

  // ── Measure only: sizes for another program (size-base.ts), no verdict ──
  //
  // Reads no ceilings, so the tree being measured does not need any: the base
  // of a pull request is measured with THIS script, and a base commit is not
  // required to carry the same layout. Build failures are reported in the JSON
  // and are the caller's to judge, so this exits 0.
  if (args.includes('--measure-only')) {
    // eslint-disable-next-line no-console
    if (jsonMode) console.log(JSON.stringify({ measured, failures, unmeasurable, repaired, env: measureEnv }, null, 2))
    return
  }

  // ── Update mode: set ceilings from the measurement and exit ───────────
  if (updateMode) {
    if (unmeasurable.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `✗ Cannot set ceilings — ${unmeasurable.length} package(s) could not be measured:`,
      )
      for (const u of unmeasurable) {
        // eslint-disable-next-line no-console
        console.error(`  ${u.name}: ${u.reason}`)
      }
      process.exit(1)
    }
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`✗ Cannot set ceilings — ${failures.length} package(s) failed to bundle:`)
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.error(`  ${f.name}: ${f.error.split('\n')[0]}`)
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nFix the bundle errors first (likely an unresolved third-party dep that needs to be added to the package's package.json so the auto-external scan picks it up), then re-run --update.`,
      )
      process.exit(1)
    }
    // `--update=@pyreon/foo` names one package: its ceiling is set from the
    // measurement, up or down, and that edit is what accepts growth on a pull
    // request. Unnamed, `--update` is a ratchet that only seeds and raises —
    // see `nextCeiling` for why it never lowers.
    const only = args.find((a) => a.startsWith('--update='))?.slice('--update='.length)
    if (only !== undefined && !measured.some((r) => r.name === only)) {
      // eslint-disable-next-line no-console
      console.error(`✗ --update=${only}: no such measured package. Names are the package.json "name", e.g. @pyreon/core.`)
      process.exit(1)
    }
    const previous = loadCeilings(budgetsDir).bundle
    const changed: string[] = []
    const refused: string[] = []
    for (const r of measured) {
      if (only !== undefined && r.name !== only) continue
      const prev = previous[r.name]
      const { value, action } = nextCeiling(prev, r.gzip, only !== undefined)
      if (action === 'refused') {
        refused.push(`${r.name} ${prev} → ${value} (measured ${r.gzip})`)
        continue
      }
      if (action === 'keep') continue
      const file = writeCeiling(budgetsDir, 'bundle', r.name, value)
      const mark = action === 'lower' ? '▼' : action === 'seed' ? '+' : '▲'
      changed.push(`${mark} ${r.name} ${prev ?? 'none'} → ${value} (measured ${r.gzip}) in ${file}`)
    }
    /* eslint-disable no-console */
    console.log(`✓ bundle ceilings — ${changed.length} changed, ${measured.length - changed.length} unchanged`)
    for (const l of changed) console.log(`  ${l}`)
    for (const l of refused) {
      console.log(
        `  ⚠ not lowered: ${l} — an unscoped --update never lowers, because a stale \`lib/\` can only measure LOW. If this shrink is real, scope it: --update=${l.split(' ')[0]}`,
      )
    }
    /* eslint-enable no-console */
    return
  }

  // ── Check mode: judge every measured package ─────────────────────────
  const mode = resolveSizeMode(args, process.env)
  const ceilings = loadCeilings(budgetsDir).bundle
  const basePath = resolveBasePath(args, process.env)
  let base: SizeBaseFile | undefined
  if (mode === 'pr') {
    if (basePath === undefined) {
      // eslint-disable-next-line no-console
      console.error(
        '✗ check-bundle-budgets: pr mode needs the base measurement. Run `bun scripts/size-base.ts --out=<file>` and pass --base=<file> (or PYREON_SIZE_BASE).',
      )
      process.exit(1)
    }
    try {
      base = JSON.parse(readFileSync(basePath, 'utf8')) as SizeBaseFile
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `✗ check-bundle-budgets: cannot read the base measurement at ${basePath} (${err instanceof Error ? err.message : String(err)}). The "Prepare size base" step writes it; fix that step first.`,
      )
      process.exit(1)
    }
  }

  const verdicts = judgeFamily(
    mode,
    measured.map((r) => ({ id: r.name, size: r.gzip, ceiling: ceilings[r.name] })),
    base?.bundle,
  )

  interface Violation {
    name: string
    current: number
    budget: number
    overBy: number
    overByPct: number
    code: string
    message: string
  }
  // `violations` and `missing` keep the shape `pyreon doctor` reads. A growth
  // failure is a violation too: `budget` is then the size the change was
  // allowed to reach.
  const violations: Violation[] = []
  const missing: { name: string; current: number }[] = []
  for (const v of verdicts) {
    if (!v.fail) continue
    if (v.code === 'missing-ceiling' || v.ceiling === undefined) {
      missing.push({ name: v.id, current: v.size })
      continue
    }
    const limit = v.code === 'growth' && v.baseSize !== undefined ? v.baseSize : v.ceiling
    const overBy = v.size - limit
    violations.push({
      name: v.id,
      current: v.size,
      budget: limit,
      overBy,
      overByPct: limit > 0 ? (overBy / limit) * 100 : 0,
      code: v.code,
      message: v.message,
    })
  }
  const notes = verdicts.filter((v) => !v.fail && v.code !== 'ok').map((v) => ({ name: v.id, code: v.code, message: v.message }))

  if (jsonMode) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        { mode, violations, missing, failures, unmeasurable, repaired, notes, measured, env: measureEnv },
        null,
        2,
      ),
    )
  } else {
    /* eslint-disable no-console */
    const { lines } = formatVerdicts('bundle sizes', mode, verdicts)
    for (const line of lines) (line.startsWith('✓') || line.startsWith('  ·') ? console.log : console.error)(line)
    if (missing.length > 0) {
      console.error(
        `\nNew package? Run \`bun run check-bundle-budgets --update\` to seed its ceiling in scripts/size-budgets/packages/, and review the value in the diff.`,
      )
    }
    if (violations.length > 0) {
      console.error(
        `\nCeilings live one file per package (e.g. scripts/size-budgets/${ceilingFile('bundle', violations[0]?.name ?? '@pyreon/core')}); \`--update=<package>\` writes the value, never edit it by hand.`,
      )
    }
    if (repaired.length > 0) {
      // The repair is reported rather than applied silently: a barrel that only
      // measures correctly through the wrapper is a real condition of the built
      // output, and a gate that quietly heals one hides it until it changes shape.
      console.log(
        `  note: ${repaired.length} package(s) bundle their entry to an invalid module directly and were measured through the barrel-safe entry: ${repaired.join(', ')}`,
      )
    }
    if (unmeasurable.length > 0) {
      console.error(
        `\n✗ ${unmeasurable.length} package(s) could not be MEASURED (their ceiling is guarding nothing):\n`,
      )
      for (const u of unmeasurable) console.error(`  ${u.name}: ${u.reason}`)
      console.error(
        `\nThis is a failure of the gate, not of the package: a ceiling compared against a bundle that shook to nothing can never fail, which is worse than having none. Do NOT "fix" it by lowering the ceiling to the reported size. Fix the measurement.`,
      )
    }
    if (failures.length > 0) {
      console.error(`\n✗ ${failures.length} package(s) failed to bundle:\n`)
      for (const f of failures) console.error(`  ${f.name}: ${f.error.split('\n')[0]}`)
      console.error(
        `\nThese packages are not contributing to the size gate — likely an unresolved third-party dep. The auto-external scan walks each package's lib/ tree for bare-module imports, but it can miss specifiers buried in dynamic strings or vendored chunks. Either declare the dep in the package's package.json or add it explicitly.`,
      )
    }
    /* eslint-enable no-console */
  }

  if (violations.length > 0 || missing.length > 0 || failures.length > 0 || unmeasurable.length > 0) {
    process.exit(1)
  }
}

// Guarded so this file can be IMPORTED to unit-test its pure helpers; unguarded,
// importing it ran the whole gate and hit `process.exit(1)` inside vitest.
if (isModuleEntry(import.meta)) await main()
