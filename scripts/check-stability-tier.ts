/**
 * check-stability-tier — the 1.0 semver contract gate (validate-fast family).
 *
 * Pyreon's semver promise covers STABLE packages only. Experimental packages,
 * and the experimental subpaths of stable packages, may break in a minor
 * release (policy: `docs/src/content/docs/stability-and-direction.md`). The
 * tier lives in each published `package.json`, the one place npm, `pyreon
 * doctor`, loom and the docs generators can all read:
 *
 *   "pyreon": { "stability": "stable" | "experimental",
 *               "experimentalSubpaths"?: ["./native-plugin", …] }
 *
 * A tier nobody checks drifts the way the old README status lines did (`http`
 * and `loom` said "not published" for several releases after they shipped).
 * This gate fails when:
 *
 *   1. a published package (including the 7 compiler binaries) lacks the field,
 *      or an `experimentalSubpaths` entry is not one of its `exports` keys;
 *   2. its README status line is missing or disagrees with the field
 *      (`--write` regenerates the line), or the README head still carries an
 *      older status / "pre-release" / "not published" line;
 *   3. a Stable package has a REQUIRED dependency (a `dependencies` entry, or a
 *      peer not marked optional) on an Experimental one. The one exception: the
 *      only source files importing it are entries of the Stable package's own
 *      experimental subpaths (e.g. `@pyreon/code/webview` → `@pyreon/primitives`),
 *      so the Stable surface never exposes the Experimental API. Anything else
 *      needs a reasoned `DEPENDENCY_ALLOWLIST` entry (stale entries fail);
 *   4. `@pyreon/meta` re-exports an Experimental package or a `_`-prefixed name;
 *   5. a `@deprecated` JSDoc tag in a published `src/` has no manifest entry
 *      marked `stability: 'deprecated'` with `deprecated.removeIn`, and is not
 *      in `DEPRECATED_ALLOWLIST` with a reason (stale allowlist entries fail);
 *   6. a docs page passes a hand-written `status=` to `<PackageBadge>` (the
 *      badge reads the tier generated from this field);
 *   8. a public entry of a published package exports a `_`-prefixed runtime
 *      name that is not compiler ABI (`COMPILER_ABI`). Test-reset helpers and
 *      cross-package internals belong on the package's `./internal` subpath
 *      (`./internal-server` for Node-only ones; `@pyreon/core/compat` for the
 *      compat layers' plumbing), which carries no semver promise. A
 *      `COMPILER_ABI` name its entry no longer exports fails too, so the list
 *      cannot outlive the helpers it names;
 *   9. a public entry exports a declaration tagged `@internal` in JSDoc. The
 *      tag is how a non-`_` internal (a test seam, cross-package plumbing) is
 *      marked; it belongs on `./internal`. Public API carries no such tag.
 *      Rules 8 and 9 follow re-exports, `export *`, `export { default as x }`,
 *      re-bound aliases (`const x = y`) and namespace re-exports (`export * as
 *      ns`, `import * as ns` + `export { ns }`, whose members count as
 *      `ns.member`). Not followed: re-exports of another package (that
 *      package's own entries are checked) and computed or object-literal
 *      re-wrapping (`export const api = { seam }`);
 *  10. a package's shipped source imports another package's internal subpath
 *      (`./internal`, `./internal-server`, `@pyreon/core/compat`) while its
 *      `package.json` declares that package with a non-exact range. Internals
 *      change in any release, so the edge must be `workspace:*` (published as
 *      the exact version);
 *   7. a PRIVATE package (`"private": true`, e.g. `@pyreon/auth` until it is
 *      published) declares a tier or carries a README status line. An
 *      unpublished package makes no semver promise, the generated table and
 *      badge leave it out ("unpublished"), and rules 1-2 never check it, so a
 *      tier left on it would drift unchecked. Publishing it (dropping
 *      `private`) makes rule 1 ask for the field and `--write` add the line.
 *
 * Usage:
 *   bun scripts/check-stability-tier.ts          # verify (CI mode)
 *   bun scripts/check-stability-tier.ts --write  # regenerate README status lines
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
// Relative import of the internal manifest package (same note as
// check-multiplatform-tier / check-manifest-depth).
import { findManifests } from '../packages/internals/manifest/src'
import { listPublishedPackages } from './check-multiplatform-tier'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type Stability = 'stable' | 'experimental'

export interface StabilityField {
  stability: Stability
  experimentalSubpaths?: string[]
}

export interface PublishedPackage {
  name: string
  dir: string
  pkg: PackageJson
}

export interface PackageJson {
  name: string
  private?: boolean
  exports?: Record<string, unknown>
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  pyreon?: { stability?: unknown; experimentalSubpaths?: unknown }
}

export const POLICY_URL = 'https://pyreon.dev/docs/stability-and-direction'

/**
 * `@deprecated` JSDoc tags that deliberately have no manifest entry with a
 * `removeIn`. Key: `<package>#<symbol>` (members are `Owner.member`). Each
 * entry needs a reason; an entry whose tag is gone fails the gate, so the list
 * cannot outlive its justification.
 */
export const DEPRECATED_ALLOWLIST: Record<string, string> = {
  '@pyreon/core#ForProps.key':
    'Not an API: a `key?: never` type guard that turns `<For key>` (React habit) into a type error pointing at `by`. Nothing to remove.',
  '@pyreon/native-compiler#NATIVE_COMPILER_PLUGIN_API_VERSION':
    'Experimental package with no manifest. Frozen at 1 on purpose: old plugins import it at runtime to declare API 1.',
}

