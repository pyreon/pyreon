#!/usr/bin/env bun
/**
 * native-inputs-fingerprint — decide whether a pull request changes anything
 * the native DEVICE lanes (`native-device.yml`: iOS xcodebuild + XCUITest,
 * Android gradle + instrumented tests) actually build.
 *
 * `scripts/native-surface-touched.ts` answers "can this PR reach native?" from
 * paths alone, and it must over-approximate: every package with a
 * `native-plugin` export pulls its whole import closure in, so a change to
 * `@pyreon/reactivity` or `@pyreon/core` source "reaches" native. Measured
 * 2026-11-09/10: 31 of 56 PRs selected that way reached it ONLY through that
 * closure or `bun.lock`, and they used 87% of the device-lane minutes.
 *
 * A device lane compiles exactly these things, so this script hashes exactly
 * these things — produced by the lanes' OWN emit step, never by a re-listing
 * of compiler inputs:
 *
 *   1. Every gated app directory (`examples/native-<app>-<ios|android>/` with a
 *      `scripts/build.sh`) AFTER that `build.sh` has run (`--emit`): the
 *      Xcode/Gradle project, device tests, scripts, AND the Swift/Kotlin plus
 *      bundled web-host files the PMTC CLI emitted into it. The emitted output
 *      already reflects every compiler, plugin, library and dependency change
 *      that can alter what the device compiles; a change that leaves it
 *      byte-identical leaves the device build's input byte-identical.
 *   2. Shared native sources, by directory rule (never a file list):
 *      `packages/native/**` (Swift/Kotlin runtime + router packages consumed
 *      by SwiftPM/Gradle, the CLI, the compiler), every co-located
 *      `packages/<cat>/<pkg>/native/**` (except the JSX compiler's Rust crate),
 *      every other `examples/native-*` directory (shared app sources,
 *      fixtures, fixture servers).
 *   3. The lanes' own definition: `.github/workflows/native-device.yml`, every
 *      root `scripts/…` file that workflow names, this script, `.bun-version`.
 *   4. From `bun.lock`: the resolved entries of the dependency closure of the
 *      native workspaces (`packages/native/*`, `examples/native-*`) — their
 *      declared dependencies of every kind, then `dependencies` /
 *      `optionalDependencies` / `peerDependencies` transitively. A dev
 *      dependency of a web-only package (a bench, a docs tool) is outside it.
 *      The root `package.json` `overrides` are included because they change
 *      resolution.
 *
 * An app's fingerprint is hash(shared inputs 2–4 + its own directory 1). The
 * workflow compares base and head per app and runs only the apps whose
 * fingerprint differs; every error, missing base or unreadable input runs every
 * lane (fail-closed). The nightly scheduled run on main always builds every
 * app — the backstop for anything outside these inputs (runner image, Xcode,
 * Homebrew xcodegen, Android emulator images).
 *
 * Usage:
 *   bun scripts/native-inputs-fingerprint.ts --root=<dir> [--emit] > fp.json
 *   bun scripts/native-inputs-fingerprint.ts --compare base.json head.json \
 *     --ios=<all|none|keys> --android=<all|none|keys>   # prints GITHUB_OUTPUT lines
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, readlinkSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export type Platform = 'ios' | 'android'
export interface GatedApp {
  /** Repo-relative directory, e.g. `examples/native-tasks-ios`. */
  dir: string
  platform: Platform
  /** The key the device lanes select by (`tasks`, `router-demo`). */
  key: string
}
export interface Fingerprint {
  shared: string
  /** `ios:tasks` → hash. */
  apps: Record<string, string>
}

const APP_DIR = /^native-(.+)-(ios|android)$/
const JSX_COMPILER_CRATE = 'packages/core/compiler/native/'
const WORKFLOW = '.github/workflows/native-device.yml'
const SELF = 'scripts/native-inputs-fingerprint.ts'

