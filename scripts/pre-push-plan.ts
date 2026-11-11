/**
 * What the pre-push hook checks for a diff (the path classifier), and the
 * local pass cache that lets it skip work it has already seen pass.
 * `scripts/pre-push.ts` runs the plan under the hook's time cap.
 *
 * ## The contract
 *
 * The hook checks what the push can break, cheapest and most likely first;
 * GitHub CI is the full gate (the whole reverse-dependency closure's tests,
 * the native-compiler suite, the Swift/Kotlin lanes, all behind required
 * checks). Each changed path maps to the checks it can affect through one
 * explicit rule (`PATH_RULES`, documented in `.agents/rules/workflow.md`):
 * a workspace file → that workspace's typecheck and tests; a budgets JSON →
 * the tests that read it; a lockfile → a frozen-lockfile dry run; a workflow →
 * the tests that read it; an unknown root file → the `@pyreon/test-utils` suite. The hook
 * never typechecks or tests beyond the directly changed packages (the
 * maintainer's standing rule: one heavy run at a time on a shared machine; the
 * reverse-dependency closure and the workspace typecheck are CI's).
 * Native-toolchain packages (`packages/native/*`) run only when they
 * themselves changed.
 *
 * ## The pass cache
 *
 * A pass is recorded under a key built from the content git sees (tracked plus
 * untracked-not-ignored files, so build output and ignored scratch never enter
 * it) of: the package's own tree; every transitive `@pyreon/*` dependency's
 * tree; the files `affected.ts` maps to the package as a leaf (`scripts/**`
 * for `@pyreon/test-utils`, doc inputs for their parser); every root file
 * `affected.ts` treats as global (`bun.lock`, root `package.json`,
 * `tsconfig*.json`, root `vitest.*.ts`, `.bun-version`, …); and the bun
 * version. Same bytes → same key on a re-push, a rebase, or a merge from main
 * that did not touch the package's inputs. Only PASSES are written; a failure
 * writes nothing, so it re-runs every time. Stored in the git common dir,
 * shared by every worktree, bounded by count and age.
 *
 * A test that reads files outside those inputs (another package's tests, an
 * example app) can be satisfied by a stale pass locally. That is accepted here
 * because CI re-runs everything without the cache; `PYREON_PRE_PUSH_NO_CACHE=1`
 * ignores it for one push.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  discoverWorkspaces,
  docInputConsumer,
  findOwningWorkspace,
  isE2eFile,
  isRootFile,
  isScriptFile,
  isWorkflowFile,
  SCRIPT_TEST_PACKAGE,
  transitiveDependents,
  type Workspace,
} from './affected'
import { computeFileListHash } from './bootstrap-hash'

export const PASS_CACHE_FILE = 'pyreon-pre-push-pass-cache.json'
/** Bump to invalidate every recorded pass (key scheme changed). */
export const PASS_CACHE_VERSION = 1
export const PASS_CACHE_MAX_ENTRIES = 4000
export const PASS_CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export type Group = 'typecheck' | 'test' | 'native-vitest' | 'native-script'
export const GROUPS: readonly Group[] = ['typecheck', 'test', 'native-vitest', 'native-script']
/** Typecheck passes and test passes are separate facts about the same bytes. */
const stepOf = (g: Group): 'typecheck' | 'test' => (g === 'typecheck' ? 'typecheck' : 'test')

export interface WorkspaceInfo extends Workspace {
  scripts: Record<string, string>
}

/**
 * What a changed path can break, and so what the hook checks for it. Every
 * changed path gets exactly one rule (first match wins); the plan is the union.
 * `.agents/rules/workflow.md` ("Pre-push hook") documents this table.
 */
export type RuleId =
  | 'package'
  | 'root-tsconfig'
  | 'install'
  | 'root-vitest'
  | 'workflow'
  | 'shared-action'
  | 'script'
  | 'repo-file'
  | 'prose'
  | 'unknown-root'

