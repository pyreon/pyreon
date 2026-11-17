#!/usr/bin/env bun
/**
 * Decide whether a pull request touches the NATIVE (PMTC / iOS / Android)
 * surface — the single classifier behind the `decide` jobs of
 * native-validate.yml and native-device.yml.
 *
 * ## Why one script
 *
 * Both workflows used to carry their own copy of one regex, and the regex had
 * two silent over-matches that cost real runner time on a 20-slot (5 macOS)
 * org-wide pool:
 *
 *   1. `packages/<cat>/<pkg>/native/` was meant to match the co-located
 *      Swift/Kotlin sources (`packages/fundamentals/flow/native/`). It ALSO
 *      matches `packages/core/compiler/native/` — the JSX compiler's napi-rs
 *      Rust crate, which has nothing to do with PMTC. Every dual-backend
 *      compiler PR therefore paid the full native lanes: ~50 min of real
 *      swiftc on macOS, ~50 min of iOS simulator, ~30 min of Android
 *      emulator. Measured 2026-09-07: 6 of the last 40 PRs triggered the
 *      lanes through that path alone.
 *   2. `packages/<cat>/<pkg>/package.json` matched EVERY package manifest, so
 *      a dependency bump in a web-only package ran the same lanes. Only a
 *      manifest that declares co-located native sources (`pyreon.native`)
 *      can change what the native gates verify.
 *
 * ## Fail-closed direction
 *
 * A wrong "skip" hides a native regression behind a green check; a wrong
 * "run" costs one CI round. So every uncertainty resolves to RUN: an
 * unreadable manifest, an empty file list, a deleted package.json.
 */

import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, normalize, relative } from 'node:path'
import { listNativeHosts } from './native-example-hosts'
import { deriveNativePluginSurface } from './native-plugin-surface'
import { lockClosure, nativeWorkspaces, parseLockfile } from './native-inputs-fingerprint'
import { laneChanged } from './native-workflow-surface'

export interface Decision {
  run: boolean
  /** One line per file that forced the run (empty when it skips). */
  reasons: string[]
}

/** The JSX compiler's napi-rs crate — NOT a PMTC surface. */
const JSX_COMPILER_CRATE = 'packages/core/compiler/native/'

const PACKAGE_JSON = /^packages\/[^/]+\/[^/]+\/package\.json$/

function declaresNative(content: string | null): boolean {
  if (content === null) return true
  const value: unknown = JSON.parse(content)
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid package manifest')
  const json = value as { pyreon?: { native?: unknown }; exports?: Record<string, unknown> }
  return json.pyreon?.native !== undefined || json.exports?.['./native-plugin'] !== undefined
}

/**
 * `read(path)` returns the file's content at the PR head, or null when it does
 * not exist there (deleted). It is injected so the rule is unit-testable
 * without a checkout.
 */