/**
 * Stable → Experimental required dependencies that no source import explains
 * but that the experimental native toolchain needs. Key: `<from> -> <to>`.
 * Each needs a reason; an entry that is no longer a violation fails.
 */
export const DEPENDENCY_ALLOWLIST: Record<string, string> = {
  '@pyreon/charts -> @pyreon/primitives':
    "`pyreon-native` discovers native plugins by walking dependencies, and the charts native plugin relies on @pyreon/primitives' `useNativeModule` recognizer being found that way (locked by native-cli `discover-plugins.test.ts`). The coupling belongs to the experimental `./native-plugin` subpath; no web code imports primitives.",
}

// ─── reading ────────────────────────────────────────────────────────────────

/** Every published package, including the per-platform compiler binaries. */
export function listAllPublished(repoRoot: string): PublishedPackage[] {
  const out: PublishedPackage[] = listPublishedPackages(repoRoot).map((p) => ({
    name: p.name,
    dir: p.dir,
    pkg: readJson(join(p.dir, 'package.json')),
  }))
  // The compiler binaries live one level deeper (`packages/core/compiler/npm/<triple>`),
  // below the `packages/<category>/<pkg>` walk.
  const binDir = join(repoRoot, 'packages/core/compiler/npm')
  if (existsSync(binDir)) {
    for (const triple of readdirSync(binDir)) {
      const text = readTextIfExists(join(binDir, triple, 'package.json'))
      if (text === undefined) continue
      const pkg = JSON.parse(text) as PackageJson
      if (pkg.private === true) continue
      out.push({ name: pkg.name, dir: join(binDir, triple), pkg })
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

function readJson(file: string): PackageJson {
  return JSON.parse(readFileSync(file, 'utf8')) as PackageJson
}

/**
 * A file's text, or `undefined` when it does not exist. Reading and handling
 * ENOENT, rather than `existsSync` then `readFileSync`, leaves no window for
 * the file to change between the check and the read.
 */
export function readTextIfExists(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw err
  }
}

/** Validate and return the `pyreon` stability field, or a failure message. */
export function readStabilityField(p: PublishedPackage): StabilityField | string {
  const raw = p.pkg.pyreon
  if (!raw || (raw.stability !== 'stable' && raw.stability !== 'experimental')) {
    return `${p.name}: package.json has no \`"pyreon": { "stability": "stable" | "experimental" }\`. Every published package declares its tier.`
  }
  const field: StabilityField = { stability: raw.stability }
  if (raw.experimentalSubpaths !== undefined) {
    const subs = raw.experimentalSubpaths
    if (!Array.isArray(subs) || subs.some((s) => typeof s !== 'string')) {
      return `${p.name}: \`pyreon.experimentalSubpaths\` must be an array of export keys.`
    }
    if (raw.stability === 'experimental') {
      return `${p.name}: \`experimentalSubpaths\` is only meaningful on a stable package; the whole package is already experimental.`
    }
    const exportKeys = Object.keys(p.pkg.exports ?? {})
    const unknown = (subs as string[]).filter((s) => !exportKeys.includes(s))
    if (unknown.length > 0) {
      return `${p.name}: \`experimentalSubpaths\` lists ${unknown.join(', ')}, which ${unknown.length === 1 ? 'is not an export key' : 'are not export keys'} of the package.`
    }
    field.experimentalSubpaths = subs as string[]
  }

  return field
}

// ─── README status line ─────────────────────────────────────────────────────

const STATUS_LINE_RE = /^> \*\*Status: (Stable|Experimental)\.\*\*/
/** Older status markers that the canonical line replaced. */
const LEGACY_STATUS_RE = /\*\*EXPERIMENTAL\.?\*\*|\*\*Status[^*]*\*\*|^>?\s*Status:|pre-release|not published/i
const README_HEAD_LINES = 15

/** The canonical README status line for a tier. */
export function renderStatusLine(field: StabilityField): string {
  if (field.stability === 'experimental') {
    return `> **Status: Experimental.** Outside the semver promise: the API may change in a minor release. See the [stability policy](${POLICY_URL}).`
  }
  const subs = field.experimentalSubpaths ?? []
  const tail =
    subs.length === 0
      ? ''
      : ` Experimental subpaths, which may change in a minor release: ${subs.map((s) => `\`${s}\``).join(', ')}.`

  return `> **Status: Stable.** Covered by the [semver policy](${POLICY_URL}).${tail}`
}

/** Failures for one README against its tier. */
export function readmeFailures(name: string, readme: string, field: StabilityField): string[] {
  const lines = readme.split('\n').slice(0, README_HEAD_LINES)
  const failures: string[] = []
  const statusIdx = lines.findIndex((l) => STATUS_LINE_RE.test(l))
  const expected = renderStatusLine(field)
  if (statusIdx === -1) {
    failures.push(
      `${name}: README has no status line in its first ${README_HEAD_LINES} lines. Run: bun scripts/check-stability-tier.ts --write`,
    )
  } else if (lines[statusIdx] !== expected) {
    failures.push(
      `${name}: README status line disagrees with package.json \`pyreon.stability\`.\n    found:    ${lines[statusIdx]}\n    expected: ${expected}\n    Run: bun scripts/check-stability-tier.ts --write`,
    )
  }
  lines.forEach((line, i) => {
    if (i === statusIdx) return
    if (LEGACY_STATUS_RE.test(line)) {
      failures.push(
        `${name}: README line ${i + 1} carries a second status claim ("${line.trim().slice(0, 80)}"). The tier lives in package.json and the generated status line only.`,
      )
    }
  })

  return failures
}