/** Directories whose content never reaches a device build input. */
function skippedDir(name: string): boolean {
  return name === 'node_modules' || name === '.git'
}

export function gatedApps(root: string): GatedApp[] {
  const out: GatedApp[] = []
  for (const name of readdirSync(join(root, 'examples')).sort()) {
    const m = APP_DIR.exec(name)
    if (!m || !existsSync(join(root, 'examples', name, 'scripts', 'build.sh'))) continue
    out.push({ dir: `examples/${name}`, platform: m[2] as Platform, key: m[1]! })
  }
  if (out.length === 0) throw new Error('no gated native apps found under examples/')
  return out
}

/** Every file under `dir` (repo-relative), sorted; node_modules excluded. */
function walk(root: string, dir: string): string[] {
  const files: string[] = []
  const visit = (rel: string): void => {
    for (const entry of readdirSync(join(root, rel), { withFileTypes: true })) {
      if (skippedDir(entry.name)) continue
      const child = `${rel}/${entry.name}`
      if (entry.isDirectory()) visit(child)
      else if (entry.isFile() || entry.isSymbolicLink()) files.push(child)
    }
  }
  try {
    visit(dir)
  } catch (err) {
    // An absent top directory contributes nothing; anything else is unexpected.
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  return files.sort()
}

/** Tracked files (git index of `root`) under the given prefixes. */
function tracked(root: string): string[] {
  return execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  })
    .split('\0')
    .filter(Boolean)
}

/**
 * The bytes one listed file contributes to the hash. A file (or a link to one)
 * contributes its contents, a link to a directory its target, and a path that
 * no longer resolves (removed after listing, or a dangling link) the explicit
 * `missing` marker.
 *
 * It reads FIRST and branches on the error, never stat-then-read: a check
 * followed by a use of the same path is a race (CodeQL js/file-system-race),
 * and the read is the only operation whose result is the truth. The bytes are
 * exactly what the previous stat-then-read version fed in, so fingerprints of
 * unchanged trees are identical. Any other error (a real directory in the
 * list, EACCES, …) throws, which fails the job closed.
 */
export function fileContribution(abs: string): Buffer | string {
  try {
    return readFileSync(abs)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return 'missing\0'
    if (code === 'EISDIR') return `dir-link\0${readlinkSync(abs)}`
    throw err
  }
}

export function hashFiles(root: string, files: readonly string[], h: ReturnType<typeof createHash>): void {
  for (const f of files) {
    h.update(`file\0${f}\0`)
    h.update(fileContribution(join(root, f)))
    h.update('\0')
  }
}

/** Root `scripts/…` paths named in the device workflow that exist in `root`. */
export function workflowScripts(root: string): string[] {
  const text = readFileSync(join(root, WORKFLOW), 'utf8')
  const names = new Set<string>()
  for (const m of text.matchAll(/(?<![\w./-])scripts\/[\w./-]+/g)) {
    const p = m[0].replace(/[.]+$/, '')
    if (statSync(join(root, p), { throwIfNoEntry: false })?.isFile()) names.add(p)
  }
  return [...names].sort()
}

/** The shared (non-app) input files, repo-relative and sorted. */
export function sharedInputs(root: string, apps: readonly GatedApp[]): string[] {
  const appDirs = apps.map((a) => a.dir + '/')
  const files = tracked(root).filter((f) => {
    if (f.startsWith('packages/native/')) return true
    if (/^packages\/[^/]+\/[^/]+\/native\//.test(f)) return !f.startsWith(JSX_COMPILER_CRATE)
    if (f.startsWith('examples/native-')) return !appDirs.some((d) => f.startsWith(d))
    return false
  })
  for (const f of [WORKFLOW, SELF, '.bun-version', ...workflowScripts(root)]) files.push(f)
  return [...new Set(files)].sort()
}

// ── bun.lock dependency closure ──────────────────────────────────────────────

type LockPackage = [
  string,
  string?,
  {
    dependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }?,
  string?,
]
interface LockWorkspace {
  name?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}
export interface Lockfile {
  workspaces: Record<string, LockWorkspace>
  packages: Record<string, LockPackage>
}

/** bun.lock is JSON with trailing commas. */
export function parseLockfile(text: string): Lockfile {
  const json = text.replace(/,(\s*[}\]])/g, '$1')
  const parsed = JSON.parse(json) as Lockfile
  if (!parsed.workspaces || !parsed.packages)
    throw new Error('bun.lock: missing workspaces/packages')
  return parsed
}