export function classifyNativeSurface(
  files: readonly string[],
  read: (path: string) => string | null,
  selfWorkflow?: string,
  pluginSurface?: ReadonlySet<string> | Error,
  readBase?: (path: string) => string | null,
): Decision {
  const reasons: string[] = []
  if (files.length === 0) return { run: true, reasons: ['empty file list — running (fail-closed)'] }
  if (pluginSurface instanceof Error)
    return {
      run: true,
      reasons: ['plugin surface unreadable (fail-closed): ' + pluginSurface.message],
    }
  for (const f of files) {
    if (f.startsWith('packages/native/')) reasons.push(f + ' — PMTC stack')
    else if (f.startsWith('examples/native-')) reasons.push(f + ' — native example')
    else if (/^packages\/[^/]+\/[^/]+\/native\//.test(f) && !f.startsWith(JSX_COMPILER_CRATE))
      reasons.push(f + ' — co-located native source')
    else if (/^packages\/[^/]+\/[^/]+\/src\/native-plugin(?:\.[cm]?[jt]sx?$|\/)/.test(f))
      reasons.push(f + ' — package-owned native lowering')
    else if (f.startsWith('scripts/check-native-') || f.startsWith('scripts/native-'))
      reasons.push(f + ' — native gate script')
    else if (pluginSurface?.has(f)) reasons.push(f + ' — native plugin dependency')
    else if (f === 'bun.lock' || f === '.bun-version') reasons.push(f + ' — toolchain/lockfile')
    else if (selfWorkflow && f === selfWorkflow) reasons.push(f + ' — this workflow')
    else if (PACKAGE_JSON.test(f)) {
      let content: string | null
      try {
        content = read(f)
      } catch {
        content = null
      }
      if (content === null) {
        reasons.push(f + ' — manifest unreadable at head (fail-closed)')
        continue
      }
      let nativeManifest = false
      try {
        nativeManifest = declaresNative(content)
      } catch {
        nativeManifest = true
      }
      // A removed/renamed custom plugin export need not leave a conventional
      // filename behind. Prove the base manifest was web-only before skipping.
      if (!nativeManifest && readBase) {
        try {
          nativeManifest = declaresNative(readBase(f))
        } catch {
          nativeManifest = true
        }
      }
      // Removing a declaration must still verify the previously owned lowering.
      // If the source is deleted too, the changed native-plugin path above fires.
      if (!nativeManifest) {
        try {
          nativeManifest = ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs'].some(
            (extension) =>
              ['src/native-plugin.', 'src/native-plugin/index.'].some(
                (entry) => read(f.replace(/package\.json$/, entry + extension)) !== null,
              ),
          )
        } catch {
          nativeManifest = true
        }
      }
      if (nativeManifest) reasons.push(f + ' — native package manifest')
    }
  }
  return { run: reasons.length > 0, reasons }
}

// ── Lane-specific decisions ─────────────────────────────────────────────────
//
// `classifyNativeSurface` answers "can this PR change anything native?". The
// two macOS jobs ask something narrower, because a macOS minute is the scarcest
// one the org has (about three concurrent runners; on 2026-11-16 three jobs ran
// while eight queued and GitHub cancelled short ones as "not acquired"):
//
//   - `Validate emitted Swift (real-SDK typecheck, macOS)` reads the emitter,
//     the runtime packages, the example build scripts and its own definition.
//     It does not read an Android example's Gradle configuration, and it does
//     not run for an edit to a workflow file that is not its own.
//   - `iOS — xcodebuild` builds the iOS apps; the Android lane's job block is
//     not part of it, and the reverse.
//
// Both compare the lane's OWN job block at the base and at the head
// (`native-workflow-surface.ts`), never the whole workflow file.

/**
 * Gradle build configuration of an Android example app. Nothing the macOS jobs
 * read points at these files: the macOS suite reads each example's
 * `scripts/*.sh` and one androidTest `.kt`, and the iOS lane builds from
 * `project.yml`. (`check-native-srcdirs-drift`, which reads them, is a Linux
 * gate.) The Android lane still selects the app: `selectApps` is unchanged.
 */
const ANDROID_GRADLE_CONFIG =
  /^examples\/native-[^/]+-android\/(?:(?:app\/)?build\.gradle\.kts|settings\.gradle\.kts|gradle\.properties|gradlew(?:\.bat)?|gradle\/.+)$/

export function isAndroidGradleConfig(file: string): boolean {
  // `..` never appears in a git path; refuse it anyway so the `gradle/` arm
  // cannot be walked out of.
  return ANDROID_GRADLE_CONFIG.test(file) && !file.split('/').includes('..')
}

/**
 * Device-test sources: XCUITest and Android instrumented tests run only in the
 * device lanes. The macOS suite checks that an `iosUITests` or `androidTest`
 * DIRECTORY exists (`native-examples-compile.test.ts`) and reads one androidTest
 * file by name (`intl-differential.test.ts`); it never reads any other file in
 * them. A deleted file reads as null and so still starts the job, which keeps
 * "the last device test was removed" visible.
 */
const DEVICE_TEST_SOURCE =
  /^examples\/native-[^/]+-(?:ios\/iosUITests|android\/app\/src\/androidTest)\/(?!.*IntlDifferentialCases\.kt$)/

