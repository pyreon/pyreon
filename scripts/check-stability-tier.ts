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
  '@pyreon/validation#StandardSchemaShape':
    'Type alias with no manifest entry of its own. Removal is tracked with the Standard Schema type consolidation (1.0 readiness M2).',
  '@pyreon/native-compiler#NATIVE_COMPILER_PLUGIN_API_VERSION':
    'Experimental package with no manifest. Frozen at 1 on purpose: old plugins import it at runtime to declare API 1.',
  '@pyreon/cli#DoctorOptions.auditTests':
    'Legacy `pyreon doctor` flag. `@pyreon/cli` has no manifest; removal is tracked in 1.0 readiness M7.',
  '@pyreon/cli#DoctorOptions.checkIslands':
    'Legacy `pyreon doctor` flag. `@pyreon/cli` has no manifest; removal is tracked in 1.0 readiness M7.',
  '@pyreon/cli#DoctorOptions.checkSsg':
    'Legacy `pyreon doctor` flag. `@pyreon/cli` has no manifest; removal is tracked in 1.0 readiness M7.',
  '@pyreon/cli#DoctorOptions.checkContent':
    'Legacy `pyreon doctor` flag. `@pyreon/cli` has no manifest; removal is tracked in 1.0 readiness M7.',
  '@pyreon/cli#DoctorOptions.checkNative':
    'Legacy `pyreon doctor` flag. `@pyreon/cli` has no manifest; removal is tracked in 1.0 readiness M7.',
  '@pyreon/styler#ThemeProvider':
    'Source says deprecated, the manifest documents standalone use. Whether it is removed or undeprecated is undecided (1.0 readiness M4).',
  '@pyreon/unistyle#Provider':
    'Low-level provider with no manifest API entry (only a gotcha note). Its future is undecided (1.0 readiness M4).',
  '@pyreon/zero-content#generateSitemap':
    'Removed outright by #4554, which lands before this gate; the entry goes when this branch is rebased onto it.',
  '@pyreon/zero-content#generateRssFeed':
    'Removed outright by #4554, which lands before this gate; the entry goes when this branch is rebased onto it.',
  '@pyreon/zero-content#toRfc822':
    'Removed outright by #4554, which lands before this gate; the entry goes when this branch is rebased onto it.',
  '@pyreon/zero-content#generateLlmsTxt':
    'Removed outright by #4554, which lands before this gate; the entry goes when this branch is rebased onto it.',
  '@pyreon/zero-content#shortId':
    '`@internal` helper exported from `./plugin` for tests; not part of the documented surface (1.0 readiness M5).',
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