/** `a/@s/b/c` → [`a`, `@s/b`, `c`]. */
function splitKey(key: string): string[] {
  const parts = key.split('/')
  const out: string[] = []
  for (let i = 0; i < parts.length; i++)
    out.push(parts[i]!.startsWith('@') ? `${parts[i]}/${parts[++i]}` : parts[i]!)
  return out
}

/** Bun's hoisting lookup: the nearest `parent/…/name` entry, then the top level. */
function lookup(lock: Lockfile, chain: readonly string[], name: string): string | undefined {
  for (let i = chain.length; i >= 0; i--) {
    const key = [...chain.slice(0, i), name].join('/')
    if (lock.packages[key]) return key
  }
  return undefined
}

const RUNTIME_KINDS = ['dependencies', 'optionalDependencies', 'peerDependencies'] as const

/**
 * The resolved lockfile entries reachable from `rootWorkspaces` (paths in
 * `lock.workspaces`). The roots contribute every dependency kind (their dev
 * tools run in the lanes); everything below contributes runtime kinds only.
 * Returns `key=resolution|integrity` lines, sorted.
 */
export function lockClosure(lock: Lockfile, rootWorkspaces: readonly string[]): string[] {
  const out = new Set<string>()
  const seenWs = new Set<string>()
  const seenPkg = new Set<string>()
  const pendingWs: Array<{ path: string; all: boolean }> = rootWorkspaces.map((path) => ({
    path,
    all: true,
  }))
  const pendingPkg: string[] = []
  const wsPathOf = (key: string): string | undefined => {
    const res = lock.packages[key]?.[0] ?? ''
    const m = /@workspace:(.+)$/.exec(res)
    return m ? m[1] : undefined
  }
  const addDeps = (chain: string[], deps: Record<string, string> | undefined): void => {
    for (const name of Object.keys(deps ?? {})) {
      const key = lookup(lock, chain, name)
      // An unresolvable declared dependency is recorded as such, never dropped.
      if (!key) out.add(`${chain.join('/')}>${name}=UNRESOLVED`)
      else pendingPkg.push(key)
    }
  }
  while (pendingWs.length || pendingPkg.length) {
    const ws = pendingWs.pop()
    if (ws) {
      if (seenWs.has(ws.path)) continue
      seenWs.add(ws.path)
      const entry = lock.workspaces[ws.path]
      if (!entry) {
        out.add(`workspace:${ws.path}=MISSING`)
        continue
      }
      const name = entry.name ?? ws.path
      for (const kind of ws.all
        ? ([...RUNTIME_KINDS, 'devDependencies'] as const)
        : RUNTIME_KINDS) {
        out.add(`workspace:${ws.path}:${kind}=${JSON.stringify(entry[kind] ?? {})}`)
        addDeps([name], entry[kind])
      }
      continue
    }
    const key = pendingPkg.pop()!
    if (seenPkg.has(key)) continue
    seenPkg.add(key)
    const pkg = lock.packages[key]!
    const wsPath = wsPathOf(key)
    if (wsPath !== undefined) {
      out.add(`${key}=${pkg[0]}`)
      pendingWs.push({ path: wsPath, all: false })
      continue
    }
    out.add(`${key}=${pkg[0]}|${pkg[3] ?? pkg[1] ?? ''}`)
    const meta = pkg[2] ?? {}
    for (const kind of RUNTIME_KINDS) addDeps(splitKey(key), meta[kind])
  }
  return [...out].sort()
}