export const PATH_RULES: ReadonlyArray<{ id: RuleId; match: string; checks: string }> = [
  { id: 'package', match: 'a file inside a workspace', checks: 'typecheck + tests of that workspace' },
  { id: 'root-tsconfig', match: 'root `tsconfig*.json`', checks: 'validate-fast only (`check-tsconfig-presets`); CI typechecks the workspace' },
  { id: 'install', match: '`bun.lock`, root `package.json`, `.bun-version`', checks: '`bun install --frozen-lockfile --dry-run`' },
  { id: 'root-vitest', match: 'root `vitest.*.ts` (every suite\'s setup)', checks: 'the `@pyreon/test-utils` suite as a setup smoke test' },
  { id: 'workflow', match: '`.github/workflows/*`', checks: 'the `@pyreon/test-utils` tests that name the file (validate-fast runs the CI-config gates)' },
  { id: 'shared-action', match: '`.github/actions/**`', checks: 'the `@pyreon/test-utils` tests that name the file' },
  { id: 'script', match: '`scripts/**`', checks: 'the `@pyreon/test-utils` tests that name the file or a script that imports or reads it; `@pyreon/test-utils` typecheck for code' },
  { id: 'repo-file', match: '`e2e/**`, `.claude/**`, `.githooks/**`', checks: 'the `@pyreon/test-utils` tests that name the file' },
  { id: 'prose', match: 'Markdown, `.agents/**`, `.changeset/**`, `llms*.txt` outside a workspace', checks: 'validate-fast only (plus the parser package of a doc input)' },
  { id: 'unknown-root', match: 'any other root file', checks: 'fallback: the full `@pyreon/test-utils` suite (the package that tests repository-level files)' },
]

export interface Plan {
  /** The diff could not be computed (base ref missing): treated as an unknown root change. */
  unknownDiff: boolean
  /** Which rule each changed path matched. */
  rules: Array<{ path: string; rule: RuleId }>
  /** Directly changed workspaces, plus the leaf seeds (doc-input parsers, test-utils for a test-utils change). */
  direct: string[]
  /** Size of the reverse-dependency closure CI runs. */
  closureSize: number
  /** The directly changed workspaces' checks. */
  groups: Record<Group, string[]>
  /**
   * When `@pyreon/test-utils` is in `groups.test` only because of
   * non-workspace files: the test files to run. `null` = the whole suite.
   */
  targetedTests: string[] | null
  /** Run `bun install --frozen-lockfile --dry-run`. */
  installCheck: boolean
}

export function isNativeToolchainWorkspace(ws: Workspace, root: string): boolean {
  return ws.dir.startsWith(join(root, 'packages', 'native') + sep)
}

const PROSE = [/\.mdx?$/i, /^\.agents\//, /^\.changeset\//, /^llms(-full)?\.txt$/, /^LICENSE/, /^\.gitignore$/]

/** The rule for one changed path that no workspace owns (see `PATH_RULES`). */
export function classifyRootPath(path: string): Exclude<RuleId, 'package'> {
  if (/^tsconfig.*\.json$/.test(path)) return 'root-tsconfig'
  if (path === 'bun.lock' || path === 'package.json' || path === '.bun-version') return 'install'
  if (/^vitest\.[^/]*\.ts$/.test(path)) return 'root-vitest'
  if (path.startsWith('.github/workflows/')) return 'workflow'
  if (path.startsWith('.github/actions/')) return 'shared-action'
  if (isScriptFile(path)) return 'script'
  if (isE2eFile(path) || path.startsWith('e2e/') || path.startsWith('.claude/') || path.startsWith('.githooks/'))
    return 'repo-file'
  if (PROSE.some((re) => re.test(path))) return 'prose'
  return 'unknown-root'
}

/**
 * Source without `//` line comments and block comments. Approximate (a `//`
 * inside a string is cut too), which only ever drops a match, and only in a
 * line that also holds a string with `//` in it.
 */
export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}

/** Escape a string for use inside a RegExp. */
const reEscape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * The `@pyreon/test-utils` test files that can observe a change to `paths`.
 *
 * A test observes a file when its source names it — the import specifier
 * (`scripts/affected`) or the quoted file name (`'bundle-budgets.json'`) —
 * or names a script that imports or reads it, transitively (a change to
 * `scripts/changed-files.ts` reaches the tests of every script that imports
 * it). A test that observes a file without naming it (one that globs a
 * directory) is not selected; CI runs the whole suite.
 */
