#!/usr/bin/env bun
/**
 * check-krausest-entry — the staged js-framework-benchmark entry stays
 * submission-ready.
 *
 * `contrib/krausest/pyreon-keyed/` is copied as-is to `frameworks/keyed/pyreon`
 * in krausest/js-framework-benchmark. Upstream builds it with `npm ci` +
 * `npm run build-prod` and rejects or flags an entry that breaks its rules.
 * The directory is not a workspace member, so nothing else in this repo
 * notices when it drifts. This gate checks, offline and in milliseconds:
 *
 *   - `package.json`: the `js-framework-benchmark` metadata upstream reads,
 *     a `build-prod` script, and exact dependency versions (no ranges, no
 *     `workspace:`), with every `@pyreon/*` dependency on one version;
 *   - `package-lock.json`: present, written by npm (lockfileVersion 3), in
 *     sync with `package.json`, and resolving only from registry.npmjs.org
 *     (upstream's `rebuild-ci` refuses any other registry);
 *   - the pin is the current release or the one before it (a lockfile can
 *     only name a published version, so the pin trails the workspace by at
 *     most one release; `sync-krausest-pin.ts` moves it);
 *   - the markup contract upstream's `isKeyed` and benchmark driver read:
 *     button ids, table classes, the preload icon, and the row template the
 *     real compiler emits for `src/main.tsx`;
 *   - issue flags are declared honestly: a technique upstream marks with a
 *     note (#772, #796, #801) that appears in the source must be listed in
 *     `js-framework-benchmark.issues`, and a listed flag must be a known one;
 *   - the row template uses the same idioms as the workspace's own bench arm
 *     (`examples/benchmark/src/impl/pyreon.tsx`), so the two cannot diverge;
 *   - `README-SUBMISSION.md` does not restate a version.
 *
 * It does not build from npm or drive a browser. Those checks are upstream's
 * own (`npm run rebuild-ci keyed/pyreon`); how to run them is in
 * `.agents/guides/benchmarks/references/krausest-submission.md`.
 *
 * Usage:
 *   bun scripts/check-krausest-entry.ts            # offline gate
 *   bun scripts/check-krausest-entry.ts --online   # also: pin is npm latest
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const ENTRY_DIR = join(REPO_ROOT, 'contrib/krausest/pyreon-keyed')
export const BENCH_ARM = join(REPO_ROOT, 'examples/benchmark/src/impl/pyreon.tsx')
/** Any fixed-group package carries the release version; the entry renders with this one. */
export const VERSION_SOURCE_DIR = join(REPO_ROOT, 'packages/core/runtime-dom')

export const NPM_REGISTRY = 'https://registry.npmjs.org/'
export const REPO_URL = 'https://github.com/pyreon/pyreon'
export const VERSION_PACKAGE = '@pyreon/core'

/** The notes and errors upstream's result table knows (`webdriver-ts-results/src/helpers/issues.ts`). */
export const KNOWN_ISSUES = [634, 772, 796, 800, 801, 1139, 1261] as const

type Deps = Record<string, string>

export interface EntryPackageJson {
  'js-framework-benchmark'?: {
    frameworkVersionFromPackage?: unknown
    frameworkHomeURL?: unknown
    repoURL?: unknown
    language?: unknown
    issues?: unknown
  }
  scripts?: Record<string, string>
  dependencies?: Deps
  devDependencies?: Deps
}

export interface LockPackage {
  version?: string
  resolved?: string
  dependencies?: Deps
  devDependencies?: Deps
}

export interface EntryLockfile {
  lockfileVersion?: number
  packages?: Record<string, LockPackage>
}

const EXACT_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

const allDeps = (pkg: EntryPackageJson): Deps => ({ ...pkg.dependencies, ...pkg.devDependencies })

/** The single version every `@pyreon/*` dependency is pinned to, or `undefined` when they disagree or are not exact. */
export function pinnedPyreonVersion(pkg: EntryPackageJson): string | undefined {
  const versions = new Set(
    Object.entries(allDeps(pkg))
      .filter(([name]) => name.startsWith('@pyreon/'))
      .map(([, version]) => version),
  )
  const [only] = [...versions]
  return versions.size === 1 && only !== undefined && EXACT_VERSION.test(only) ? only : undefined
}

const isHttpsUrl = (value: unknown): value is string => typeof value === 'string' && /^https:\/\/\S+$/.test(value)