/** Insert or replace the status line (directly under the H1). */
export function writeStatusLine(readme: string, field: StabilityField): string {
  const lines = readme.split('\n')
  const expected = renderStatusLine(field)
  const head = lines.slice(0, README_HEAD_LINES)
  const idx = head.findIndex((l) => STATUS_LINE_RE.test(l))
  if (idx !== -1) {
    lines[idx] = expected
    return lines.join('\n')
  }
  const h1 = lines.findIndex((l) => l.startsWith('# '))
  const at = h1 === -1 ? 0 : h1 + 1
  lines.splice(at, 0, '', expected)

  return lines.join('\n')
}

// ─── dependency direction ───────────────────────────────────────────────────

const SRC_EXT = /\.(ts|tsx|mts)$/
/** A path inside a test, fixture or bench directory. */
const TEST_DIR = /(?:^|\/)(?:tests?|__tests__|__fixtures__|fixtures|bench)\//
/** A test, spec or bench file by its suffix. */
const TEST_SUFFIX = /\.(?:test|spec|bench)\.[cm]?tsx?$/

/** Test, fixture and bench files are not package source. */
export function isTestPath(path: string): boolean {
  return TEST_DIR.test(path) || TEST_SUFFIX.test(path)
}

/** Non-test source files under `dir` (recursive). */
export function listSourceFiles(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue
        walk(full)
      } else if (SRC_EXT.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        if (!isTestPath(full)) out.push(full)
      }
    }
  }
  walk(dir)

  return out.sort()
}

function importsPackage(source: string, dep: string): boolean {
  const esc = dep.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  return new RegExp(`(from\\s*|import\\s*\\(?\\s*|require\\(\\s*)['"]${esc}(/[^'"]*)?['"]`).test(source)
}

/** Whether a source file (relative to the package dir) is an experimental subpath's entry or lives in its directory. */
function experimentalSubpathMatcher(p: PublishedPackage, field: StabilityField): (rel: string) => boolean {
  const entries = new Set<string>()
  const dirs: string[] = []
  for (const sub of field.experimentalSubpaths ?? []) {
    const exp = p.pkg.exports?.[sub]
    const bun = exp && typeof exp === 'object' ? (exp as Record<string, unknown>).bun : undefined
    if (typeof bun === 'string') {
      const rel = bun.replace(/^\.\//, '')
      entries.add(rel)
      dirs.push(rel.replace(SRC_EXT, '') + '/')
    }
  }

  return (rel: string) => entries.has(rel) || dirs.some((d) => rel.startsWith(d))
}

/** A Stable package's required dependencies: `dependencies` plus non-optional peers. */
function requiredDependencies(p: PublishedPackage): Array<[string, string]> {
  const required: Array<[string, string]> = []
  for (const dep of Object.keys(p.pkg.dependencies ?? {})) required.push([dep, 'dependencies'])
  for (const dep of Object.keys(p.pkg.peerDependencies ?? {})) {
    if (p.pkg.peerDependenciesMeta?.[dep]?.optional !== true) required.push([dep, 'peerDependencies'])
  }

  return required
}

/** Why a Stable → Experimental dependency is a violation, or `undefined` when only experimental subpaths import it. */
function dependencyViolation(p: PublishedPackage, field: StabilityField, dep: string, where: string): string | undefined {
  const inSubpath = experimentalSubpathMatcher(p, field)
  const importers = listSourceFiles(join(p.dir, 'src'))
    .filter((f) => importsPackage(readFileSync(f, 'utf8'), dep))
    .map((f) => relative(p.dir, f))
  const leaking = importers.filter((rel) => !inSubpath(rel))
  if (importers.length > 0 && leaking.length === 0) return undefined
  const head = `${p.name} (stable) has a required ${where} entry on ${dep} (experimental). `
  if (importers.length === 0) {
    return `${head}No source file imports it: drop it, move it to devDependencies, or, if a tool needs it installed, add a reasoned DEPENDENCY_ALLOWLIST entry.`
  }

  return (
    `${head}Imported outside the package's experimental subpaths by: ${leaking.join(', ')}. ` +
    `Make it an optional peer, confine its use to an experimental subpath, or re-tier one of the two packages.`
  )
}

/** Stable → Experimental required-dependency violations. */
export function dependencyFailures(
  pkgs: PublishedPackage[],
  fields: Map<string, StabilityField>,
  allowlist: Record<string, string> = DEPENDENCY_ALLOWLIST,
): string[] {
  const failures: string[] = []
  const used = new Set<string>()
  for (const p of pkgs) {
    const field = fields.get(p.name)
    if (field?.stability !== 'stable') continue
    for (const [dep, where] of requiredDependencies(p)) {
      if (fields.get(dep)?.stability !== 'experimental') continue
      const violation = dependencyViolation(p, field, dep, where)
      if (!violation) continue
      const key = `${p.name} -> ${dep}`
      if (!(key in allowlist)) {
        failures.push(violation)
        continue
      }
      used.add(key)
      if (!allowlist[key]?.trim()) failures.push(`DEPENDENCY_ALLOWLIST['${key}'] has no reason.`)
    }
  }
  for (const key of Object.keys(allowlist)) {
    if (!used.has(key)) failures.push(`DEPENDENCY_ALLOWLIST['${key}'] is no longer a violation. Remove the stale entry.`)
  }

  return failures
}

// ─── @pyreon/meta ───────────────────────────────────────────────────────────

/** `@pyreon/meta` must not promote Experimental packages or `_` internals. */
export function metaFailures(metaSource: string, fields: Map<string, StabilityField>): string[] {
  const failures: string[] = []
  const sf = ts.createSourceFile('index.ts', metaSource, ts.ScriptTarget.Latest, true)
  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.moduleSpecifier) continue
    const spec = (stmt.moduleSpecifier as ts.StringLiteral).text
    const pkgName = spec.split('/').slice(0, 2).join('/')
    if (fields.get(pkgName)?.stability === 'experimental') {
      failures.push(`@pyreon/meta re-exports ${spec}, an Experimental package. A Stable barrel must not promote it.`)
    }
    if (!stmt.exportClause) {
      failures.push(`@pyreon/meta has \`export * from '${spec}'\`; list names explicitly so no Experimental or \`_\` name leaks in.`)
    } else if (ts.isNamedExports(stmt.exportClause)) {
      for (const el of stmt.exportClause.elements) {
        if (el.name.text.startsWith('_')) {
          failures.push(`@pyreon/meta re-exports \`${el.name.text}\` from ${spec}: \`_\` names are internal and have no semver promise.`)
        }
      }
    }
  }

  return failures
}

