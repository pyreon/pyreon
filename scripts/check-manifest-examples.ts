#!/usr/bin/env bun
/**
 * Check every package manifest's `api[].example` (and `longExample`)
 * against the LIVE package types.
 *
 * ## Why this gate exists
 *
 * `packages/<cat>/<pkg>/src/manifest.ts` is the single source of truth for
 * the AI-facing surfaces: `bun run gen-docs` renders each `api[].example`
 * VERBATIM into `packages/tools/mcp/src/api-reference.ts` (what AI coding
 * assistants read) and into `llms.txt` / `llms-full.txt`. The `signature`
 * and `example` fields are HAND-MAINTAINED and drift silently from the
 * shipped exports (the `ApiEntry.signature` JSDoc says so explicitly).
 *
 * Drift here is worse than stale prose — a manifest `@example` that
 * wouldn't typecheck against the shipped API actively TEACHES broken code
 * to every assistant that reads the generated api-reference. The 2026-07
 * hooks excellence pass (PR #2176) found 6 hooks whose manifest examples
 * called removed/renamed/reshaped exports (`useEventListener` documented
 * with the args in the wrong order, `useFocusTrap` documented with a 2nd
 * arg it never had, `useControllableState`/`useClipboard`/`useDialog`/
 * `useInfiniteScroll` documented with wrong return shapes). None of it
 * would typecheck. This gate makes that class impossible to reintroduce.
 *
 * ## How it works
 *
 * For every package with a `src/manifest.ts`:
 *   1. Load the manifest (its `default` export).
 *   2. For each `api[].example` + the `longExample`, synthesize a `.tsx`
 *      file: a preamble that `import`s the package's value-kind API
 *      symbols the example references-but-doesn't-declare (so those
 *      symbols resolve to their REAL shipped types), then the example
 *      body verbatim.
 *   3. `tsc --noEmit` the whole batch against a permissive tsconfig that
 *      aliases every `@pyreon/*` to its workspace `src/` entry.
 *   4. Classify each error located in an example file. DRIFT codes
 *      (missing export, wrong argument shape/count, unknown property,
 *      no-overload-match, object-literal-excess-property, …) FAIL the
 *      gate. Codes that fire on the example's own undeclared helper /
 *      continuation symbols (`Cannot find name`, `Cannot find module`,
 *      duplicate-identifier) are TOLERATED — the examples are snippets,
 *      not standalone programs, and we only assert that the OWNING
 *      package's symbols are called correctly.
 *
 * ## Scope (deliberately staged)
 *
 * The gate covers EVERY package that has a `src/manifest.ts`. A `NON_ENFORCED`
 * map carries two ratchet-shrink-only kinds of entry: (1) real drift being
 * fixed in a separate in-flight PR (named, removed on merge), and (2)
 * harness-limited packages the example-typecheck can't reliably cover
 * (untyped ambient example data, DOM-global name collisions, alt-JSX
 * namespaces, strict-mode-only schema libs). Those packages are still
 * typechecked; their findings are reported as WARNINGS instead of failing.
 * `HARNESS_EXEMPT` (mcp only) is skipped entirely — its api[] entries are
 * MCP tool names, not code exports.
 *
 * Exits 0 when every ENFORCED package is clean, 1 on any enforced drift.
 */

import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const CACHE_DIR = join(REPO_ROOT, '.cache', 'manifest-examples')

