#!/usr/bin/env bun
/**
 * What the pre-push hook runs, and the local pass cache that lets it skip work
 * it has already seen pass.
 *
 * ## The contract
 *
 * Local pushes are FAST and DIRECT-ONLY; GitHub CI is the full gate. CI runs
 * the whole reverse-dependency closure (`scripts/affected.ts` without
 * `--changed-only`), the native-compiler suite and the Swift/Kotlin lanes, and
 * every one of those reports through a required check, so nothing reaches
 * `main` without them. The hook therefore runs only:
 *
 *   - typecheck + tests for the DIRECTLY changed workspaces (no closure);
 *   - on a root-file change (lockfile, root tsconfig, root vitest setup, …):
 *     typecheck across the workspace, tests still direct-only;
 *   - native-toolchain packages (`packages/native/*`) only when they themselves
 *     changed, as their own step (`--maxWorkers=4` for vitest suites,
 *     `KOTLIN_HOME` detected from the `kotlinc` on PATH).
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
 *
 * ## Usage (the hook is the only intended caller)
 *
 *   bun scripts/pre-push-plan.ts plan --base=origin/main --cache-dir=<dir> --state=<file> [--no-cache]
 *     → shell assignments on stdout, the human-readable plan on stderr
 *   bun scripts/pre-push-plan.ts record --cache-dir=<dir> --state=<file> --group=<group>
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import {
  computeAffectedFlags,
  discoverWorkspaces,
  docInputConsumer,
  gitChangedFiles,
  isE2eFile,
  isRootFile,
  isScriptFile,
  isWorkflowFile,
  SCRIPT_TEST_PACKAGE,
  type Workspace,
} from './affected'
import { computeFileListHash } from './bootstrap-hash'

const ROOT = resolve(import.meta.dirname, '..')

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

export interface Plan {
  /** The diff could not be computed (base ref missing): treated as a root change. */
  unknownDiff: boolean
  rootChanged: boolean
  /** Directly changed workspaces, plus the leaf seeds affected.ts maps non-workspace files to. */
  direct: string[]
  /** Size of the reverse-dependency closure CI runs (the old local selection). */
  closureSize: number
  groups: Record<Group, string[]>
  /** Native-toolchain workspaces a root change would otherwise have typechecked. */
  nativeSkipped: string[]
}

export function isNativeToolchainWorkspace(ws: Workspace, root: string): boolean {
  return ws.dir.startsWith(join(root, 'packages', 'native') + sep)
}

const parseFlags = (flags: string): string[] =>
  flags === '' ? [] : flags.split(' ').map((f) => f.replace(/^--filter=/, ''))