export function targetTestFiles(
  paths: readonly string[],
  tests: ReadonlyMap<string, string>,
  scripts: ReadonlyMap<string, string>,
): string[] {
  const needles = (path: string): RegExp[] => {
    const base = path.slice(path.lastIndexOf('/') + 1)
    const stem = path.replace(/\.(ts|tsx|mts|js|mjs|cjs)$/, '')
    return [
      new RegExp(`${reEscape(stem)}(?![\\w.-])`),
      new RegExp(`['"\`/]${reEscape(base)}['"\`]`),
      new RegExp(`\\./${reEscape(base.replace(/\.(ts|tsx|mts|js|mjs|cjs)$/, ''))}(\\.[mc]?[jt]sx?)?['"\`]`),
    ]
  }
  // Comments name files they do not read (`affected.ts` explains
  // `bundle-budgets.json` in prose); match a script's code only.
  const code = new Map([...scripts].map(([f, t]) => [f, stripComments(t)]))
  // Every script reached from the changed paths through "names it".
  const reached = new Set(paths)
  const queue = [...paths]
  while (queue.length > 0) {
    const cur = queue.shift()!
    const res = needles(cur)
    for (const [file, text] of code) {
      if (reached.has(file)) continue
      // A `./x` specifier only resolves against a file in the same directory.
      const sameDir = file.slice(0, file.lastIndexOf('/')) === cur.slice(0, cur.lastIndexOf('/'))
      if (res[0]!.test(text) || res[1]!.test(text) || (sameDir && res[2]!.test(text))) {
        reached.add(file)
        queue.push(file)
      }
    }
  }
  const out: string[] = []
  const all = [...reached].map(needles)
  for (const [file, text] of tests) {
    if (all.some((res) => res[0]!.test(text) || res[1]!.test(text))) out.push(file)
  }
  return out.sort()
}

/** Pure: which checks the hook runs for a diff, before the pass cache. */
export function computePlan(opts: {
  changed: string[] | null
  workspaces: WorkspaceInfo[]
  root: string
  /** `@pyreon/test-utils` test files (repo-relative path → source), for targeting. */
  testFiles?: ReadonlyMap<string, string>
  /** `scripts/**` sources (repo-relative path → source), for the import/read graph. */
  scriptFiles?: ReadonlyMap<string, string>
}): Plan {
  const { workspaces, root } = opts
  const unknownDiff = opts.changed === null
  const changed = opts.changed ?? []
  const byName = new Map(workspaces.map((w) => [w.name, w]))
  const has = (name: string, script: string) => Boolean(byName.get(name)?.scripts[script])
  const native = (name: string) => {
    const ws = byName.get(name)
    return ws !== undefined && isNativeToolchainWorkspace(ws, root)
  }

  const rules: Plan['rules'] = []
  const seeds = new Set<string>()
  const leaves = new Set<string>()
  const observed: string[] = []
  let installCheck = false
  let fullTestUtils = unknownDiff
  let testUtilsTypecheck = false

  for (const path of changed) {
    const consumer = docInputConsumer(path)
    if (consumer && byName.has(consumer)) leaves.add(consumer)
    const ws = findOwningWorkspace(path, workspaces, root)
    if (ws) {
      seeds.add(ws.name)
      rules.push({ path, rule: 'package' })
      continue
    }
    const rule = classifyRootPath(path)
    rules.push({ path, rule })
    switch (rule) {
      case 'root-tsconfig':
        break
      case 'install':
        installCheck = true
        break
      case 'root-vitest':
        fullTestUtils = true
        break
      case 'workflow':
        observed.push(path)
        break
      case 'shared-action':
        observed.push(path)
        break
      case 'script':
        if (/\.(ts|tsx|mts)$/.test(path)) testUtilsTypecheck = true
        observed.push(path)
        break
      case 'repo-file':
        observed.push(path)
        break
      case 'prose':
        break
      case 'unknown-root':
        fullTestUtils = true
        break
    }
  }

  const testUtils = byName.has(SCRIPT_TEST_PACKAGE) ? SCRIPT_TEST_PACKAGE : undefined
  let targetedTests: string[] | null = null
  if (testUtils && !seeds.has(testUtils) && !leaves.has(testUtils)) {
    if (fullTestUtils) leaves.add(testUtils)
    else if (observed.length > 0) {
      targetedTests = targetTestFiles(observed, opts.testFiles ?? new Map(), opts.scriptFiles ?? new Map())
      if (targetedTests.length > 0) leaves.add(testUtils)
      else targetedTests = null
    }
  }

  const direct = [...new Set([...seeds, ...leaves])].sort()
  const typecheck = new Set(direct.filter((n) => has(n, 'typecheck') && (n !== testUtils || seeds.has(n) || fullTestUtils)))
  if (testUtils && testUtilsTypecheck && has(testUtils, 'typecheck')) typecheck.add(testUtils)

  const closureSize = unknownDiff ? workspaces.length : transitiveDependents(seeds, workspaces).size + leaves.size

  const groups: Record<Group, string[]> = {
    typecheck: [...typecheck].sort(),
    test: [],
    'native-vitest': [],
    'native-script': [],
  }
  for (const name of direct) {
    if (!has(name, 'test')) continue
    if (!native(name)) groups.test.push(name)
    else if (/^vitest\b/.test(byName.get(name)!.scripts.test!)) groups['native-vitest'].push(name)
    else groups['native-script'].push(name)
  }
  return {
    unknownDiff,
    rules,
    direct,
    closureSize,
    groups,
    targetedTests,
    installCheck,
  }
}