function checkMetadata(pkg: EntryPackageJson): string[] {
  const meta = pkg['js-framework-benchmark']
  if (!meta) return ['package.json has no "js-framework-benchmark" block; upstream reads the entry\'s name, version and URLs from it.']
  const problems: string[] = []
  if (meta.frameworkVersionFromPackage !== VERSION_PACKAGE) {
    problems.push(`"js-framework-benchmark".frameworkVersionFromPackage must be "${VERSION_PACKAGE}" (upstream reads the displayed version from its lockfile entry).`)
  } else if (pkg.dependencies?.[VERSION_PACKAGE] === undefined) {
    problems.push(`frameworkVersionFromPackage names ${VERSION_PACKAGE}, which is not in "dependencies".`)
  }
  if (!isHttpsUrl(meta.frameworkHomeURL)) problems.push('"js-framework-benchmark".frameworkHomeURL must be an https URL.')
  if (meta.repoURL !== REPO_URL) {
    problems.push(`"js-framework-benchmark".repoURL must be "${REPO_URL}" (upstream archives entries whose repository shows no activity for a year).`)
  }
  if (typeof meta.language !== 'string' || meta.language === '') problems.push('"js-framework-benchmark".language is missing.')
  return problems
}

/** Metadata, the build script and exact pins. */
export function checkPackageJson(pkg: EntryPackageJson): string[] {
  const problems = checkMetadata(pkg)
  if (!pkg.scripts?.['build-prod']) problems.push('package.json has no "build-prod" script; upstream builds every entry with `npm run build-prod`.')
  const deps = Object.entries(allDeps(pkg))
  if (!deps.some(([name]) => name.startsWith('@pyreon/'))) problems.push('package.json depends on no @pyreon/* package.')
  for (const [name, version] of deps) {
    if (!EXACT_VERSION.test(version)) {
      problems.push(`${name}@${version} is not an exact version. Upstream requires fixed versions, no ranges; \`workspace:\` cannot resolve there at all. Run \`bun scripts/sync-krausest-pin.ts\`.`)
    }
  }
  if (problems.length === 0 && pinnedPyreonVersion(pkg) === undefined) {
    problems.push('the @pyreon/* dependencies are pinned to different versions. Run `bun scripts/sync-krausest-pin.ts`.')
  }
  return problems
}

const sameDeps = (a: Deps | undefined, b: Deps | undefined): boolean => {
  const left = Object.entries(a ?? {}).sort()
  const right = Object.entries(b ?? {}).sort()
  return JSON.stringify(left) === JSON.stringify(right)
}

/** Every locked package comes from the public registry, and no transitive `@pyreon/*` package is off the pin. */
function checkLockedPackages(pkg: EntryPackageJson, packages: Record<string, LockPackage>, fix: string): string[] {
  const problems: string[] = []
  const pin = pinnedPyreonVersion(pkg)
  const direct = allDeps(pkg)
  const mixed: string[] = []
  for (const [path, entry] of Object.entries(packages)) {
    if (entry.resolved !== undefined && !entry.resolved.startsWith(NPM_REGISTRY)) {
      problems.push(`package-lock.json resolves ${path} from ${entry.resolved}; upstream allows only ${NPM_REGISTRY}. ${fix}`)
    }
    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
    // Direct dependencies are reported by the caller; this is the transitive half (the compiler and its binaries).
    if (pin !== undefined && name.startsWith('@pyreon/') && !(name in direct) && entry.version !== pin) {
      mixed.push(`${name}@${entry.version ?? '(missing)'}`)
    }
  }
  if (mixed.length > 0) {
    problems.push(`package-lock.json has ${mixed.join(', ')} next to the ${pin} pin, so the entry would mix Pyreon releases. ${fix}`)
  }
  return problems
}

/** The lockfile is npm's, matches `package.json`, and resolves from the public registry only. */
export function checkLockfile(pkg: EntryPackageJson, lock: EntryLockfile | undefined): string[] {
  const fix = 'Run `bun scripts/sync-krausest-pin.ts` to regenerate it with npm.'
  if (!lock) return [`package-lock.json is missing; upstream builds with \`npm ci\`, which needs it. ${fix}`]
  const packages = lock.packages
  if (lock.lockfileVersion !== 3 || !packages) return [`package-lock.json is not an npm lockfileVersion 3 file. ${fix}`]
  const problems: string[] = []
  const root = packages['']
  if (!sameDeps(root?.dependencies, pkg.dependencies) || !sameDeps(root?.devDependencies, pkg.devDependencies)) {
    problems.push(`package-lock.json is out of sync with package.json (its root dependency lists differ), so \`npm ci\` would fail. ${fix}`)
  }
  for (const [name, version] of Object.entries(allDeps(pkg))) {
    const locked = packages[`node_modules/${name}`]?.version
    if (locked !== version) problems.push(`package-lock.json has ${name}@${locked ?? '(missing)'}, package.json pins ${version}. ${fix}`)
  }
  problems.push(...checkLockedPackages(pkg, packages, fix))
  return problems
}