// ─── `_` exports ────────────────────────────────────────────────────────────

/**
 * The `_` helpers code compiled by `@pyreon/compiler` imports, per entry. They
 * are the compiler ABI: additive-only within a major, because a library
 * compiled with one 1.x release runs against any later 1.x runtime. Every
 * other `_` export is internal and lives on an internal subpath.
 */
export const COMPILER_ABI: Record<string, readonly string[]> = {
  '@pyreon/core': ['_fuse', '_lc', '_pk', '_pp', '_rp', '_rpd', '_slot', '_wrapSpread'],
  '@pyreon/reactivity': ['_bind'],
  '@pyreon/runtime-dom': [
    '_applyProps',
    '_bindDirect',
    '_bindProp',
    '_bindSpread',
    '_bindText',
    '_dispose2',
    '_dispose3',
    '_dispose4',
    '_disposeN',
    '_mountChild',
    '_mountSlot',
    '_ref',
    '_rsCollapse',
    '_rsCollapseDyn',
    '_rsCollapseDynH',
    '_rsCollapseH',
    '_setAttr',
    '_setChild',
    '_setChildAt',
    '_setClass',
    '_setHtml',
    '_setProp',
    '_setPropStatic',
    '_setStyle',
    '_setStyleOnce',
    '_setValue',
    '_textSlot',
    '_tpl',
  ],
  '@pyreon/runtime-server': [
    '_esc',
    '_escSole',
    '_ssr',
    '_ssrAttr',
    '_ssrAttrGen',
    '_ssrAttrUrl',
    '_ssrChildren',
    '_ssrDeferred',
    '_ssrForKeyed',
    '_ssrItem',
    '_ssrNode',
  ],
}

/** Entries that hold internals by design: no semver promise, `_` names allowed. */
export function isInternalEntry(pkg: string, subpath: string): boolean {
  return /^\.\/internal(?:-server)?$/.test(subpath) || (pkg === '@pyreon/core' && subpath === './compat')
}

const ENTRY_EXTS = ['.ts', '.tsx', '.mts', '/index.ts', '/index.tsx']

/**
 * Runtime names a module exports, following `export *` through relative
 * modules (a re-export of another package is that package's own entry's
 * concern). Type-only exports are skipped: they do not exist at runtime.
 */
// oxlint-disable-next-line complexity -- one branch per export syntax form
export function runtimeExportNames(file: string, seen: Set<string> = new Set()): Set<string> {
  const out = new Set<string>()
  if (seen.has(file) || !existsSync(file)) return out
  seen.add(file)
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
  const exported = (n: ts.Node): boolean =>
    ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st)) {
      if (st.isTypeOnly) continue
      const spec = st.moduleSpecifier !== undefined && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : undefined
      if (st.exportClause === undefined) {
        if (spec === undefined || !spec.startsWith('.')) continue
        const base = resolve(dirname(file), spec).replace(/\.[cm]?[jt]sx?$/, '')
        const target = ENTRY_EXTS.map((e) => base + e).find((f) => existsSync(f))
        if (target !== undefined) for (const n of runtimeExportNames(target, seen)) out.add(n)
      } else if (ts.isNamespaceExport(st.exportClause)) {
        out.add(st.exportClause.name.text)
      } else {
        for (const el of st.exportClause.elements) if (!el.isTypeOnly) out.add(el.name.text)
      }
    } else if (ts.isVariableStatement(st) && exported(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text)
    } else if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) && exported(st)) {
      if (st.name !== undefined) out.add(st.name.text)
    }
  }

  return out
}