export function isDeviceTestSource(file: string): boolean {
  return DEVICE_TEST_SOURCE.test(file) && !file.split('/').includes('..')
}

/** Root `package.json` keys that no job of the native workflows reads. */
const INERT_ROOT_KEYS = ['scripts', 'version', 'description', 'keywords', 'repository', 'homepage', 'bugs']

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  )
}

/**
 * Can this PR's change to `bun.lock` and the root `package.json` leave what the
 * macOS typecheck installs and runs untouched? The same proof the device lanes'
 * fingerprint uses: the dependency closure of the native workspaces and the
 * root `overrides` are identical, and the root manifest differs, if at all, only
 * in keys no native job reads (its `scripts`: the macOS job runs
 * `bun scripts/…` directly, never a root script). Anything unreadable is "no".
 */
export function lockfileInertForNative(
  read: (path: string) => string | null,
  readBase: ((path: string) => string | null) | undefined,
): boolean {
  if (!readBase) return false
  try {
    const sides = [read, readBase].map((r) => ({
      lock: r('bun.lock'),
      manifest: r('package.json'),
    }))
    if (sides.some((x) => x.lock === null || x.manifest === null)) return false
    const closure = (text: string): string => {
      const lock = parseLockfile(text)
      return lockClosure(lock, nativeWorkspaces(lock)).join('\n')
    }
    const [head, base] = sides as [{ lock: string; manifest: string }, { lock: string; manifest: string }]
    if (closure(head.lock) !== closure(base.lock)) return false
    const strip = (text: string): string => {
      const json = JSON.parse(text) as Record<string, unknown>
      for (const key of INERT_ROOT_KEYS) delete json[key]
      return stableJson(json)
    }
    return strip(head.manifest) === strip(base.manifest)
  } catch {
    return false
  }
}

/**
 * The changed files the dependency-graph question should see for the macOS
 * lane: workflow files are answered by the lane's own job block, and a
 * lockfile/root-manifest change that is provably inert for the native
 * workspaces is not a graph input. Every other path is passed through.
 */
export function macosGraphFiles(
  files: readonly string[],
  read: (path: string) => string | null,
  readBase: ((path: string) => string | null) | undefined,
): string[] {
  const inert = files.some((f) => f === 'bun.lock' || f === 'package.json')
    ? lockfileInertForNative(read, readBase)
    : false
  return files.filter(
    (f) => !f.startsWith('.github/workflows/') && !(inert && (f === 'bun.lock' || f === 'package.json')),
  )
}

/** The workflow file a decision belongs to, with both sides of it. */
export interface SelfWorkflow {
  file: string
  /** Content at the head; an Error when it could not be read. */
  head: string | Error
  /** Content at the base; null when the file is new, an Error when unreadable. */
  base: string | null | Error
}

/**
 * Does the macOS typecheck need to run? `macosJobs` are the job ids that make
 * up the macOS lane (`validate-swift-typecheck`). A changed file counts when:
 * the path classifier says native (Android Gradle configuration excluded), the
 * macOS job block (or the top-level `env`/`permissions`/`defaults` it inherits)
 * changed, or it is a script/local action that block names. Any other workflow
 * file starts nothing, and neither do a device-test source file or a lockfile
 * change that leaves the native workspaces' dependency closure identical.
 */
export function classifyMacosLane(
  files: readonly string[],
  read: (path: string) => string | null,
  self: SelfWorkflow,
  macosJobs: readonly string[],
  base: BaseInputs = {},
): Decision {
  const { pluginSurface, readBase } = base
  if (files.length === 0) return { run: true, reasons: ['empty file list — running (fail-closed)'] }
  const reasons: string[] = []
  const selfTouched = files.includes(self.file)
  // The named scripts come from the head's surface even when the file itself is
  // untouched, so a script edit the job runs is still seen.
  const lane = laneChanged(self.head, selfTouched ? self.base : self.head, macosJobs)
  if (selfTouched && lane.changed) reasons.push(self.file + ' — ' + lane.reason)
  const named = new Set(lane.named)
  const rest: string[] = []
  const lockInert = files.includes('bun.lock') && lockfileInertForNative(read, readBase)
  for (const f of files) {
    if (f === self.file || isAndroidGradleConfig(f)) continue
    if (f === 'bun.lock' && lockInert) continue
    if (isDeviceTestSource(f) && read(f) !== null) continue
    if (named.has(f)) reasons.push(f + ' — named by the macOS job')
    else rest.push(f)
  }
  if (rest.length > 0) reasons.push(...classifyNativeSurface(rest, read, undefined, pluginSurface, readBase).reasons)
  return { run: reasons.length > 0, reasons }
}