// ─── NON_ENFORCED (report-only) ──────────────────────────────────────────────
// Packages whose findings are reported as WARNINGS instead of failing the
// gate. Two kinds of entry, both a RATCHET that can only SHRINK:
//
//   1. In-flight drift — real drift being fixed in a separate open PR.
//      Remove the entry once that PR merges (the gate then enforces it).
//   2. Harness-limited — the example-typecheck structurally can't cover
//      the package's examples reliably: per-example fragments that assume
//      an ambient app-typed value (`filter(users, u => u.active)` where
//      `users` is untyped → `u` is `unknown`), cross-package component
//      placeholders that collide with a DOM global (`Element`, `open`),
//      an un-augmentable theme resolved as `unknown`, or an alt-JSX
//      namespace (`@pyreon/document`'s DocNode runtime, not core's VNode).
//      Their findings are NOT drift; the entry documents the limitation
//      so the harness can be tightened later to re-enforce them.
const NON_ENFORCED: Record<string, string> = {
  // Harness-limited (structural — findings are not drift):
  '@pyreon/rx': 'harness-limited: examples map/filter over untyped ambient data → `unknown` element types',
  '@pyreon/styler': 'harness-limited: theme callback params resolve to `unknown` (no theme augmentation in the harness)',
  '@pyreon/attrs': 'harness-limited: per-method fragments use `Element` (a cross-package component) bare, colliding with the DOM `Element` global',
  '@pyreon/elements': 'harness-limited: examples use `open`/`Window`-shaped identifiers that collide with DOM globals',
  '@pyreon/document': 'harness-limited: examples use the DocNode JSX namespace, not core VNode; the harness compiles JSX via @pyreon/core',
  '@pyreon/server': 'harness-limited: loader-context example data is untyped → `unknown` property access',
  '@pyreon/permissions': 'harness-limited: predicate-context example data is untyped → `unknown` property access',
  '@pyreon/form': 'harness-limited: `register()` spread into a fully-typed input-attributes shape (aria accessor props)',
  '@pyreon/validation': 'harness-limited: arktype schema types demand `strict`/`strictNullChecks` (the harness runs non-strict); the `.issues` discriminated-union access needs the strict narrowing the harness config does not apply',
  '@pyreon/document-primitives': 'harness-limited: rocketstyle dimension-prop types intersect with the base Element `Direction` union, so a valid string dimension (`direction="column"`) is un-assignable at the type level though correct at runtime',
  '@pyreon/connector-document': 'harness-limited: the DocumentMarker example puts the `_documentProps` connector prop on a raw `<div>`, which needs the connector JSX augmentation the harness does not load',
}

// ─── HARNESS_EXEMPT ──────────────────────────────────────────────────────────
// Packages whose manifest `api[]` entries are NOT importable code symbols,
// so an example-typecheck is meaningless. Their examples are skipped
// entirely (neither injected nor enforced).
const HARNESS_EXEMPT: Record<string, string> = {
  // @pyreon/mcp — the `api[]` entries document MCP TOOL names
  // (`get_api`, `validate`, `diagnose`, …), not exported JS symbols.
  // The examples are tool-invocation snippets, not TypeScript.
  '@pyreon/mcp': 'api[] entries are MCP tool names, not code exports',
}

// ─── Manifest example → TS shape from the ApiEntry type ──────────────────────

type ApiKind = 'function' | 'hook' | 'component' | 'type' | 'class' | 'constant'
interface ApiEntry {
  name: string
  kind: ApiKind
  signature: string
  summary: string
  example: string
}
interface PackageManifest {
  name: string
  api: ApiEntry[]
  longExample?: string
}

// Value-kind exports can be imported and referenced as values in an
// example; `type`-kind entries can't be `import { }`-ed as values without
// a `type` modifier and are only referenced in comments, so we don't
// inject them.
const VALUE_KINDS: ReadonlySet<ApiKind> = new Set(['function', 'hook', 'component', 'class', 'constant'])
const IDENT_RE = /^[A-Za-z_$][\w$]*$/

// JS reserved words can't be bare named-import bindings — an api entry
// whose name is one (e.g. `@pyreon/validate`'s `s.catch` / `s.instanceof`)
// would make the injected/probed `import { catch } from …` a SYNTAX error,
// which suppresses semantic diagnostics program-wide. Skip them from
// injection + probe; they're validated via the example's own usage.
const RESERVED = new Set([
  'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default',
  'delete', 'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for',
  'function', 'if', 'import', 'in', 'instanceof', 'new', 'null', 'return', 'super',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with',
])
function isInjectable(name: string): boolean {
  return IDENT_RE.test(name) && !RESERVED.has(name)
}

// Cross-package helpers examples commonly reference without importing.
// Injecting them (when referenced-and-unbound) lets more of an example
// body typecheck against real types, strengthening drift detection.
// Kept minimal + stable — each maps to a source module.
const AMBIENT: Record<string, readonly string[]> = {
  '@pyreon/reactivity': [
    'signal', 'computed', 'effect', 'batch', 'untrack', 'onCleanup',
    'createStore', 'createSelector', 'isServer', 'isClient',
  ],
}