/** Release versions in a changeset CHANGELOG, newest first. */
export function changelogVersions(changelog: string): string[] {
  return [...changelog.matchAll(/^## (\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\s*$/gm)].map((m) => m[1]!)
}

/**
 * The versions the pin may name: the workspace version and the release before
 * it. The lockfile can only name a published version, and the release PR
 * bumps the workspace before anything is published, so "current" alone would
 * turn every release PR red.
 */
export function acceptablePins(workspaceVersion: string, changelog: string): string[] {
  const previous = changelogVersions(changelog).find((v) => v !== workspaceVersion)
  return previous === undefined ? [workspaceVersion] : [workspaceVersion, previous]
}

export function checkPinFreshness(pkg: EntryPackageJson, workspaceVersion: string, changelog: string): string[] {
  const pin = pinnedPyreonVersion(pkg)
  if (pin === undefined) return []
  const acceptable = acceptablePins(workspaceVersion, changelog)
  if (acceptable.includes(pin)) return []
  return [
    `the entry pins Pyreon ${pin}, but the workspace is at ${workspaceVersion}. Submitting it would publish an old Pyreon as the independent result. Accepted: ${acceptable.join(' or ')}. Run \`bun scripts/sync-krausest-pin.ts\`, then re-run upstream's checks (.agents/guides/benchmarks/references/krausest-submission.md).`,
  ]
}

interface Tag {
  name: string
  attrs: Record<string, string>
}

function parseTags(html: string): Tag[] {
  return [...html.matchAll(/<([a-z][a-z0-9]*)((?:\s+[a-z-]+="[^"]*")*)\s*>/g)].map((m) => ({
    name: m[1]!,
    attrs: Object.fromEntries([...m[2]!.matchAll(/([a-z-]+)="([^"]*)"/g)].map((a) => [a[1]!, a[2]!])),
  }))
}

/** Every static template the compiler emitted, unescaped. */
export function compiledTemplates(compiled: string): string[] {
  return [...compiled.matchAll(/_tpl\("((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]!.replace(/\\(.)/g, '$1'))
}

const BUTTON_IDS = ['run', 'runlots', 'add', 'update', 'clear', 'swaprows']
/** What upstream's `isKeyed` asserts about row 1000: the element sequence and these attributes. */
const ROW_SHAPE: Tag[] = [
  { name: 'tr', attrs: {} },
  { name: 'td', attrs: { class: 'col-md-1' } },
  { name: 'td', attrs: { class: 'col-md-4' } },
  { name: 'a', attrs: {} },
  { name: 'td', attrs: { class: 'col-md-1' } },
  { name: 'a', attrs: {} },
  { name: 'span', attrs: { class: 'glyphicon glyphicon-remove', 'aria-hidden': 'true' } },
  { name: 'td', attrs: { class: 'col-md-6' } },
]

function checkRowTemplate(templates: readonly string[]): string[] {
  const row = templates.find((t) => t.startsWith('<tr'))
  if (row === undefined) return ['the compiler emitted no <tr> template for the row; the keyed row markup is gone from src/main.tsx.']
  const tags = parseTags(row)
  const expected = ROW_SHAPE.map((t) => t.name).join(' ')
  if (tags.map((t) => t.name).join(' ') !== expected) {
    return [`the compiled row template has elements "${tags.map((t) => t.name).join(' ')}"; upstream's isKeyed requires exactly "${expected}" (error #634 otherwise).`]
  }
  const problems: string[] = []
  ROW_SHAPE.forEach((want, i) => {
    for (const [attr, value] of Object.entries(want.attrs)) {
      if (tags[i]!.attrs[attr] !== value) {
        problems.push(`the compiled row template's <${want.name}> (element ${i}) needs ${attr}="${value}", found ${JSON.stringify(tags[i]!.attrs[attr])} (upstream error #634).`)
      }
    }
  })
  return problems
}

/**
 * The markup contract, read from the code the real compiler emits for
 * `src/main.tsx` (`compiled`) and from `index.html`.
 */
export function checkMarkup(source: string, compiled: string, indexHtml: string): string[] {
  const problems = checkRowTemplate(compiledTemplates(compiled))
  for (const id of BUTTON_IDS) {
    if (!new RegExp(`\\bid="${id}"`).test(source)) problems.push(`src/main.tsx has no button with id="${id}"; upstream's driver clicks it by that id.`)
  }
  const required: [RegExp, string][] = [
    [/class="table table-hover table-striped test-data"/, 'the table with class="table table-hover table-striped test-data"'],
    [/class="preloadicon glyphicon glyphicon-remove" aria-hidden="true"/, 'the preload icon span (class="preloadicon glyphicon glyphicon-remove" aria-hidden="true")'],
    [/class="btn btn-primary btn-block"/, 'the button classes "btn btn-primary btn-block"'],
    [/'danger'/, "the 'danger' class for the selected row"],
  ]
  for (const [pattern, what] of required) {
    if (!pattern.test(source)) problems.push(`src/main.tsx is missing ${what}.`)
  }
  if (!indexHtml.includes('href="/css/currentStyle.css"')) problems.push('index.html must link the shared stylesheet /css/currentStyle.css.')
  if (!/id=['"]main['"]/.test(indexHtml)) problems.push('index.html has no #main mount element.')
  if (!/src=['"]dist\/main\.js['"]/.test(indexHtml)) problems.push('index.html must load dist/main.js, the file the build writes.')
  if (/https?:\/\//.test(indexHtml)) problems.push('index.html references an absolute URL; an entry must load nothing from a CDN.')
  return problems
}

/** Techniques upstream marks with a note, and the source shapes that mean the entry uses them. */
const FLAGGED_TECHNIQUES: { issue: number; label: string; pattern: RegExp }[] = [
  { issue: 796, label: 'an explicit requestAnimationFrame call', pattern: /\brequestAnimationFrame\b/ },
  { issue: 801, label: 'manual event delegation (addEventListener in client code)', pattern: /\baddEventListener\b/ },
  {
    issue: 772,
    label: 'manual DOM manipulation',
    pattern: /\b(?:classList|className|innerHTML|textContent|createElement|cloneNode|insertBefore|appendChild|removeChild|replaceChildren|querySelector(?:All)?)\b/,
  },
]

/** A technique upstream flags is either absent from the source or declared in `issues`. */
export function checkIssueFlags(pkg: EntryPackageJson, source: string): string[] {
  const raw = pkg['js-framework-benchmark']?.issues
  if (raw !== undefined && !(Array.isArray(raw) && raw.every((n) => typeof n === 'number'))) {
    return ['"js-framework-benchmark".issues must be an array of issue numbers.']
  }
  const declared = (raw ?? []) as number[]
  const problems = declared
    .filter((n) => !(KNOWN_ISSUES as readonly number[]).includes(n))
    .map((n) => `"js-framework-benchmark".issues lists #${n}, which is not one of upstream's flags (${KNOWN_ISSUES.join(', ')}).`)
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  for (const { issue, label, pattern } of FLAGGED_TECHNIQUES) {
    if (pattern.test(code) && !declared.includes(issue)) {
      problems.push(`src/main.tsx uses ${label}, which upstream marks with note #${issue}. Remove it (the entry is meant to be idiomatic Pyreon) or declare ${issue} in "js-framework-benchmark".issues.`)
    }
  }
  return problems
}

export type RowIdioms = Record<'each' | 'by' | 'rowClass' | 'idCell' | 'label', string | undefined>

const squash = (text: string | undefined): string | undefined => text?.replace(/\s+/g, ' ').trim()

/**
 * The reactive shape of a row list, with what legitimately differs between
 * the two files normalised away: type annotations and the selected-row class
 * name.
 */
export function rowIdioms(source: string): RowIdioms {
  const first = (pattern: RegExp): string | undefined => squash(pattern.exec(source)?.[1])
  return {
    each: first(/<For\s+each=\{([^}]+)\}/),
    by: first(/\bby=\{([^}]+)\}/)?.replace(/:\s*\w+/g, ''),
    rowClass: first(/<tr\s+class=\{(.+?)\}>/)?.replace(/'[^']+'/, "'<selected>'"),
    idCell: first(/<td[^>]*>\{([^{}]+)\}<\/td>/),
    label: first(/>\{([^{}]*\.label\b[^{}]*)\}</),
  }
}

/** The staged entry and the workspace bench arm render a row with the same idioms. */
export function checkRowParity(entrySource: string, benchSource: string): string[] {
  const entry = rowIdioms(entrySource)
  const bench = rowIdioms(benchSource)
  const problems: string[] = []
  for (const key of ['each', 'by', 'rowClass', 'idCell', 'label'] as const) {
    if (entry[key] === undefined || bench[key] === undefined) {
      const where = entry[key] === undefined ? 'contrib/krausest/pyreon-keyed/src/main.tsx' : 'examples/benchmark/src/impl/pyreon.tsx'
      problems.push(`could not read the row template's "${key}" from ${where}; the row markup changed shape, so this gate can no longer compare the two. Update rowIdioms in scripts/check-krausest-entry.ts.`)
    } else if (entry[key] !== bench[key]) {
      problems.push(`the row template's "${key}" differs: the staged entry has \`${entry[key]}\`, the workspace bench arm has \`${bench[key]}\`. The official entry must measure the idiom the local board measures; change both together.`)
    }
  }
  return problems
}

/** The README points at `package.json` for the version instead of restating one. */
export function checkReadme(readme: string): string[] {
  return [...readme.matchAll(/@pyreon\/[^\s`)]*@\^?\d+\.\d+\.\d+/g)].map(
    (m) => `README-SUBMISSION.md spells out "${m[0]}". Prose that restates the pin drifts from it; name package.json as the source instead.`,
  )
}

export interface EntryFiles {
  pkg: EntryPackageJson
  lock: EntryLockfile | undefined
  source: string
  compiled: string
  indexHtml: string
  readme: string
  benchSource: string
  workspaceVersion: string
  changelog: string
}

export function checkEntry(files: EntryFiles): string[] {
  return [
    ...checkPackageJson(files.pkg),
    ...checkLockfile(files.pkg, files.lock),
    ...checkPinFreshness(files.pkg, files.workspaceVersion, files.changelog),
    ...checkMarkup(files.source, files.compiled, files.indexHtml),
    ...checkIssueFlags(files.pkg, files.source),
    ...checkRowParity(files.source, files.benchSource),
    ...checkReadme(files.readme),
  ]
}

const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T

/**
 * What the real compiler emits for an entry source. From the compiler's own
 * source: a compiled-template fact is only true of what `transformJSX` emits,
 * and `lib/` may be absent in a lib-free job.
 */
export async function compileSource(source: string): Promise<string> {
  const { transformJSX } = await import('../packages/core/compiler/src/index')
  return transformJSX(source, 'main.tsx').code
}

export async function readEntryFiles(): Promise<EntryFiles> {
  const source = readFileSync(join(ENTRY_DIR, 'src/main.tsx'), 'utf8')
  const lockPath = join(ENTRY_DIR, 'package-lock.json')
  return {
    pkg: readJson<EntryPackageJson>(join(ENTRY_DIR, 'package.json')),
    lock: existsSync(lockPath) ? readJson<EntryLockfile>(lockPath) : undefined,
    source,
    compiled: await compileSource(source),
    indexHtml: readFileSync(join(ENTRY_DIR, 'index.html'), 'utf8'),
    readme: readFileSync(join(ENTRY_DIR, 'README-SUBMISSION.md'), 'utf8'),
    benchSource: readFileSync(BENCH_ARM, 'utf8'),
    workspaceVersion: readJson<{ version: string }>(join(VERSION_SOURCE_DIR, 'package.json')).version,
    changelog: readFileSync(join(VERSION_SOURCE_DIR, 'CHANGELOG.md'), 'utf8'),
  }
}

/** `--online`: the pin is what npm serves as latest. Needs the network, so it is not part of the gate. */
function checkNpmLatest(pkg: EntryPackageJson): string[] {
  const result = spawnSync('npm', ['view', VERSION_PACKAGE, 'version'], { encoding: 'utf8' })
  const latest = result.stdout.trim()
  if (result.status !== 0 || latest === '') return [`could not ask npm for the latest ${VERSION_PACKAGE} (exit ${result.status}).`]
  const pin = pinnedPyreonVersion(pkg)
  if (pin === latest) return []
  return [`npm's latest ${VERSION_PACKAGE} is ${latest}, the entry pins ${pin ?? '(nothing consistent)'}. Run \`bun scripts/sync-krausest-pin.ts\` before submitting.`]
}

async function main(): Promise<void> {
  const files = await readEntryFiles()
  const problems = checkEntry(files)
  if (process.argv.includes('--online')) problems.push(...checkNpmLatest(files.pkg))
  if (problems.length === 0) {
    console.log(`[check-krausest-entry] OK — the staged entry pins Pyreon ${pinnedPyreonVersion(files.pkg)} with a matching npm lockfile, metadata and markup.`)
    return
  }
  for (const problem of problems) console.error(`[check-krausest-entry] ✗ ${problem}`)
  process.exit(1)
}

if (import.meta.main) await main()