/** What a decision compares against: the plugin surface and the base revision's files. */
export interface BaseInputs {
  pluginSurface?: ReadonlySet<string> | Error | undefined
  readBase?: ((path: string) => string | null) | undefined
}

export interface DeviceLaneJobs {
  ios: readonly string[]
  android: readonly string[]
}

export interface DeviceDecision {
  run: boolean
  selection: AppSelection
  reasons: string[]
}

/**
 * The device workflow's decision: which lanes run. The path classifier and
 * `selectApps` pick the apps; an edit to the workflow file selects a platform
 * ONLY when that platform's job block (or the inherited top-level sections)
 * changed. Every failure to compare selects both platforms.
 */
export function decideDevice(
  files: readonly string[],
  read: (path: string) => string | null,
  self: SelfWorkflow,
  jobs: DeviceLaneJobs,
  inputs: BaseInputs & { surfaces: () => AppSurface[] },
): DeviceDecision {
  const { pluginSurface, readBase, surfaces } = inputs
  const every = (reason: string): DeviceDecision => ({
    run: true,
    selection: { ios: 'all', android: 'all', reasons: [reason] },
    reasons: [reason],
  })
  if (files.length === 0) return every('empty file list — every lane (fail-closed)')
  const rest = files.filter((f) => f !== self.file)
  const selfTouched = files.length !== rest.length
  const reasons: string[] = []
  const lanes = { ios: false, android: false }
  if (selfTouched) {
    for (const platform of ['ios', 'android'] as const) {
      const lane = laneChanged(self.head, self.base, jobs[platform])
      if (lane.changed) {
        lanes[platform] = true
        reasons.push(self.file + ' — ' + platform + ' ' + lane.reason)
      }
    }
  }
  let d: Decision = { run: false, reasons: [] }
  if (rest.length > 0) d = classifyNativeSurface(rest, read, undefined, pluginSurface, readBase)
  reasons.push(...d.reasons)
  let sel: AppSelection = { ios: 'none', android: 'none', reasons: [] }
  if (d.run) {
    try {
      const surfaceFiles = d.reasons.map((r) => r.split(' — ')[0]!).filter((f) => rest.includes(f))
      sel =
        surfaceFiles.length === d.reasons.length
          ? selectApps(surfaceFiles, surfaces())
          : { ios: 'all', android: 'all', reasons: ['fail-closed run (no file list) — every lane'] }
    } catch (err) {
      sel = {
        ios: 'all',
        android: 'all',
        reasons: ['app derivation failed (' + String(err) + ') — every lane'],
      }
    }
  }
  const selection: AppSelection = {
    ios: lanes.ios ? 'all' : sel.ios,
    android: lanes.android ? 'all' : sel.android,
    reasons: [...sel.reasons],
  }
  return { run: d.run || lanes.ios || lanes.android, selection, reasons }
}