interface Example {
  pkg: string
  /** Manifest-relative label: api name or 'longExample'. */
  label: string
  body: string
}

async function loadManifests(): Promise<Array<{ path: string; manifest: PackageManifest }>> {
  const categories = ['core', 'fundamentals', 'tools', 'ui-system', 'zero', 'internals']
  const out: Array<{ path: string; manifest: PackageManifest }> = []
  for (const cat of categories) {
    const catDir = join(REPO_ROOT, 'packages', cat)
    if (!existsSync(catDir)) continue
    for (const pkg of readdirSync(catDir)) {
      const manifestPath = join(catDir, pkg, 'src', 'manifest.ts')
      if (!existsSync(manifestPath)) continue
      const mod = (await import(pathToFileURL(manifestPath).href)) as { default?: PackageManifest }
      if (mod.default) out.push({ path: manifestPath, manifest: mod.default })
    }
  }
  return out
}

/** Names already bound in the example (self-imported or top-level declared). */
function boundNames(body: string): Set<string> {
  const bound = new Set<string>()
  // import { a, b as c } from '...'   /   import D from '...'   /   import * as N from '...'
  for (const m of body.matchAll(/import\s+(?:type\s+)?(?:(\w+)\s*,?\s*)?(?:\{([^}]*)\})?(?:\*\s*as\s+(\w+))?\s*from/g)) {
    if (m[1]) bound.add(m[1])
    if (m[3]) bound.add(m[3])
    if (m[2]) {
      for (const part of m[2].split(',')) {
        const nm = part.trim().split(/\s+as\s+/).pop()?.trim()
        if (nm && IDENT_RE.test(nm)) bound.add(nm)
      }
    }
  }
  // top-level const/let/var/function/class NAME  (also destructured heads)
  for (const m of body.matchAll(/\b(?:const|let|var|function\*?|class)\s+([A-Za-z_$][\w$]*)/g)) {
    if (m[1]) bound.add(m[1])
  }
  // destructured const { a, b } = / const [a, b] =
  for (const m of body.matchAll(/\b(?:const|let|var)\s*[{[]([^}\]]*)[}\]]\s*=/g)) {
    for (const part of (m[1] ?? '').split(',')) {
      const nm = part.trim().split(/[:=]/)[0]?.trim().replace(/^\.\.\./, '')
      if (nm && IDENT_RE.test(nm)) bound.add(nm)
    }
  }
  return bound
}

function referenced(body: string, name: string): boolean {
  return new RegExp(`(?<![\\w$.])${name}(?![\\w$])`).test(body)
}

/** Strip `//` line comments and block comments so a symbol mentioned only
 * in prose (e.g. `// serverCheck is deferred`) isn't counted as a real
 * code reference by `referenced()`. */
function stripComments(body: string): string {
  return body
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
}

function buildFile(ex: Example, valueApiNames: string[], notMainExport: Set<string>): string {
  const bound = boundNames(ex.body)
  const importLines: string[] = []

  const ownWanted = valueApiNames.filter(
    (n) => !bound.has(n) && !notMainExport.has(n) && referenced(ex.body, n),
  )
  if (ownWanted.length > 0) {
    importLines.push(`import { ${ownWanted.join(', ')} } from '${ex.pkg}'`)
  }

  for (const [mod, names] of Object.entries(AMBIENT)) {
    if (mod === ex.pkg) continue
    const wanted = names.filter((n) => !bound.has(n) && referenced(ex.body, n))
    if (wanted.length > 0) importLines.push(`import { ${wanted.join(', ')} } from '${mod}'`)
  }

  const preamble = importLines.join('\n')
  // Ensure module-ness for isolatedModules even when nothing was injected.
  const suffix = preamble || /\b(import|export)\b/.test(ex.body) ? '' : '\nexport {}'
  return `${preamble}${preamble ? '\n' : ''}${ex.body}${suffix}\n`
}