/** Pure: which workspaces each hook step runs, before the pass cache. */
export function computePlan(opts: {
  changed: string[] | null
  workspaces: WorkspaceInfo[]
  root: string
}): Plan {
  const { changed, workspaces, root } = opts
  const unknownDiff = changed === null
  const rootChanged = unknownDiff || changed.some(isRootFile)
  const direct = unknownDiff
    ? []
    : parseFlags(computeAffectedFlags({ changed, workspaces, root, directOnly: true }))
  const closureFlags = unknownDiff ? '--filter=*' : computeAffectedFlags({ changed, workspaces, root })
  const closureSize = closureFlags === '--filter=*' ? workspaces.length : parseFlags(closureFlags).length

  const byName = new Map(workspaces.map((w) => [w.name, w]))
  const directSet = new Set(direct)
  const has = (name: string, script: string) => Boolean(byName.get(name)?.scripts[script])
  const native = (name: string) => {
    const ws = byName.get(name)
    return ws !== undefined && isNativeToolchainWorkspace(ws, root)
  }

  const typecheck = new Set(direct.filter((n) => has(n, 'typecheck')))
  const nativeSkipped: string[] = []
  if (rootChanged) {
    for (const ws of workspaces) {
      if (!ws.scripts.typecheck || directSet.has(ws.name)) continue
      if (isNativeToolchainWorkspace(ws, root)) nativeSkipped.push(ws.name)
      else typecheck.add(ws.name)
    }
  }

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
  return { unknownDiff, rootChanged, direct, closureSize, groups, nativeSkipped: nativeSkipped.sort() }
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

function readCacheFile(dir: string): PassCache {
  const file = join(dir, PASS_CACHE_FILE)
  return parseCache(existsSync(file) ? readFileSync(file, 'utf8') : null)
}

function writeCacheFile(dir: string, cache: PassCache): void {
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

// ── CLI ────────────────────────────────────────────────────────────────────

interface State {
  groups: Record<Group, Array<[pkg: string, entry: string]>>
}

function discoverWithScripts(root: string): WorkspaceInfo[] {
  return discoverWorkspaces(root).map((ws) => {
    const pkg = JSON.parse(readFileSync(join(ws.dir, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>
    }
    return { ...ws, scripts: pkg.scripts ?? {} }
  })
}

function gitFiles(root: string): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '-co', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
  return out.split('\0').filter(Boolean)
}

const SAFE = /^[A-Za-z0-9@/._-]+$/
function shellValue(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}
function filterArgs(names: readonly string[]): string {
  for (const n of names) if (!SAFE.test(n)) throw new Error(`[Pyreon] unexpected workspace name ${JSON.stringify(n)}`)
  return names.map((n) => `--filter=${n}`).join(' ')
}

function arg(argv: string[], name: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

function summarize(names: readonly string[], max = 12): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')}, … (+${names.length - max} more)`
}

function runPlan(argv: string[]): void {
  const base = arg(argv, 'base') ?? 'origin/main'
  const cacheDir = arg(argv, 'cache-dir')
  const statePath = arg(argv, 'state')
  if (!cacheDir || !statePath) throw new Error('[Pyreon] plan needs --cache-dir=<dir> and --state=<file>')
  const useCache = !argv.includes('--no-cache')

  const changed = gitChangedFiles(base)
  const workspaces = discoverWithScripts(ROOT)
  const plan = computePlan({ changed, workspaces, root: ROOT })

  const wanted = new Set(GROUPS.flatMap((g) => plan.groups[g]))
  const keys =
    wanted.size > 0
      ? computePassKeys({ root: ROOT, files: gitFiles(ROOT), workspaces, packages: [...wanted] })
      : new Map<string, string>()
  const cache = useCache ? readCacheFile(cacheDir) : parseCache(null)

  const state: State = { groups: { typecheck: [], test: [], 'native-vitest': [], 'native-script': [] } }
  const cached: Record<Group, string[]> = { typecheck: [], test: [], 'native-vitest': [], 'native-script': [] }
  for (const g of GROUPS) {
    for (const name of plan.groups[g]) {
      const entry = entryKey(g, name, keys.get(name)!)
      if (cache.entries[entry] !== undefined) cached[g].push(name)
      else state.groups[g].push([name, entry])
    }
  }
  writeFileSync(statePath, JSON.stringify(state))

  const run = (g: Group) => state.groups[g].map(([n]) => n)
  const needsKotlin = run('native-vitest').length + run('native-script').length > 0
  const kotlinHome = needsKotlin && !process.env.KOTLIN_HOME ? detectKotlinHome() : null

  const say = (s: string) => process.stderr.write(`[pyreon pre-push] ${s}\n`)
  if (plan.unknownDiff) say(`could not diff against ${base} — treating it as a root-file change`)
  else say(`plan vs ${base}: ${changed!.length} changed file(s)`)
  say(`  directly changed: ${plan.direct.length > 0 ? summarize(plan.direct) : '(none)'}`)
  for (const g of GROUPS) {
    if (plan.groups[g].length === 0) continue
    const label = { typecheck: 'typecheck', test: 'tests', 'native-vitest': 'native tests (vitest, --maxWorkers=4)', 'native-script': 'native tests (toolchain scripts)' }[g]
    const ran = run(g)
    say(`  ${label}: ${ran.length > 0 ? summarize(ran) : '(nothing to run)'}`)
    if (cached[g].length > 0) say(`    skipped, already passed with identical inputs: ${summarize(cached[g])}`)
  }
  if (plan.rootChanged) say('  root-file change: typecheck spans the workspace; tests stay direct-only')
  if (plan.nativeSkipped.length > 0) say(`  skipped native-toolchain packages (unchanged): ${summarize(plan.nativeSkipped)}`)
  const dropped = plan.closureSize - plan.direct.length
  if (dropped > 0)
    say(`  skipped ${dropped} reverse-dependent workspace(s) — CI runs the full affected closure as required checks`)
  if (needsKotlin && process.env.KOTLIN_HOME) say(`  KOTLIN_HOME=${process.env.KOTLIN_HOME} (from the environment)`)
  else if (kotlinHome) say(`  KOTLIN_HOME=${kotlinHome} (detected from kotlinc on PATH)`)
  else if (needsKotlin) say('  kotlinc not found — Kotlin checks in the native suites self-skip; CI runs them')

  const lines = [
    `PLAN_ROOT_CHANGED=${plan.rootChanged ? '1' : '0'}`,
    `PLAN_TYPECHECK=${shellValue(filterArgs(run('typecheck')))}`,
    `PLAN_TEST=${shellValue(filterArgs(run('test')))}`,
    `PLAN_NATIVE_VITEST=${shellValue(filterArgs(run('native-vitest')))}`,
    `PLAN_NATIVE_SCRIPT=${shellValue(filterArgs(run('native-script')))}`,
    `PLAN_KOTLIN_HOME=${shellValue(kotlinHome ?? '')}`,
  ]
  process.stdout.write(`${lines.join('\n')}\n`)
}

function runRecord(argv: string[]): void {
  const cacheDir = arg(argv, 'cache-dir')
  const statePath = arg(argv, 'state')
  const group = arg(argv, 'group') as Group | undefined
  if (!cacheDir || !statePath || !group || !GROUPS.includes(group))
    throw new Error('[Pyreon] record needs --cache-dir=<dir>, --state=<file> and --group=<group>')
  const state = JSON.parse(readFileSync(statePath, 'utf8')) as State
  const entries = state.groups[group].map(([, e]) => e)
  if (entries.length === 0) return
  writeCacheFile(cacheDir, recordPasses(readCacheFile(cacheDir), entries, Date.now()))
}

if (import.meta.main) {
  const [cmd, ...rest] = process.argv.slice(2)
  if (cmd === 'plan') runPlan(rest)
  else if (cmd === 'record') runRecord(rest)
  else {
    process.stderr.write('[Pyreon] usage: pre-push-plan.ts plan|record … (see the file header)\n')
    process.exit(2)
  }
}