// ── Per-app lane selection (native-device.yml) ───────────────────────────────
//
// native-device.yml runs every example app's device lane (5 iOS UITest suites
// on one macOS runner, 5 Android emulator suites on one Linux runner) — 55-85
// macOS minutes and ~25-36 Linux minutes per push. Most native PRs touch ONE
// package's co-located native dir plus one example (measured 2026-09-22: every
// `flow-native-*` PR touched only `packages/fundamentals/flow/native` + the
// counter example), yet paid for all ten suites.
//
// An app's surface is DERIVED from its own build files, never hand-listed, so
// wiring a new co-located package into an app widens its surface in the same
// edit: the app dir, its shared source dir (`SRC_DIR` in scripts/build.sh),
// and every repo path its project.yml (`path:`) or Gradle files (`srcDir(…)` /
// any "../" string) reference.
//
// Fail-closed: a native-surface file claimed by NO app on either platform (the
// compiler, the CLI, bun.lock, the workflow, a gate script, a manifest) runs
// EVERY app on BOTH platforms. The single exception is a native example that
// no lane builds (a *-web sibling, a single-layout app's web entry files):
// no lane can observe it.

export type Platform = 'ios' | 'android'
export interface AppSurface {
  platform: Platform
  /** Lane key used by the workflow's step conditions, e.g. `counter`. */
  app: string
  /** Repo-relative directory prefixes, each ending in `/`. */
  roots: string[]
}

const APP_DIR = /^examples\/native-(.+)-(ios|android)$/

function asRoot(p: string): string {
  const n = normalize(p).replace(/\\/g, '/')
  return n.endsWith('/') ? n : n + '/'
}