// ─── tsconfig synthesis (mirrors scripts/check-doc-examples.ts) ──────────────

// Resolve every `@pyreon/*` module specifier (main entry AND every
// package.json `exports` subpath) to its workspace `src/` file via the
// `bun` export condition, so an example that imports from a subpath
// (`@pyreon/zero/server`, `@pyreon/sync/yjs`) resolves correctly instead
// of false-flagging every subpath symbol as a missing main-entry export.
function discoverPyreonPaths(): Record<string, string[]> {
  const paths: Record<string, string[]> = {}
  const categories = ['core', 'fundamentals', 'tools', 'ui-system', 'zero', 'internals']
  for (const cat of categories) {
    const catDir = join(REPO_ROOT, 'packages', cat)
    if (!existsSync(catDir)) continue
    for (const pkg of readdirSync(catDir)) {
      const pkgDir = join(catDir, pkg)
      const pjPath = join(pkgDir, 'package.json')
      if (!existsSync(pjPath)) continue
      let pj: { name?: string; exports?: Record<string, unknown> }
      try {
        pj = JSON.parse(readFileSync(pjPath, 'utf8'))
      } catch {
        continue
      }
      const name = pj.name
      if (typeof name !== 'string' || !name.startsWith('@pyreon/')) continue

      const addTarget = (specifier: string, target: unknown) => {
        // target is a conditions object ({ bun, import, types }) or a string.
        let src: string | undefined
        if (typeof target === 'string') src = target
        else if (target && typeof target === 'object') {
          const t = target as Record<string, string>
          src = t.bun ?? t.import ?? t.default
        }
        if (!src || !src.startsWith('./src/')) {
          // Fall back to a conventional src file for the specifier.
          return
        }
        const abs = join(pkgDir, src)
        if (existsSync(abs)) paths[specifier] = [relative(REPO_ROOT, abs)]
      }

      if (pj.exports && typeof pj.exports === 'object') {
        for (const [key, target] of Object.entries(pj.exports)) {
          if (key === '.') addTarget(name, target)
          else if (key.startsWith('./')) addTarget(`${name}/${key.slice(2)}`, target)
        }
      }
      // Ensure the main entry always resolves even without an exports map.
      if (!paths[name]) {
        const indexPath = join(pkgDir, 'src', 'index.ts')
        if (existsSync(indexPath)) paths[name] = [relative(REPO_ROOT, indexPath)]
      }
    }
  }
  // JSX runtimes referenced by `jsxImportSource: '@pyreon/core'`.
  const subpaths: Record<string, string> = {
    '@pyreon/core/jsx-runtime': 'packages/core/core/src/jsx-runtime.ts',
    '@pyreon/core/jsx-dev-runtime': 'packages/core/core/src/jsx-dev-runtime.ts',
  }
  for (const [alias, p] of Object.entries(subpaths)) {
    if (existsSync(join(REPO_ROOT, p))) paths[alias] = [p]
  }
  return paths
}

interface PkgExportProbe {
  /** api names NOT exported from the MAIN entry (skip main injection). */
  notMainExport: Set<string>
  /** api names exported NOWHERE (main or any subpath) — genuine drift. */
  missingEverywhere: Set<string>
}