export function nativeWorkspaces(lock: Lockfile): string[] {
  return Object.keys(lock.workspaces)
    .filter((p) => p.startsWith('packages/native/') || p.startsWith('examples/native-'))
    .sort()
}

// ── fingerprint ──────────────────────────────────────────────────────────────

export function fingerprint(root: string): Fingerprint {
  const apps = gatedApps(root)
  const shared = createHash('sha256')
  hashFiles(root, sharedInputs(root, apps), shared)
  const lock = parseLockfile(readFileSync(join(root, 'bun.lock'), 'utf8'))
  for (const line of lockClosure(lock, nativeWorkspaces(lock))) shared.update(`lock\0${line}\n`)
  const rootManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    overrides?: unknown
  }
  shared.update(`overrides\0${JSON.stringify(rootManifest.overrides ?? null)}\n`)
  const sharedHash = shared.digest('hex')
  const out: Fingerprint = { shared: sharedHash, apps: {} }
  for (const app of apps) {
    const h = createHash('sha256').update(`shared\0${sharedHash}\0`)
    hashFiles(root, walk(root, app.dir), h)
    out.apps[`${app.platform}:${app.key}`] = h.digest('hex')
  }
  return out
}

/** Run every gated app's own `scripts/build.sh` — the lanes' emit step. */
export function emit(root: string): void {
  for (const app of gatedApps(root)) {
    execFileSync('bash', [join(app.dir, 'scripts', 'build.sh')], {
      cwd: root,
      stdio: ['ignore', 2, 2],
    })
  }
}

/**
 * Per platform: the classifier's selection (`all`, `none` or keys) narrowed to
 * the apps whose fingerprint differs. An app absent from either side counts as
 * changed. Returns `none` when nothing is left.
 */
export function narrow(
  base: Fingerprint,
  head: Fingerprint,
  platform: Platform,
  selected: string,
): string {
  if (selected === 'none') return 'none'
  const keys = Object.keys(head.apps)
    .filter((k) => k.startsWith(platform + ':'))
    .map((k) => k.slice(platform.length + 1))
  const changed = keys.filter(
    (k) => base.apps[`${platform}:${k}`] !== head.apps[`${platform}:${k}`],
  )
  const pick =
    selected === 'all' || selected === ''
      ? changed
      : selected.split(/\s+/).filter((k) => !keys.includes(k) || changed.includes(k))
  if (pick.length === 0) return 'none'
  return selected === 'all' && pick.length === keys.length ? 'all' : pick.join(' ')
}

if (import.meta.main) {
  const args = process.argv.slice(2)
  const arg = (name: string): string | undefined =>
    args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
  if (args[0] === '--compare') {
    const [basePath, headPath] = [args[1]!, args[2]!]
    const base = JSON.parse(readFileSync(basePath, 'utf8')) as Fingerprint
    const head = JSON.parse(readFileSync(headPath, 'utf8')) as Fingerprint
    for (const platform of ['ios', 'android'] as const) {
      const selected = arg(platform) || 'all'
      const result = narrow(base, head, platform, selected)
      console.error(`[native-inputs-fingerprint] ${platform}: selected=${selected} → ${result}`)
      console.log(`${platform}-apps=${result}`)
    }
    console.error(
      `[native-inputs-fingerprint] shared inputs ${base.shared === head.shared ? 'unchanged' : 'CHANGED'}`,
    )
  } else {
    const root = resolve(arg('root') ?? process.cwd())
    if (args.includes('--emit')) emit(root)
    const fp = fingerprint(root)
    console.log(JSON.stringify(fp, null, 2))
    console.error(
      `[native-inputs-fingerprint] ${relative(process.cwd(), root) || '.'}: ${Object.keys(fp.apps).length} apps, shared ${fp.shared.slice(0, 12)}`,
    )
  }
}