/** Public entries of a package as `[subpath, source file]`, from the `bun` condition. */
function publicEntries(p: PublishedPackage): Array<[string, string]> {
  const out: Array<[string, string]> = []
  for (const [subpath, value] of Object.entries(p.pkg.exports ?? {})) {
    if (isInternalEntry(p.name, subpath) || value === null || typeof value !== 'object') continue
    const src = (value as Record<string, unknown>)['bun']
    if (typeof src === 'string' && /\.[cm]?tsx?$/.test(src)) out.push([subpath, join(p.dir, src)])
  }

  return out
}

function resolveModule(from: string, spec: string): string | undefined {
  const base = resolve(dirname(from), spec).replace(/\.[cm]?[jt]sx?$/, '')

  return ENTRY_EXTS.map((e) => base + e).find((f) => existsSync(f))
}

const sourceCache = new Map<string, ts.SourceFile>()

function sourceOf(file: string): ts.SourceFile {
  let sf = sourceCache.get(file)
  if (sf === undefined) {
    sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    sourceCache.set(file, sf)
  }

  return sf
}

/** The top-level declaration statements in `sf` that declare `name` (a function may have overloads). */
function localDeclarations(sf: ts.SourceFile, name: string): ts.Statement[] {
  return sf.statements.filter((st) => {
    if (ts.isVariableStatement(st)) {
      return st.declarationList.declarations.some((d) => ts.isIdentifier(d.name) && d.name.text === name)
    }
    if (ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st) || ts.isEnumDeclaration(st)) return st.name?.text === name

    return false
  })
}

/** Is `n` a statement with an `export` modifier (and `default`, when asked)? */
function hasModifier(n: ts.Node, kind: ts.SyntaxKind): boolean {
  return ts.canHaveModifiers(n) && (ts.getModifiers(n) ?? []).some((m) => m.kind === kind)
}

/** What an exported name is bound to: declaration statements, or a whole module (a namespace). */
export interface ExportBinding {
  decls: ts.Statement[]
  /** Set when the name is a namespace object (`export * as ns`, or `import * as ns` re-exported). */
  namespace?: string
}

/**
 * The binding behind `name` as exported by `file`. Follows
 * `export { a as b } from './x'`, `export *`, `export { default as x }`, a
 * local `import` re-exported by name, a re-bound alias (`const x = y`), and
 * namespace re-exports. Declarations in another package are not followed.
 */
// oxlint-disable-next-line complexity -- one branch per export / import syntax form
export function exportBinding(file: string, name: string, seen: Set<string> = new Set()): ExportBinding {
  const none: ExportBinding = { decls: [] }
  const key = `${file}#${name}`
  if (seen.has(key) || !existsSync(file)) return none
  seen.add(key)
  const sf = sourceOf(file)

  // A local binding: a declaration (an alias `const x = y` also brings y's), a
  // default export, or an import from a relative module.
  // oxlint-disable-next-line complexity -- one branch per binding form
  const local = (id: string): ExportBinding => {
    if (id === 'default') {
      for (const st of sf.statements) {
        if (ts.isExportAssignment(st) && !st.isExportEquals && ts.isIdentifier(st.expression)) return local(st.expression.text)
        if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st)) && hasModifier(st, ts.SyntaxKind.DefaultKeyword)) {
          return { decls: [st] }
        }
      }

      return none
    }
    const decls = localDeclarations(sf, id)
    if (decls.length > 0) {
      const out = [...decls]
      for (const st of decls) {
        if (!ts.isVariableStatement(st)) continue
        for (const d of st.declarationList.declarations) {
          if (!ts.isIdentifier(d.name) || d.name.text !== id || d.initializer === undefined) continue
          let init: ts.Expression = d.initializer
          while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init) || ts.isParenthesizedExpression(init)) init = init.expression
          if (ts.isIdentifier(init)) out.push(...local(init.text).decls)
        }
      }

      return { decls: out }
    }
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier) || !st.moduleSpecifier.text.startsWith('.')) continue
      const target = resolveModule(file, st.moduleSpecifier.text)
      const clause = st.importClause
      if (target === undefined || clause === undefined) continue
      if (clause.name?.text === id) return exportBinding(target, 'default', seen)
      const nb = clause.namedBindings
      if (nb !== undefined && ts.isNamespaceImport(nb) && nb.name.text === id) return { decls: [], namespace: target }
      const el = nb !== undefined && ts.isNamedImports(nb) ? nb.elements.find((e) => e.name.text === id) : undefined
      if (el !== undefined) return exportBinding(target, (el.propertyName ?? el.name).text, seen)
    }

    return none
  }

  if (name === 'default') return local('default')
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && !st.isTypeOnly) {
      const spec = st.moduleSpecifier !== undefined && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : undefined
      const target = spec?.startsWith('.') ? resolveModule(file, spec) : undefined
      if (st.exportClause === undefined) {
        const found = target === undefined ? none : exportBinding(target, name, seen)
        if (found.decls.length > 0 || found.namespace !== undefined) return found
      } else if (ts.isNamespaceExport(st.exportClause)) {
        if (st.exportClause.name.text === name) return target === undefined ? none : { decls: [], namespace: target }
      } else {
        const el = st.exportClause.elements.find((e) => e.name.text === name && !e.isTypeOnly)
        if (el === undefined) continue
        const orig = (el.propertyName ?? el.name).text
        if (spec === undefined) return local(orig)

        return target === undefined ? none : exportBinding(target, orig, seen)
      }
    } else if (hasModifier(st, ts.SyntaxKind.ExportKeyword) && localDeclarations(sf, name).includes(st)) {
      return local(name)
    }
  }

  return none
}