// Probe which value-kind api names each package ACTUALLY exports, from
// its MAIN entry AND every `exports` subpath, by compiling import-only
// files and collecting the names tsc reports as missing (TS2305/2724).
//
// Two results per package:
//   • notMainExport — names missing from the MAIN entry. Only confirmed
//     main-entry exports are auto-injected into examples; a subpath-only
//     symbol (e.g. `@pyreon/sync/yjs`'s `syncedText`) is NOT injected
//     from the main entry, which is where the harness previously
//     false-positived.
//   • missingEverywhere — names exported from neither the main entry nor
//     any subpath. These are genuine drift (an api[] entry that documents
//     a symbol the package doesn't export) and are emitted as synthetic
//     findings so validated injection can't HIDE a missing-export drift.
function probeExports(
  pkgToNames: Map<string, string[]>,
  subpathsByPkg: Map<string, string[]>,
): Map<string, PkgExportProbe> {
  const probeDir = join(CACHE_DIR, '__probe')
  mkdirSync(probeDir, { recursive: true })
  // Each probe file imports one package's full name list from one
  // specifier (main or a subpath). The names that DON'T error are
  // exported by that specifier.
  interface Probe { pkg: string; isMain: boolean; names: string[] }
  const fileToProbe = new Map<string, Probe>()
  const filenames: string[] = []
  let i = 0
  const addProbe = (pkg: string, specifier: string, isMain: boolean, names: string[]) => {
    if (names.length === 0) return
    i++
    const fname = `p-${String(i).padStart(4, '0')}.ts`
    writeFileSync(join(probeDir, fname), `import { ${names.join(', ')} } from '${specifier}'\n`)
    filenames.push(fname)
    fileToProbe.set(fname, { pkg, isMain, names })
  }
  for (const [pkg, names] of pkgToNames) {
    if (names.length === 0) continue
    addProbe(pkg, pkg, true, names)
    for (const sub of subpathsByPkg.get(pkg) ?? []) addProbe(pkg, sub, false, names)
  }

  const pyreonPaths = discoverPyreonPaths()
  writeFileSync(
    join(probeDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler',
          strict: false, noImplicitAny: false, skipLibCheck: true,
          esModuleInterop: true, noEmit: true, types: ['node'],
          ignoreDeprecations: '6.0', baseUrl: '.',
          paths: Object.fromEntries(
            Object.entries(pyreonPaths).map(([n, ps]) => [n, ps.map((p) => join('..', '..', '..', p))]),
          ),
        },
        include: filenames,
      },
      null,
      2,
    ),
  )
  let out = ''
  try {
    execSync('bunx tsc --project tsconfig.json', { cwd: probeDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    out = ((e as { stdout?: string }).stdout ?? '') + ((e as { stderr?: string }).stderr ?? '')
  }
  // Per probe file, collect the names it reported as missing.
  const missingPerFile = new Map<string, Set<string>>()
  for (const line of out.split('\n')) {
    const fm = /^(p-\d+\.ts)/.exec(line.trim())
    if (!fm) continue
    const nm = /has no exported member (?:named )?'([^']+)'/.exec(line)
    if (!nm) continue
    if (!missingPerFile.has(fm[1]!)) missingPerFile.set(fm[1]!, new Set())
    missingPerFile.get(fm[1]!)!.add(nm[1]!)
  }

  // Aggregate per package: names resolved by main, names resolved anywhere.
  const resolvedMain = new Map<string, Set<string>>()
  const resolvedAnywhere = new Map<string, Set<string>>()
  const allNames = new Map<string, Set<string>>()
  for (const [fname, probe] of fileToProbe) {
    if (!allNames.has(probe.pkg)) {
      allNames.set(probe.pkg, new Set())
      resolvedMain.set(probe.pkg, new Set())
      resolvedAnywhere.set(probe.pkg, new Set())
    }
    for (const n of probe.names) allNames.get(probe.pkg)!.add(n)
    const missing = missingPerFile.get(fname) ?? new Set<string>()
    for (const n of probe.names) {
      if (missing.has(n)) continue
      resolvedAnywhere.get(probe.pkg)!.add(n)
      if (probe.isMain) resolvedMain.get(probe.pkg)!.add(n)
    }
  }

  const result = new Map<string, PkgExportProbe>()
  for (const [pkg, names] of allNames) {
    const mainSet = resolvedMain.get(pkg)!
    const anySet = resolvedAnywhere.get(pkg)!
    const notMainExport = new Set<string>()
    const missingEverywhere = new Set<string>()
    for (const n of names) {
      if (!mainSet.has(n)) notMainExport.add(n)
      if (!anySet.has(n)) missingEverywhere.add(n)
    }
    result.set(pkg, { notMainExport, missingEverywhere })
  }
  return result
}