// ── Pass keys ──────────────────────────────────────────────────────────────

/**
 * Pure over (root, files): the content key of every requested workspace.
 * `files` is git's repo-relative view of the working tree.
 */
export function computePassKeys(opts: {
  root: string
  files: readonly string[]
  workspaces: Workspace[]
  packages: readonly string[]
  runtime?: string
}): Map<string, string> {
  const { root, files, workspaces } = opts
  const runtime = opts.runtime ?? `bun-${process.versions.bun ?? 'none'}-${process.platform}-${process.arch}`
  const byName = new Map(workspaces.map((w) => [w.name, w]))
  const byRelDir = new Map(workspaces.map((w) => [relative(root, w.dir), w.name]))

  const treeFiles = new Map<string, string[]>()
  const extraFiles = new Map<string, string[]>()
  const rootFiles: string[] = []
  const push = (m: Map<string, string[]>, k: string, v: string) => {
    const bucket = m.get(k)
    if (bucket) bucket.push(v)
    else m.set(k, [v])
  }
  for (const file of files) {
    if (isRootFile(file)) rootFiles.push(file)
    if (isScriptFile(file) || isE2eFile(file) || isWorkflowFile(file)) push(extraFiles, SCRIPT_TEST_PACKAGE, file)
    const consumer = docInputConsumer(file)
    if (consumer) push(extraFiles, consumer, file)
    let dir = dirname(file)
    while (dir !== '.' && dir !== '') {
      const owner = byRelDir.get(dir)
      if (owner) {
        push(treeFiles, owner, file)
        break
      }
      dir = dirname(dir)
    }
  }

  const salt = computeFileListHash(root, rootFiles, `pass-cache-v${PASS_CACHE_VERSION}|${runtime}`)
  const treeMemo = new Map<string, string>()
  const tree = (name: string) => {
    let h = treeMemo.get(name)
    if (h === undefined) {
      h = computeFileListHash(root, treeFiles.get(name) ?? [], name)
      treeMemo.set(name, h)
    }
    return h
  }

  const out = new Map<string, string>()
  for (const name of opts.packages) {
    const deps = new Set<string>()
    const queue = [...(byName.get(name)?.deps ?? [])]
    while (queue.length > 0) {
      const d = queue.shift() as string
      if (deps.has(d) || d === name || !byName.has(d)) continue
      deps.add(d)
      queue.push(...byName.get(d)!.deps)
    }
    const parts = [
      salt,
      tree(name),
      computeFileListHash(root, extraFiles.get(name) ?? [], 'extra'),
      ...[...deps].sort().map((d) => `${d}=${tree(d)}`),
    ]
    out.set(name, computeFileListHash(root, [], parts.join('\n')))
  }
  return out
}

// ── Cache store ────────────────────────────────────────────────────────────

export interface PassCache {
  version: number
  /** entry key → epoch ms it last passed */
  entries: Record<string, number>
}

export const entryKey = (group: Group, pkg: string, key: string) => `${stepOf(group)}|${pkg}|${key}`