/** Derive every device-lane app's surface from the files on disk. */
export function deriveAppSurfaces(repoRoot: string): AppSurface[] {
  const out: AppSurface[] = []
  for (const host of listNativeHosts(repoRoot)) {
    const { dir, platform } = host
    const roots = new Set<string>([asRoot(dir)])
    if (host.layout === 'single') {
      // One package per app (`examples/native-<app>/{ios,android}`): this
      // platform's host, the shared source, its own emit script and the
      // package manifest. The other platform's host and the web entry files
      // are not this lane's input.
      roots.add(asRoot(host.appRoot + '/src'))
      roots.add(host.buildScript)
      roots.add(host.appRoot + '/package.json')
    }
    const refsIn = (file: string, pattern: RegExp): void => {
      const abs = join(repoRoot, file)
      if (!existsSync(abs)) return
      const text = readFileSync(abs, 'utf8')
      for (const hit of text.matchAll(pattern)) {
        const target = relative(repoRoot, join(repoRoot, dirname(file), hit[1]!))
        if (target.startsWith('..')) continue
        roots.add(asRoot(target))
      }
    }
    // Shared source (`SRC_DIR="…${PROJECT_DIR}/../native-finance/src"`). The
    // build script's PROJECT_DIR is the app dir, so resolve against it, and
    // claim the sibling example as a whole (its package.json, fixtures, …).
    const build = join(repoRoot, dir, 'scripts/build.sh')
    if (host.layout === 'split' && existsSync(build)) {
      const src = /SRC_DIR=.*\$\{PROJECT_DIR\}\/([^"\s)]+)/.exec(readFileSync(build, 'utf8'))
      if (src) {
        const target = relative(repoRoot, join(repoRoot, dir, src[1]!))
        if (!target.startsWith('..')) {
          roots.add(asRoot(target))
          const parent = dirname(target)
          // Only a SHARED source home (examples/native-finance) is claimed whole;
          // when the source lives in a sibling LANE app (native-counter-android
          // reads native-counter-ios/src), claiming that app's whole dir would
          // run this lane for an iOS-only UITest edit.
          if (parent !== dir && parent.startsWith('examples/native-') && !APP_DIR.test(parent))
            roots.add(asRoot(parent))
        }
      }
    }
    if (platform === 'ios') refsIn(dir + '/project.yml', /path:\s*["']?(\.\.\/[^"'\s]+)/g)
    else {
      refsIn(dir + '/build.gradle.kts', /"(\.\.\/[^"]+)"/g)
      refsIn(dir + '/settings.gradle.kts', /"(\.\.\/[^"]+)"/g)
      refsIn(dir + '/app/build.gradle.kts', /"(\.\.\/[^"]+)"/g)
    }
    out.push({ platform, app: host.app, roots: [...roots].sort() })
  }
  return out
}

export interface AppSelection {
  /** `'all'`, `'none'`, or the sorted app keys for the platform. */
  ios: 'all' | 'none' | string[]
  android: 'all' | 'none' | string[]
  reasons: string[]
}

/**
 * Which apps' device lanes a set of NATIVE-SURFACE files can affect. Pass only
 * files `classifyNativeSurface` already counted (its `reasons`), so a web-only
 * file can never widen the selection.
 */
export function selectApps(
  files: readonly string[],
  surfaces: readonly AppSurface[],
): AppSelection {
  const picked = { ios: new Set<string>(), android: new Set<string>() }
  const reasons: string[] = []
  for (const f of files) {
    const hits = surfaces.filter((s) => s.roots.some((r) => f.startsWith(r)))
    if (hits.length > 0) {
      for (const h of hits) picked[h.platform].add(h.app)
      reasons.push(f + ' → ' + hits.map((h) => h.app + '-' + h.platform).join(', '))
    } else if (f.startsWith('examples/native-')) {
      reasons.push(f + ' → no device lane builds it')
    } else {
      reasons.push(f + ' → claimed by no app — every lane (fail-closed)')
      return { ios: 'all', android: 'all', reasons }
    }
  }
  const pick = (set: Set<string>): string[] | 'none' => (set.size ? [...set].sort() : 'none')
  return { ios: pick(picked.ios), android: pick(picked.android), reasons }
}

export function formatApps(v: 'all' | 'none' | string[]): string {
  return typeof v === 'string' ? v : v.join(' ')
}

function readAtHead(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

/** Lazily read the actual merge checkout's base, or the local main merge-base. */
export function comparisonManifestReader(repoRoot: string): (path: string) => string | null {
  let base: string | undefined
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  )
  const git = (...args: string[]): string =>
    execFileSync('git', args, {
      cwd: repoRoot,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  return (path) => {
    if (!base) {
      if (/^refs\/pull\/\d+\/merge$/.test(process.env.GITHUB_REF ?? '')) {
        // Both parents must exist. A head-only/shallow checkout is uncertainty,
        // not evidence that the package used to be web-only.
        git('rev-parse', '--verify', 'HEAD^2^{commit}')
        base = git('rev-parse', '--verify', 'HEAD^1^{commit}')
      } else base = git('merge-base', 'origin/main', 'HEAD')
      if (!/^[\da-f]{40}$/.test(base)) throw new Error('native comparison base unavailable')
    }
    return git('show', base + ':' + path)
  }
}

function listArg(name: string): string[] | undefined {
  const v = process.argv.find((a) => a.startsWith('--' + name + '='))?.slice(name.length + 3)
  return v ? v.split(',').filter(Boolean) : undefined
}

/** The self workflow at the head (cwd) and at the comparison base. */
function readSelfWorkflow(file: string): SelfWorkflow {
  let head: string | Error
  try {
    head = readFileSync(file, 'utf8')
  } catch (err) {
    head = err instanceof Error ? err : new Error(String(err))
  }
  let base: string | null | Error
  try {
    base = comparisonManifestReader(process.cwd())(file)
  } catch (err) {
    // A path that is absent at the base reads as an error from `git show`;
    // either way the comparison is impossible, so the lane counts as changed.
    base = err instanceof Error ? err : new Error(String(err))
  }
  return { file, head, base }
}

if (import.meta.main) {
  const self = process.argv.find((a) => a.startsWith('--self='))?.slice('--self='.length)
  const macosJobs = listArg('macos-jobs')
  const iosJobs = listArg('ios-jobs')
  const androidJobs = listArg('android-jobs')
  // Read the inherited descriptor: reopening /dev/stdin fails for socket-backed
  // child-process stdin on Linux (ENXIO), even though descriptor 0 is readable.
  const files = readFileSync(0, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  let pluginSurface: ReadonlySet<string> | Error
  try {
    pluginSurface = deriveNativePluginSurface(process.cwd()).files
  } catch (error) {
    pluginSurface = error instanceof Error ? error : new Error(String(error))
  }
  const out = (key: string, value: string): void => {
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, key + '=' + value + '\n')
  }
  const readBase = comparisonManifestReader(process.cwd())
  const deviceJobs = self && iosJobs && androidJobs ? { ios: iosJobs, android: androidJobs } : undefined
  if (process.argv.includes('--apps') && deviceJobs) {
    // Device lanes: the workflow file selects a platform only through that
    // platform's own job block.
    let decision: DeviceDecision
    try {
      decision = decideDevice(
        files,
        readAtHead,
        readSelfWorkflow(self!),
        deviceJobs,
        { pluginSurface, readBase, surfaces: () => deriveAppSurfaces(process.cwd()) },
      )
    } catch (err) {
      const reason = 'device decision failed (' + String(err) + ') — every lane'
      decision = {
        run: true,
        selection: { ios: 'all', android: 'all', reasons: [reason] },
        reasons: [reason],
      }
    }
    for (const r of decision.reasons) console.log('  ' + r)
    console.log(
      decision.run
        ? 'native surface touched — validating'
        : 'no native-surface change — native lanes skip (report success)',
    )
    out('run', String(decision.run))
    for (const r of decision.selection.reasons) console.log('  lanes: ' + r)
    console.log(
      'iOS apps: ' +
        formatApps(decision.selection.ios) +
        ' | Android apps: ' +
        formatApps(decision.selection.android),
    )
    out('ios-apps', formatApps(decision.selection.ios))
    out('android-apps', formatApps(decision.selection.android))
  } else {
    const d = classifyNativeSurface(files, readAtHead, self, pluginSurface, readBase)
    for (const r of d.reasons) console.log('  ' + r)
    console.log(
      d.run
        ? 'native surface touched — validating'
        : 'no native-surface change — native lanes skip (report success)',
    )
    out('run', String(d.run))
    if (self && macosJobs) {
      // The macOS lane asks a narrower question than `run` (see above). Any
      // failure to answer it runs the job.
      let mac: Decision
      try {
        mac = classifyMacosLane(files, readAtHead, readSelfWorkflow(self), macosJobs, { pluginSurface, readBase })
      } catch (err) {
        mac = { run: true, reasons: ['macOS decision failed (' + String(err) + ') — running (fail-closed)'] }
      }
      // The list the shell hands to `affected.ts` for `graph-macos`.
      const graphOut = process.argv.find((a) => a.startsWith('--macos-graph-files='))?.slice('--macos-graph-files='.length)
      if (graphOut) {
        const graphFiles = macosGraphFiles(files, readAtHead, readBase)
        writeFileSync(graphOut, graphFiles.length > 0 ? graphFiles.join('\n') + '\n' : '')
      }
      for (const r of mac.reasons) console.log('  macOS: ' + r)
      console.log(mac.run ? 'macOS lane needed' : 'macOS lane not needed — skips (reports success)')
      out('macos', String(mac.run))
    }
    // `--apps`: also emit the per-platform device-lane selection. Any error in
    // the derivation falls back to every lane — never to fewer.
    if (process.argv.includes('--apps')) {
      let sel: AppSelection
      try {
        // `reasons` entries are "<file> — <why>"; select from the files alone.
        const surfaceFiles = d.reasons.map((r) => r.split(' — ')[0]!).filter((f) => files.includes(f))
        sel = d.run
          ? surfaceFiles.length === d.reasons.length
            ? selectApps(surfaceFiles, deriveAppSurfaces(process.cwd()))
            : { ios: 'all', android: 'all', reasons: ['fail-closed run (no file list) — every lane'] }
          : { ios: 'none', android: 'none', reasons: [] }
      } catch (err) {
        sel = {
          ios: 'all',
          android: 'all',
          reasons: ['app derivation failed (' + String(err) + ') — every lane'],
        }
      }
      for (const r of sel.reasons) console.log('  lanes: ' + r)
      console.log('iOS apps: ' + formatApps(sel.ios) + ' | Android apps: ' + formatApps(sel.android))
      out('ios-apps', formatApps(sel.ios))
      out('android-apps', formatApps(sel.android))
    }
  }
}