function writeTsconfig(filenames: string[]): void {
  const pyreonPaths = discoverPyreonPaths()
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'preserve',
      jsxImportSource: '@pyreon/core',
      strict: false,
      noImplicitAny: false,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
      noEmit: true,
      types: ['node'],
      ignoreDeprecations: '6.0',
      baseUrl: '.',
      paths: Object.fromEntries(
        Object.entries(pyreonPaths).map(([name, ps]) => [name, ps.map((p) => join('..', '..', p))]),
      ),
    },
    include: ['__ambient.d.ts', ...filenames],
  }
  writeFileSync(join(CACHE_DIR, 'tsconfig.json'), JSON.stringify(tsconfig, null, 2))
}

function runTsc(): { ok: boolean; out: string } {
  try {
    const out = execSync('bunx tsc --project tsconfig.json', {
      cwd: CACHE_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, out }
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string }
    return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? '') }
  }
}

// ─── Error classification ────────────────────────────────────────────────────
//
// TypeScript suppresses ALL semantic diagnostics program-wide when ANY
// file in the program has a SYNTAX error (verified empirically). Manifest
// examples are snippets — many are multi-root JSX / object-literal
// fragments that don't parse as standalone modules. So we run tsc in a
// loop: each pass, files with a syntax-category error are removed from the
// program (they're always reported, regardless of semantic suppression);
// once no syntax errors remain, the semantic (drift) diagnostics finally
// surface. Syntax-broken examples are an uncheckable coverage gap (a
// fragment isn't necessarily drift), reported as info, not a failure.
function isSyntaxCategory(code: number): boolean {
  // 1000–1999: parse/grammar errors. 2657: JSX must have one parent.
  // 17000–17999: JSX-specific. 2304 is NOT here — an undeclared
  // continuation symbol is a tolerated snippet artifact, not a parse error.
  return (code >= 1000 && code < 2000) || code === 2657 || (code >= 17000 && code < 18000)
}

// A DRIFT error fires on a real (injected) API symbol being used wrong:
// wrong args, wrong shape, missing export, unknown property. Everything
// else (undeclared continuation symbols, unresolved cross-package
// modules, injection duplicates) is a snippet artifact, not drift.
const DRIFT_CODES = new Set([
  2305, // Module X has no exported member Y
  2724, // no exported member named X (did you mean Y)
  2614, // Module has no exported member (did you mean default import)
  2345, // Argument of type X is not assignable to parameter of type Y
  2322, // Type X is not assignable to type Y
  2339, // Property X does not exist on type Y
  2551, // Property X does not exist ... did you mean Y
  2554, // Expected N arguments, but got M
  2555, // Expected at least N arguments, but got M
  2559, // Type X has no properties in common with type Y
  2769, // No overload matches this call
  2353, // Object literal may only specify known properties
  2740, // Type X is missing the following properties from type Y
  2741, // Property X is missing in type Y but required in type Z
  2739, // Type X is missing the following properties
  2694, // Namespace has no exported member
])

process.exit(await main())