export function parseCache(text: string | null): PassCache {
  if (text === null) return { version: PASS_CACHE_VERSION, entries: {} }
  try {
    const raw = JSON.parse(text) as Partial<PassCache>
    if (raw.version !== PASS_CACHE_VERSION || typeof raw.entries !== 'object' || raw.entries === null)
      return { version: PASS_CACHE_VERSION, entries: {} }
    const entries: Record<string, number> = {}
    for (const [k, v] of Object.entries(raw.entries)) if (typeof v === 'number') entries[k] = v
    return { version: PASS_CACHE_VERSION, entries }
  } catch {
    // A corrupt store is an empty store: everything re-runs, nothing is skipped.
    return { version: PASS_CACHE_VERSION, entries: {} }
  }
}

/** Add passes, then drop entries past the age limit and the oldest past the count limit. */
export function recordPasses(cache: PassCache, keys: readonly string[], now: number): PassCache {
  const entries = { ...cache.entries }
  for (const k of keys) entries[k] = now
  const kept = Object.entries(entries)
    .filter(([, t]) => now - t <= PASS_CACHE_MAX_AGE_MS)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, PASS_CACHE_MAX_ENTRIES)
  return { version: PASS_CACHE_VERSION, entries: Object.fromEntries(kept) }
}

export function readCacheFile(dir: string): PassCache {
  const file = join(dir, PASS_CACHE_FILE)
  return parseCache(readTextOrNull(file))
}

export function writeCacheFile(dir: string, cache: PassCache): void {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, PASS_CACHE_FILE)
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, `${JSON.stringify(cache)}\n`)
  renameSync(tmp, file)
}

// ── Toolchain ──────────────────────────────────────────────────────────────

/**
 * The kotlinc install home (the directory whose `lib/` holds
 * `kotlin-compiler.jar`), derived from the `kotlinc` on PATH. Covers the
 * distribution zip (`<home>/bin/kotlinc`) and Homebrew (`<cellar>/bin/kotlinc`
 * whose real home is `<cellar>/libexec`). Null when kotlinc is absent.
 */
export function detectKotlinHome(): string | null {
  let found: string
  try {
    found = execFileSync('which', ['kotlinc'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      .trim()
      .split('\n')[0]!
  } catch {
    return null
  }
  if (!found) return null
  const bin = dirname(realpathSync(found))
  for (const home of [resolve(bin, '..'), resolve(bin, '..', 'libexec')]) {
    if (existsSync(join(home, 'lib', 'kotlin-compiler.jar'))) return home
  }
  return null
}

/** A file's text, or null when it does not exist (read first, no exists-check race). */
export function readTextOrNull(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

// ── Repository readers (used by scripts/pre-push.ts) ───────────────────────

export function discoverWithScripts(root: string): WorkspaceInfo[] {
  return discoverWorkspaces(root).map((ws) => {
    const pkg = JSON.parse(readFileSync(join(ws.dir, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    return { ...ws, scripts: pkg.scripts ?? {} }
  })
}

/** Git's repo-relative view of the working tree: tracked + untracked-not-ignored. */
export function gitFiles(root: string): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  return out.split('\0').filter(Boolean)
}

/** Sources for `targetTestFiles`: the test-utils tests and every text file under `scripts/`. */
export function readTargetingSources(
  root: string,
  files: readonly string[],
  testUtilsDir: string | undefined,
): { testFiles: Map<string, string>; scriptFiles: Map<string, string> } {
  const testFiles = new Map<string, string>()
  const scriptFiles = new Map<string, string>()
  const testPrefix = testUtilsDir ? `${relative(root, testUtilsDir)}/src/` : undefined
  const read = (f: string) => {
    try {
      return readFileSync(join(root, f), 'utf8')
    } catch {
      return undefined
    }
  }
  for (const f of files) {
    if (testPrefix && f.startsWith(testPrefix) && /\.test\.tsx?$/.test(f)) {
      const text = read(f)
      if (text !== undefined) testFiles.set(f, text)
    } else if (f.startsWith('scripts/') && /\.(ts|tsx|mts|js|mjs|cjs|sh|json)$/.test(f)) {
      const text = read(f)
      if (text !== undefined) scriptFiles.set(f, text)
    }
  }
  return { testFiles, scriptFiles }
}
