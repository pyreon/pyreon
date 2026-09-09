#!/usr/bin/env bun
/**
 * check-bundle-budgets — bundle-size budget gate.
 *
 * For every published `@pyreon/*` package, bundles the BUILT main entry
 * (`lib/index.js` — the exact code that ships to npm, not the TS source)
 * with Bun's bundler (minified, workspace-externalized) and asserts the
 * gzipped size is ≤ the budget locked in `scripts/bundle-budgets.json`.
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
 * the tool that flags bundle regressions. A locked-budget CI gate is
 * the structural answer: any PR that grows a main entry past its
 * budget fails to merge until the budget is explicitly bumped.
 *
 * Externalization: bundling externalizes `@pyreon/*` and `node:*` so
 * each measurement reflects the UNIQUE bytes that package adds to a
 * consumer bundle, not bytes shared with workspace deps. Lazy-loaded
 * dynamic-import chunks (e.g. flow's elkjs, document's PDF/DOCX
 * renderers) are NOT counted toward the main-entry budget — by design,
 * they're only fetched when the consumer invokes the feature.
 *
 * Run:
 *   bun run check-bundle-budgets          # exit non-zero if over budget
 *   bun run check-bundle-budgets --json   # machine-readable
 *   bun run check-bundle-budgets --update # regenerate budgets from current sizes
 *                                         # (use AFTER intentional growth)
 */

import { mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { parseSync, Visitor } from 'oxc-parser'

import { isUpdateMode, shouldLowerUnscoped } from './bundle-budget-policy'
import { isModuleEntry } from './is-entry'

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
    outputs: Array<{ kind: string; text(): Promise<string> }>
  }>
}

// `import.meta.dirname` is the STANDARD property (Node 20.11+, and Bun), which is
// what every sibling gate uses (`affected.ts`, `check-coverage.ts`). The Bun-only
// `import.meta.dir` is absent from TypeScript's `ImportMeta` unless a program
// declares bun types, so reaching for it breaks any tsconfig that does not.
const REPO_ROOT = resolve(import.meta.dirname, '..')
/**
 * Override the budgets file. Companion to `--packages-root=`, and used by the
 * same regression test: the thin-headroom ratchet is a property of the FILE, so
 * it can only be exercised against a controlled one. Production runs never pass it.
 */
function getBudgetsPath(): string {
  const flag = process.argv.find((arg) => arg.startsWith('--budgets='))
  if (flag) return resolve(flag.slice('--budgets='.length))
  return join(REPO_ROOT, 'scripts', 'bundle-budgets.json')
}

const BUDGETS_PATH = getBudgetsPath()

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
 * The gzip output differs slightly between the machine a contributor measures
 * on (macOS) and the ubuntu runner that gates the PR — measured at ~177 B on a
 * 16.5 KB package, about 1.1%. A budget with LESS headroom than that delta is
 * not merely tight, it is UN-SATISFIABLE: the same commit gets a different
 * verdict per machine, so `validate-fast` passes locally and CI goes red, and
 * re-running locally only reconfirms the wrong answer.
 *
 * This is the same defect class as the empty-bundle detection above — a
 * measurement the gate cannot make reliably, reported as a verdict about the
 * package — so it is checked in the same place rather than left as advice
 * printed after a failure has already been declared.
 *
 * Note tight is not itself bad: a small budget makes the gate MORE sensitive to
 * real growth, which is the point. The failure mode is specifically headroom
 * below the measurement's own noise.
 */
const GZIP_PLATFORM_VARIANCE = 0.015
const GZIP_PLATFORM_VARIANCE_FLOOR_BYTES = 64

/**
 * Prints the KNOWN thin-headroom debt on every run, green or red.
 *
 * Grandfathered entries are visible rather than silent: a list that is only
 * consulted when something fails is a list nobody reads, and the whole failure
 * mode here is that the condition is invisible until CI disagrees with you.
 */