/** The declaration statements behind `name` as exported by `file` (see `exportBinding`). */
export function exportedDeclarations(file: string, name: string): ts.Statement[] {
  return exportBinding(file, name).decls
}

/**
 * Every runtime name reachable through `file`'s exports, with namespace
 * re-exports expanded (`ns` → `ns`, `ns._x`, …), each with its binding. A
 * namespace object exposes its module's every export at runtime, so it must
 * not smuggle a `_` name or an `@internal` declaration past rules 8 and 9.
 */
export function reachableExports(
  file: string,
  prefix = '',
  seenModules: Set<string> = new Set(),
): Array<{ name: string; binding: ExportBinding }> {
  if (seenModules.has(file)) return []
  seenModules.add(file)
  const out: Array<{ name: string; binding: ExportBinding }> = []
  for (const n of runtimeExportNames(file)) {
    const binding = exportBinding(file, n)
    out.push({ name: prefix + n, binding })
    if (binding.namespace !== undefined) out.push(...reachableExports(binding.namespace, `${prefix}${n}.`, seenModules))
  }

  return out
}

/** Does a declaration statement carry a JSDoc `@internal` tag? */
export function hasInternalTag(st: ts.Statement): boolean {
  const nodes: ts.Node[] = ts.isVariableStatement(st) ? [st, ...st.declarationList.declarations] : [st]

  return nodes.some((n) => ts.getJSDocTags(n).some((t) => t.tagName.text === 'internal'))
}

/**
 * Rule 9: a declaration tagged `@internal` must not be reachable from a public
 * entry. Internal helpers that are not `_`-prefixed (test seams, cross-package
 * plumbing) are marked with the tag and live on the `./internal` subpath.
 */
export function internalTagFailures(
  pkgs: readonly PublishedPackage[],
  abi: Record<string, readonly string[]> = COMPILER_ABI,
): string[] {
  const failures: string[] = []
  for (const p of pkgs) {
    // Compiler ABI is internal to users but must stay on the main entry.
    const allowed = new Set(abi[p.name] ?? [])
    for (const [subpath, file] of publicEntries(p)) {
      for (const { name: n, binding } of reachableExports(file)) {
        if (subpath === '.' && allowed.has(n)) continue
        if (!binding.decls.some(hasInternalTag)) continue
        const spec = subpath === '.' ? p.name : `${p.name}${subpath.slice(1)}`
        failures.push(
          `${spec} exports \`${n}\`, whose declaration is tagged \`@internal\`. Move it to ${p.name}/internal ` +
            '(see "What counts as public API" on the stability page), or, if it is public API, delete the tag.',
        )
      }
    }
  }

  return failures
}

const INTERNAL_IMPORT_RE = /(?:from\s*|import\s*\(?\s*)['"](@pyreon\/[a-z0-9-]+)\/(internal|internal-server|compat)['"]/g

/** An exact published range: `workspace:*` (published as `X.Y.Z`) or a bare `X.Y.Z`. */
export function isExactRange(range: string): boolean {
  return range === 'workspace:*' || /^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(range)
}

/**
 * Rule 10: lockstep pins. A package whose shipped source imports another
 * package's internal subpath (`./internal`, `./internal-server`, or
 * `@pyreon/core/compat`) relies on that package's internals, which change in
 * any release. It must declare the target in `dependencies` or
 * `peerDependencies` with an EXACT range (`workspace:*`, which publishes as
 * `X.Y.Z`), so an install can never pair it with another version.
 */
export function internalImportPinFailures(pkgs: readonly PublishedPackage[]): string[] {
  const failures: string[] = []
  for (const p of pkgs) {
    const targets = new Map<string, string>()
    for (const file of listSourceFiles(join(p.dir, 'src'))) {
      for (const m of readFileSync(file, 'utf8').matchAll(INTERNAL_IMPORT_RE)) {
        const target = m[1] as string
        if (target !== p.name && !targets.has(target)) targets.set(target, `${target}/${m[2]} (${relative(p.dir, file)})`)
      }
    }
    for (const [target, where] of targets) {
      const range = p.pkg.dependencies?.[target] ?? p.pkg.peerDependencies?.[target]
      if (range === undefined) {
        failures.push(`${p.name} imports ${where} but does not declare ${target} in dependencies or peerDependencies.`)
      } else if (!isExactRange(range)) {
        failures.push(
          `${p.name} imports ${where} but declares ${target} as "${range}". Internal subpaths change in any ` +
            'release, so the edge must be pinned exact: use "workspace:*" (published as the exact version).',
        )
      }
    }
  }

  return failures
}

/** Rule 8: `_` names on public entries must be compiler ABI. */
export function underscoreExportFailures(
  pkgs: readonly PublishedPackage[],
  abi: Record<string, readonly string[]> = COMPILER_ABI,
): string[] {
  const failures: string[] = []
  for (const p of pkgs) {
    const allowed = new Set(abi[p.name] ?? [])
    const onMain = new Set<string>()
    for (const [subpath, file] of publicEntries(p)) {
      for (const { name: n } of reachableExports(file)) {
        if (subpath === '.') onMain.add(n)
        if (!(n.split('.').pop() as string).startsWith('_')) continue
        if (subpath === '.' && allowed.has(n)) continue
        const spec = subpath === '.' ? p.name : `${p.name}${subpath.slice(1)}`
        failures.push(
          `${spec} exports \`${n}\`, a \`_\` internal on a public entry. Move it to ${p.name}/internal ` +
            '(an `./internal` subpath export; see "What counts as public API" on the stability page), ' +
            'or, if @pyreon/compiler emits imports of it, add it to COMPILER_ABI.',
        )
      }
    }
    for (const n of allowed) {
      if (!onMain.has(n)) failures.push(`COMPILER_ABI lists \`${n}\` for ${p.name}, which its main entry no longer exports. Remove the stale entry.`)
    }
  }

  return failures
}

// ─── @deprecated ────────────────────────────────────────────────────────────

export interface DeprecatedTag {
  pkg: string
  symbol: string
  file: string
  line: number
}

function declName(node: ts.Node): string | undefined {
  if (ts.isVariableStatement(node)) {
    const d = node.declarationList.declarations[0]
    return d && ts.isIdentifier(d.name) ? d.name.text : undefined
  }
  const name = (node as { name?: ts.Node }).name
  if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name))) return name.text

  return undefined
}