async function main(): Promise<number> {
  const manifests = await loadManifests()

  if (existsSync(CACHE_DIR)) rmSync(CACHE_DIR, { recursive: true, force: true })
  mkdirSync(CACHE_DIR, { recursive: true })

  // Ambient declarations that keep the harness from false-flagging
  // untyped host globals as drift: `window.__PYREON_*__`, `import.meta.env`
  // / `.glob` / `.hot`, `globalThis.__*`. These are framework/bundler
  // globals examples legitimately reference; a TS2339 on them is a
  // harness typing gap, not manifest drift.
  writeFileSync(
    join(CACHE_DIR, '__ambient.d.ts'),
    [
      'interface Window { [key: string]: any }',
      'interface ImportMeta { env: any; glob: any; hot: any; url: string }',
      'declare var __PYREON_DEVTOOLS__: any',
      '',
    ].join('\n'),
  )

  // Per-package value-kind api names (valid identifiers) for injection.
  const pkgToNames = new Map<string, string[]>()
  for (const { manifest } of manifests) {
    if (manifest.name in HARNESS_EXEMPT) continue
    pkgToNames.set(
      manifest.name,
      manifest.api
        .filter((a) => VALUE_KINDS.has(a.kind) && isInjectable(a.name))
        .map((a) => a.name),
    )
  }

  // Map each package to its `exports` subpath specifiers (e.g.
  // '@pyreon/zero/server') so the probe can confirm subpath-only exports.
  const pkgNames = new Set(pkgToNames.keys())
  const subpathsByPkg = new Map<string, string[]>()
  for (const specifier of Object.keys(discoverPyreonPaths())) {
    const slash = specifier.indexOf('/', '@pyreon/'.length)
    if (slash === -1) continue
    const base = specifier.slice(0, slash)
    if (!pkgNames.has(base)) continue
    if (!subpathsByPkg.has(base)) subpathsByPkg.set(base, [])
    subpathsByPkg.get(base)!.push(specifier)
  }

  // Validated injection: only inject symbols confirmed to be main-entry
  // exports. Subpath-only symbols are excluded; symbols exported NOWHERE
  // become synthetic drift findings (see probeExports).
  const exportProbe = probeExports(pkgToNames, subpathsByPkg)

  const filenames: string[] = []
  const fileMeta: Record<string, Example> = {}
  let idx = 0

  for (const { manifest } of manifests) {
    if (manifest.name in HARNESS_EXEMPT) continue
    const valueApiNames = pkgToNames.get(manifest.name) ?? []
    const probe = exportProbe.get(manifest.name)
    const notExport = probe?.notMainExport ?? new Set<string>()

    const examples: Example[] = []
    for (const a of manifest.api) {
      if (a.example && a.example.trim().length > 0) {
        examples.push({ pkg: manifest.name, label: a.name, body: a.example })
      }
    }
    if (manifest.longExample && manifest.longExample.trim().length > 0) {
      examples.push({ pkg: manifest.name, label: 'longExample', body: manifest.longExample })
    }

    for (const ex of examples) {
      idx++
      const fname = `ex-${String(idx).padStart(4, '0')}.tsx`
      writeFileSync(join(CACHE_DIR, fname), buildFile(ex, valueApiNames, notExport))
      filenames.push(fname)
      fileMeta[fname] = ex
    }
  }

  if (filenames.length === 0) {
    console.log('[check-manifest-examples] no manifest examples found — skipping.')
    return 0
  }

  console.log(
    `[check-manifest-examples] typechecking ${filenames.length} manifest example(s) across ${manifests.length} package(s)…`,
  )

  interface RawError {
    file: string
    code: number
    loc: string
    msg: string
  }
  function parseErrors(out: string): RawError[] {
    const errs: RawError[] = []
    for (const line of out.split('\n')) {
      const m = /^(ex-\d+\.tsx)(\(\d+,\d+\))?:\s*error TS(\d+):\s*(.+)$/.exec(line.trim())
      if (!m || !fileMeta[m[1]!]) continue
      errs.push({ file: m[1]!, code: Number(m[3]), loc: m[2] ?? '', msg: m[4]! })
    }
    return errs
  }

  // Exclusion loop — drop syntax-broken example files until the semantic
  // diagnostics surface (see isSyntaxCategory). Converges in ≤2 rounds:
  // pass 1 reports every syntax error (always), pass 2 has none.
  let include = [...filenames]
  const unparseable = new Set<string>()
  let lastErrors: RawError[] = []
  for (let round = 0; round < 4; round++) {
    writeTsconfig(include)
    const { ok, out } = runTsc()
    lastErrors = parseErrors(out)
    if (ok) {
      lastErrors = []
      break
    }
    const syntaxFiles = new Set(
      lastErrors.filter((e) => isSyntaxCategory(e.code)).map((e) => e.file),
    )
    if (syntaxFiles.size === 0) break // semantics ran cleanly
    for (const f of syntaxFiles) unparseable.add(f)
    include = include.filter((f) => !syntaxFiles.has(f))
  }

  interface Finding {
    ex: Example
    code: number
    loc: string
    msg: string
  }
  const findings: Finding[] = lastErrors
    .filter((e) => DRIFT_CODES.has(e.code))
    .map((e) => ({ ex: fileMeta[e.file]!, code: e.code, loc: e.loc, msg: e.msg }))

  // Synthetic findings for api[] entries that document a value-kind symbol
  // the package exports NOWHERE (main OR any subpath). Validated injection
  // skips these (they aren't main exports), so without this they'd be
  // silently uncovered — the exact "documents a symbol that doesn't exist"
  // drift the gate must catch.
  //
  // Gated on `referenced()`: only fire when the entry's own example uses
  // the symbol as a BARE identifier (importable). Entries that document a
  // METHOD / instance formatter / builder-chain / global namespace
  // (`s.readonly`, `i18n.n`, `.volatile()`, `window.__PYREON_DEVTOOLS__`)
  // reference it as a member (`.name`), which `referenced()`'s lookbehind
  // excludes — those are legitimately-documented non-exports, not drift.
  for (const { manifest } of manifests) {
    if (manifest.name in HARNESS_EXEMPT) continue
    const missing = exportProbe.get(manifest.name)?.missingEverywhere
    if (!missing || missing.size === 0) continue
    for (const api of manifest.api) {
      if (!missing.has(api.name)) continue
      // Strip comments so a symbol mentioned only in prose (`// serverCheck
      // is deferred`) doesn't read as a code reference — a schema-method
      // entry (`s.string().serverCheck(...)`) is member-only in code and
      // must not be flagged as a missing top-level export.
      const body = stripComments(api.example ?? '')
      // Bare reference OR an explicit import from the package = intent to
      // export it. Member-only usage = documents a method, not an export.
      const importsIt = new RegExp(`import[^\\n]*\\b${api.name}\\b[^\\n]*from`).test(body)
      if (!referenced(body, api.name) && !importsIt) continue
      findings.push({
        ex: { pkg: manifest.name, label: api.name, body: '' },
        code: 0,
        loc: '',
        msg: `api[] entry '${api.name}' is not exported from ${manifest.name} or any of its subpaths (documents a symbol that does not exist).`,
      })
    }
  }

  if (unparseable.size > 0) {
    const byPkg = new Map<string, number>()
    for (const f of unparseable) {
      const pkg = fileMeta[f]!.pkg
      byPkg.set(pkg, (byPkg.get(pkg) ?? 0) + 1)
    }
    const total = unparseable.size
    console.log(
      `[check-manifest-examples] note: ${total} example(s) are unparseable fragments (multi-root JSX / partial object literals) — an uncheckable coverage gap, not a failure.`,
    )
  }

  // Split into enforced vs report-only (NON_ENFORCED).
  const enforced = findings.filter((f) => !(f.ex.pkg in NON_ENFORCED))
  const reportOnly = findings.filter((f) => f.ex.pkg in NON_ENFORCED)

  if (reportOnly.length > 0) {
    const byPkg = new Map<string, number>()
    for (const f of reportOnly) byPkg.set(f.ex.pkg, (byPkg.get(f.ex.pkg) ?? 0) + 1)
    console.warn('[check-manifest-examples] report-only (NON_ENFORCED — ratchet, does not fail the gate):')
    for (const [pkg, n] of byPkg) {
      console.warn(`  ${pkg}: ${n} finding(s) — ${NON_ENFORCED[pkg]}`)
    }
  }

  if (enforced.length === 0) {
    console.log(`[check-manifest-examples] OK — ${filenames.length} example(s) checked; ${enforced.length === 0 && reportOnly.length > 0 ? 'findings only in report-only packages.' : 'no drift.'}`)
    return 0
  }

  console.error(`\n[check-manifest-examples] FAILED — ${enforced.length} manifest-example drift(s):\n`)
  const byPkg = new Map<string, Finding[]>()
  for (const f of enforced) {
    if (!byPkg.has(f.ex.pkg)) byPkg.set(f.ex.pkg, [])
    byPkg.get(f.ex.pkg)!.push(f)
  }
  for (const [pkg, fs] of byPkg) {
    console.error(`  ${pkg}:`)
    for (const f of fs) {
      const tag = f.code === 0 ? 'MISSING-EXPORT' : `TS${f.code}${f.loc}`
      console.error(`    [${f.ex.label}] ${tag}: ${f.msg}`)
    }
  }
  console.error('')
  console.error('These manifest api[].example blocks do not typecheck against the shipped')
  console.error('exports. Fix the example/signature to match the real API (the shipped')
  console.error('runtime is the source of truth), then re-run `bun run gen-docs`.')
  return 1
}