function printThinHeadroom(
  known: { name: string; current: number; budget: number; headroom: number; required: number }[],
  recovered: string[],
): void {
  /* eslint-disable no-console */
  if (known.length > 0) {
    console.log(
      `  ⚠ ${known.length} budget(s) sit below the ~${(GZIP_PLATFORM_VARIANCE * 100).toFixed(1)}% macOS/ubuntu gzip variance and cannot be measured reliably (grandfathered in "_thinHeadroom"):`,
    )
    for (const t of known) {
      console.log(
        `      ${t.name}: ${t.headroom} B of headroom, needs ${Math.ceil(t.required)} B — raise to ${Math.ceil(t.current + t.required)} B to retire it`,
      )
    }
  }
  for (const name of recovered) {
    console.log(
      `  ✓ ${name} now has enough headroom — remove it from "_thinHeadroom" in scripts/bundle-budgets.json (the list only shrinks)`,
    )
  }
  /* eslint-enable no-console */
}

/** The minimum headroom a budget needs to be measurable on both platforms. */
function requiredHeadroom(measured: number): number {
  return Math.max(GZIP_PLATFORM_VARIANCE_FLOOR_BYTES, measured * GZIP_PLATFORM_VARIANCE)
}

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
function diagnoseMeasurement(code: string, raw: number, pkg: PackageInfo): string | null {
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
    // Pick ONLY the entry-point output (kind: 'entry-point') —
    // ignore split chunks emitted from dynamic imports.
    const out = result.outputs.find((o) => o.kind === 'entry-point')
    if (!out) return { error: 'no entry-point output' }
    return { code: await out.text() }
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
  // A number we cannot stand behind is reported as a FAILURE, never as a small
  // size. A budget compared against a bundle that shook to nothing is a gate
  // that cannot fail, which this repo treats as worse than no gate at all.
  if (diagnosis !== null) {
    return { name: pkg.name, raw, gzip, unmeasurable: diagnosis }
  }
  return { name: pkg.name, raw, gzip, ...(repaired ? { repaired: true } : {}) }
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

  // ── Update mode: write fresh budgets and exit ─────────────────────
  if (updateMode) {
    if (unmeasurable.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `✗ Cannot regenerate budgets — ${unmeasurable.length} package(s) could not be measured:`,
      )
      for (const u of unmeasurable) {
        // eslint-disable-next-line no-console
        console.error(`  ${u.name}: ${u.reason}`)
      }
      process.exit(1)
    }
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`✗ Cannot regenerate budgets — ${failures.length} package(s) failed to bundle:`)
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
    // Previous budgets, so `--update` can be a RATCHET rather than a reset.
    //
    // It used to rewrite EVERY entry to `current × 1.25` unconditionally, which
    // meant a PR that legitimately grew ONE package silently RAISED the budget
    // of every other package that happened to sit below its own — handing out
    // headroom nobody asked for, buried in a ~50-line diff no reviewer can read
    // as anything but noise. That is the same failure the lint baseline is
    // designed against: a ceiling that can be lifted wholesale is not a ratchet.
    let previous: Record<string, number> = {}
    try {
      const raw = JSON.parse(readFileSync(BUDGETS_PATH, 'utf8')) as Record<string, unknown>
      for (const [k, v] of Object.entries(raw)) {
        if (!k.startsWith('_') && typeof v === 'number') previous[k] = v
      }
    } catch {
      previous = {}
    }
    // Optional scope: `--update=@pyreon/foo` touches only that package. Useful
    // when you know exactly which budget your change moved.
    const refused: string[] = []
    const onlyArg = args.find((a) => a.startsWith('--update='))
    const only = onlyArg?.slice('--update='.length)

    let carriedThinHeadroom: unknown
    try {
      carriedThinHeadroom = (
        JSON.parse(readFileSync(BUDGETS_PATH, 'utf8')) as Record<string, unknown>
      )._thinHeadroom
    } catch {
      carriedThinHeadroom = undefined
    }
    const budgets: Record<string, unknown> = {
      _doc: "Per-package main-entry budgets in BYTES (minified + gzipped). Externalizes @pyreon/*, node:*, and every bare-module import auto-collected from each package's lib/ tree — this is the unique code each package adds to a consumer bundle. Seeded at 25% headroom. `--update` is a RATCHET: it RAISES a budget only for a package that is actually OVER (intentional growth, reviewed in the same PR), and LOWERS one only when you NAME it (`--update=@pyreon/pkg`) — a stale or partial lib/ measures SMALLER than the real package, so an unscoped drop is far more likely to be a bad measurement than a real shrink. Everything else stays byte-identical.",
      _units: 'bytes (gzipped)',
      ...(carriedThinHeadroom === undefined ? {} : { _thinHeadroom: carriedThinHeadroom }),
    }
    const raised: string[] = []
    const lowered: string[] = []
    const seeded: string[] = []
    for (const r of measured) {
      const ideal = Math.ceil((r.gzip * 1.25) / 256) * 256
      const prev = previous[r.name]
      if (only !== undefined && r.name !== only && prev !== undefined) {
        budgets[r.name] = prev
        continue
      }
      if (prev === undefined) {
        budgets[r.name] = ideal
        seeded.push(`${r.name} → ${ideal}`)
      } else if (r.gzip > prev) {
        // OVER budget: this is the intentional-growth case the doc describes.
        budgets[r.name] = ideal
        raised.push(`${r.name} ${prev} → ${ideal} (measured ${r.gzip})`)
      } else if (ideal < prev) {
        // Shrank: tighten. A ratchet that never lowers stops protecting anything.
        //
        // But a LARGE apparent shrink is almost never a real one — it is a stale
        // or partial `lib/`, which `--update` otherwise commits as truth. That
        // happened: `@pyreon/validate` was ratcheted 15872 → 15360, a value that
        // implies a ~12288 B measurement, while the package really measures
        // ~15016 B locally and 15473 B on CI. The budget landed BELOW what CI
        // measures, so the gate failed on a package the branch never touched —
        // twice, on two different branches, because the wrong value was committed
        // and travelled.
        //
        // A drop past this threshold is therefore treated as unmeasured rather
        // than as shrinkage: keep the previous budget and say why. Real shrinkage
        // of this size is rare and gets there in steps, or via
        // `--update=@pyreon/pkg`, which is scoped and deliberate.
        if (!shouldLowerUnscoped(only !== undefined)) {
          const dropPct = ((prev - ideal) / prev) * 100
          budgets[r.name] = prev
          refused.push(`${r.name} ${prev} → ${ideal} (−${dropPct.toFixed(1)}%, measured ${r.gzip})`)
          continue
        }
        budgets[r.name] = ideal
        lowered.push(`${r.name} ${prev} → ${ideal}`)
      } else {
        // Within budget and not meaningfully smaller — leave it EXACTLY alone,
        // so the diff names only what actually moved.
        budgets[r.name] = prev
      }
    }
    writeFileSync(BUDGETS_PATH, JSON.stringify(budgets, null, 2) + '\n')
    /* eslint-disable no-console */
    const unchanged = measured.length - raised.length - lowered.length - seeded.length
    console.log(
      `✓ bundle budgets — ${raised.length} raised, ${lowered.length} lowered, ${seeded.length} seeded, ${unchanged} unchanged`,
    )
    for (const l of raised) console.log(`  ▲ ${l}`)
    for (const l of lowered) console.log(`  ▼ ${l}`)
    for (const l of seeded) console.log(`  + ${l}`)
    for (const l of refused) {
      console.log(
        `  ⚠ not lowered: ${l} — an unscoped --update never lowers, because a stale \`lib/\` can only measure LOW. If this shrink is real, scope it: --update=${l.split(' ')[0]}`,
      )
    }
    /* eslint-enable no-console */
    return
  }

  // ── Check mode: load budgets, compare, fail on drift ─────────────
  let budgetsRaw: string
  try {
    budgetsRaw = readFileSync(BUDGETS_PATH, 'utf8')
  } catch {
    // eslint-disable-next-line no-console
    console.error(
      '✗ scripts/bundle-budgets.json not found. Run `bun run check-bundle-budgets --update` to seed it.',
    )
    process.exit(1)
  }
  const budgets = JSON.parse(budgetsRaw) as Record<string, number | string | object>

  interface Violation {
    name: string
    current: number
    budget: number
    overBy: number
    overByPct: number
  }
  interface MissingBudget {
    name: string
    current: number
  }

  const violations: Violation[] = []
  const missing: MissingBudget[] = []

  // ── Un-satisfiable budgets (headroom below the platform gzip variance) ──
  //
  // Ratcheted rather than gated outright, and the distinction is deliberate: a
  // thin budget is a defect in the BUDGET FILE, not in the package, so failing
  // on the ones that already exist would redden every unrelated PR — the
  // red-on-arrival shape this repo treats as a dead gate. What must not happen
  // is CREATING a new one, so an entry that is thin and not grandfathered in
  // `_thinHeadroom` fails, and the list can only shrink.
  const thinRaw = budgets._thinHeadroom
  const grandfathered = new Set(
    thinRaw && typeof thinRaw === 'object' && !Array.isArray(thinRaw)
      ? Object.keys(thinRaw as Record<string, string>).filter((k) => !k.startsWith('_'))
      : [],
  )
  interface ThinBudget {
    name: string
    current: number
    budget: number
    headroom: number
    required: number
  }
  const thinNew: ThinBudget[] = []
  const thinKnown: ThinBudget[] = []
  const recovered: string[] = []

  for (const r of measured) {
    const budget = budgets[r.name]
    if (typeof budget !== 'number') {
      missing.push({ name: r.name, current: r.gzip })
      continue
    }
    const headroom = budget - r.gzip
    const required = requiredHeadroom(r.gzip)
    if (headroom >= 0 && headroom < required) {
      const entry = { name: r.name, current: r.gzip, budget, headroom, required }
      if (grandfathered.has(r.name)) thinKnown.push(entry)
      else thinNew.push(entry)
    } else if (grandfathered.has(r.name)) {
      recovered.push(r.name)
    }
    if (r.gzip > budget) {
      const overBy = r.gzip - budget
      violations.push({
        name: r.name,
        current: r.gzip,
        budget,
        overBy,
        overByPct: (overBy / budget) * 100,
      })
    }
  }

  if (jsonMode) {
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          violations,
          missing,
          failures,
          unmeasurable,
          repaired,
          thinNew,
          thinKnown,
          recovered,
          measured,
        },
        null,
        2,
      ),
    )
  } else if (
    violations.length === 0 &&
    missing.length === 0 &&
    failures.length === 0 &&
    unmeasurable.length === 0 &&
    thinNew.length === 0
  ) {
    // eslint-disable-next-line no-console
    console.log(`✓ All ${measured.length} package(s) within budget.`)
    if (repaired.length > 0) {
      // The repair is reported rather than applied silently: a barrel that only
      // measures correctly through the wrapper is a real condition of the built
      // output, and a gate that quietly heals one hides it until it changes shape.
      // eslint-disable-next-line no-console
      console.log(
        `  note: ${repaired.length} package(s) bundle their entry to an invalid module directly and were measured through the barrel-safe entry: ${repaired.join(', ')}`,
      )
    }
  } else {
    if (violations.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`✗ ${violations.length} package(s) over budget:\n`)
      for (const v of violations) {
        // A budget whose headroom is thinner than the measurement's own
        // variance fails on CI while passing locally, which reads as a
        // mystery rather than as a budget that was set too tight. gzip output
        // differs slightly between macOS and the ubuntu runner — measured at
        // ~177 B on a 16.5 KB package, about 1.1% — so say so when the overage
        // is inside that band, instead of leaving the next person to rediscover
        // it. (`--update` gives 25% headroom; these are hand-set values.)
        const withinNoise = v.overBy <= requiredHeadroom(v.current)
        const note = withinNoise
          ? `\n      ↳ that is within the ~1.5% macOS/ubuntu gzip variance — this budget has too little headroom to be measured reliably. Raise it clear of the noise rather than shaving the package.`
          : ''
        // eslint-disable-next-line no-console
        console.error(
          `  ${v.name}: ${(v.current / 1024).toFixed(2)} KB > budget ${(v.budget / 1024).toFixed(2)} KB (over by ${(v.overBy / 1024).toFixed(2)} KB, +${v.overByPct.toFixed(1)}%)${note}`,
        )
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nIf this growth is intentional, bump the budget in scripts/bundle-budgets.json. The bump itself is a PR signal: "this package legitimately got bigger".`,
      )
    }
    if (missing.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n✗ ${missing.length} package(s) missing budget entry:\n`)
      for (const m of missing) {
        // eslint-disable-next-line no-console
        console.error(`  ${m.name}: ${(m.current / 1024).toFixed(2)} KB (no entry)`)
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nNew package? Run \`bun run check-bundle-budgets --update\` to add it. Review the value in the diff.`,
      )
    }
    if (thinNew.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `\n✗ ${thinNew.length} budget(s) have LESS headroom than the measurement's own noise:\n`,
      )
      for (const t of thinNew) {
        // eslint-disable-next-line no-console
        console.error(
          `  ${t.name}: budget ${t.budget} B is only ${t.headroom} B above the measured ${t.current} B — needs at least ${Math.ceil(t.required)} B (~${(GZIP_PLATFORM_VARIANCE * 100).toFixed(1)}%). Suggested budget: ${Math.ceil(t.current + t.required)} B.`,
        )
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nA budget this tight is not strict, it is UN-SATISFIABLE: gzip differs by ~1.1% between macOS and the ubuntu runner, so the same commit passes locally and fails CI, and re-running locally only reconfirms the wrong answer. Raise the budget clear of the noise. If it genuinely must stay this tight, add the package to "_thinHeadroom" in scripts/bundle-budgets.json with a reason — that list can only shrink.`,
      )
    }
    if (unmeasurable.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        `\n✗ ${unmeasurable.length} package(s) could not be MEASURED (their budget is guarding nothing):\n`,
      )
      for (const u of unmeasurable) {
        // eslint-disable-next-line no-console
        console.error(`  ${u.name}: ${u.reason}`)
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nThis is a failure of the gate, not of the package: a budget compared against a bundle that shook to nothing can never fail, which is worse than having no budget. Do NOT "fix" it by lowering the budget to the reported size. Fix the measurement.`,
      )
    }
    if (failures.length > 0) {
      // eslint-disable-next-line no-console
      console.error(`\n✗ ${failures.length} package(s) failed to bundle:\n`)
      for (const f of failures) {
        // eslint-disable-next-line no-console
        console.error(`  ${f.name}: ${f.error.split('\n')[0]}`)
      }
      // eslint-disable-next-line no-console
      console.error(
        `\nThese packages are not contributing to the budget gate — likely an unresolved third-party dep. The auto-external scan walks each package's lib/ tree for bare-module imports, but it can miss specifiers buried in dynamic strings or vendored chunks. Either declare the dep in the package's package.json or add it explicitly.`,
      )
    }
  }

  if (!jsonMode) printThinHeadroom(thinKnown, recovered)

  if (
    violations.length > 0 ||
    missing.length > 0 ||
    failures.length > 0 ||
    unmeasurable.length > 0 ||
    thinNew.length > 0
  ) {
    process.exit(1)
  }
}

// Guarded so this file can be IMPORTED to unit-test its pure helpers; unguarded,
// importing it ran the whole gate and hit `process.exit(1)` inside vitest.
if (isModuleEntry(import.meta)) await main()