/** Every `@deprecated` JSDoc tag in one source file, with the symbol it annotates. */
export function findDeprecatedTags(source: string, file: string, pkg: string): DeprecatedTag[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: DeprecatedTag[] = []
  const seen = new Set<number>()
  const visit = (node: ts.Node) => {
    const docs = (node as { jsDoc?: ts.JSDoc[] }).jsDoc
    if (docs) {
      for (const doc of docs) {
        for (const tag of doc.tags ?? []) {
          if (tag.tagName.text !== 'deprecated' || seen.has(tag.pos)) continue
          seen.add(tag.pos)
          let symbol = declName(node) ?? '<anonymous>'
          const owner = node.parent
          if (owner && (ts.isInterfaceDeclaration(owner) || ts.isClassDeclaration(owner) || ts.isTypeLiteralNode(owner))) {
            const ownerName = ts.isTypeLiteralNode(owner) ? declName(owner.parent) : declName(owner)
            if (ownerName) symbol = `${ownerName}.${symbol}`
          }
          out.push({ pkg, symbol, file, line: sf.getLineAndCharacterOfPosition(tag.getStart(sf)).line + 1 })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)

  return out
}

interface DeprecatedApiEntry {
  names: string[]
  removeIn: string | undefined
}

/** Manifest API entries marked deprecated, per package (combined names like `a / b` split). */
export async function deprecatedManifestEntries(repoRoot: string): Promise<Map<string, DeprecatedApiEntry[]>> {
  const out = new Map<string, DeprecatedApiEntry[]>()
  for (const { manifest } of await findManifests(repoRoot)) {
    const entries: DeprecatedApiEntry[] = []
    for (const api of manifest.api ?? []) {
      if (api.stability !== 'deprecated') continue
      entries.push({ names: api.name.split(/\s*[/,·]\s*/).filter(Boolean), removeIn: api.deprecated?.removeIn })
    }
    out.set(manifest.name, entries)
  }

  return out
}

export function deprecatedFailures(
  tags: DeprecatedTag[],
  manifestEntries: Map<string, DeprecatedApiEntry[]>,
  allowlist: Record<string, string>,
  repoRoot: string,
): string[] {
  const failures: string[] = []
  const used = new Set<string>()
  for (const t of tags) {
    const key = `${t.pkg}#${t.symbol}`
    const bare = t.symbol.split('.').pop() ?? t.symbol
    const entry = (manifestEntries.get(t.pkg) ?? []).find((e) => e.names.includes(t.symbol) || e.names.includes(bare))
    if (entry?.removeIn) continue
    if (key in allowlist) {
      used.add(key)
      if (!allowlist[key]?.trim()) failures.push(`DEPRECATED_ALLOWLIST['${key}'] has no reason.`)
      continue
    }
    failures.push(
      `${relative(repoRoot, t.file)}:${t.line}: \`@deprecated\` on ${key} has no manifest entry with ` +
        `\`stability: 'deprecated'\` and \`deprecated.removeIn\`. Add one (a Stable API is removed no earlier than the next major), ` +
        `or add '${key}' to DEPRECATED_ALLOWLIST in scripts/check-stability-tier.ts with a reason.`,
    )
  }
  for (const key of Object.keys(allowlist)) {
    if (!used.has(key)) {
      failures.push(`DEPRECATED_ALLOWLIST['${key}'] matches no \`@deprecated\` tag any more. Remove the stale entry.`)
    }
  }

  return failures
}

// ─── docs badge ─────────────────────────────────────────────────────────────

/** `<PackageBadge … status="…">` in docs pages: the tier is generated, never hand-written. */
export function badgeStatusFailures(docsDir: string, repoRoot: string): string[] {
  const failures: string[] = []
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.mdx?$/.test(entry.name)) {
        const src = readFileSync(full, 'utf8')
        for (const m of src.matchAll(/<PackageBadge\b[^>]*?\bstatus=/g)) {
          const line = src.slice(0, m.index).split('\n').length
          failures.push(
            `${relative(repoRoot, full)}:${line}: <PackageBadge> has a hand-written \`status\`. The badge reads the tier from package.json; remove the prop.`,
          )
        }
      }
    }
  }
  if (existsSync(docsDir)) walk(docsDir)

  return failures
}

// ─── private packages ───────────────────────────────────────────────────────

/** Every private package directly under `packages/<category>/`. */
export function listPrivatePackages(repoRoot: string): PublishedPackage[] {
  const out: PublishedPackage[] = []
  const packagesDir = join(repoRoot, 'packages')
  for (const category of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue
    for (const entry of readdirSync(join(packagesDir, category.name), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = join(packagesDir, category.name, entry.name)
      const text = readTextIfExists(join(dir, 'package.json'))
      if (text === undefined) continue
      const pkg = JSON.parse(text) as PackageJson
      if (pkg.private === true && typeof pkg.name === 'string') out.push({ name: pkg.name, dir, pkg })
    }
  }

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** A private package must carry no tier: it makes no semver promise and nothing checks the field. */
export function privatePackageFailures(name: string, pkg: PackageJson, readme: string | undefined): string[] {
  const failures: string[] = []
  if (pkg.pyreon?.stability !== undefined || pkg.pyreon?.experimentalSubpaths !== undefined) {
    failures.push(
      `${name}: private package declares \`pyreon.stability\` / \`experimentalSubpaths\`. An unpublished package has no tier; remove the field and add it when \`"private": true\` goes.`,
    )
  }
  const head = (readme ?? '').split('\n').slice(0, README_HEAD_LINES)
  const idx = head.findIndex((l) => STATUS_LINE_RE.test(l))
  if (idx !== -1) {
    failures.push(
      `${name}: private package's README line ${idx + 1} carries a tier status line. An unpublished package has no tier; remove the line (\`--write\` adds it once the package is published).`,
    )
  }

  return failures
}

// ─── main ───────────────────────────────────────────────────────────────────

/** Map of every published package's tier (invalid fields are skipped and reported by the gate). */
export function readStabilityTable(repoRoot: string): Map<string, StabilityField> {
  const out = new Map<string, StabilityField>()
  for (const p of listAllPublished(repoRoot)) {
    const f = readStabilityField(p)
    if (typeof f !== 'string') out.set(p.name, f)
  }

  return out
}

export async function runGate(repoRoot: string, write: boolean): Promise<string[]> {
  const failures: string[] = []
  const pkgs = listAllPublished(repoRoot)
  const fields = new Map<string, StabilityField>()

  // 1. field present and well-formed
  for (const p of pkgs) {
    const f = readStabilityField(p)
    if (typeof f === 'string') failures.push(f)
    else fields.set(p.name, f)
  }

  // 2. README status line
  for (const p of pkgs) {
    const field = fields.get(p.name)
    const readmePath = join(p.dir, 'README.md')
    if (!field) continue
    let readme = readTextIfExists(readmePath)
    if (readme === undefined) {
      failures.push(`${p.name}: no README.md`)
      continue
    }
    if (write) {
      const next = writeStatusLine(readme, field)
      if (next !== readme) {
        writeFileSync(readmePath, next)
        console.log(`[check-stability-tier] wrote status line: ${relative(repoRoot, readmePath)}`)
        readme = next
      }
    }
    failures.push(...readmeFailures(p.name, readme, field))
  }

  // 3. dependency direction
  failures.push(...dependencyFailures(pkgs, fields))

  // 4. meta
  const meta = pkgs.find((p) => p.name === '@pyreon/meta')
  if (!meta) failures.push('@pyreon/meta not found among published packages.')
  else failures.push(...metaFailures(readFileSync(join(meta.dir, 'src/index.ts'), 'utf8'), fields))

  // 5. @deprecated
  const tags: DeprecatedTag[] = []
  for (const p of pkgs) {
    for (const file of listSourceFiles(join(p.dir, 'src'))) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes('@deprecated')) continue
      tags.push(...findDeprecatedTags(src, file, p.name))
    }
  }
  failures.push(...deprecatedFailures(tags, await deprecatedManifestEntries(repoRoot), DEPRECATED_ALLOWLIST, repoRoot))

  // 6. docs badge
  failures.push(...badgeStatusFailures(join(repoRoot, 'docs/src/content'), repoRoot))

  // 8. `_` exports on public entries are compiler ABI only
  failures.push(...underscoreExportFailures(pkgs))

  // 9. `@internal`-tagged declarations are not on public entries
  failures.push(...internalTagFailures(pkgs))

  // 10. importing another package's internal subpath pins it exact
  failures.push(...internalImportPinFailures(pkgs))

  // 7. private packages carry no tier
  for (const p of listPrivatePackages(repoRoot)) {
    failures.push(...privatePackageFailures(p.name, p.pkg, readTextIfExists(join(p.dir, 'README.md'))))
  }

  return failures
}

if (import.meta.main) {
  const failures = await runGate(REPO, process.argv.includes('--write'))
  if (failures.length > 0) {
    console.error(`✗ check-stability-tier: ${failures.length} failure(s):`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  const tiers = [...readStabilityTable(REPO).values()]
  const stable = tiers.filter((t) => t.stability === 'stable').length
  console.log(`✓ check-stability-tier: ${tiers.length} packages (${stable} stable, ${tiers.length - stable} experimental)`)
}
