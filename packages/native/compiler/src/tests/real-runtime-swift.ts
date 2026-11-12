// `swiftc -typecheck` of emitted Swift against the REAL iOS SDK with the REAL
// runtime sources in the same module — the one shape of check that a stub
// cannot vouch for, and the only one in this suite that needs a macOS runner
// for more than a second.
//
// One compile costs the SDK load plus every shipped runtime file (9 s on a
// quiet laptop, 45-65 s on a three-core macOS runner with files in parallel),
// and nine test files each used to hand-roll it with `execFileSync`. Twelve
// such compiles were 650 of the 772 file-seconds of a WARM macOS run: the
// verdict cache never saw them, so they were re-derived on every run of the
// scarcest runner the repo has.
//
// This is the single implementation, and it goes through the same
// content-addressed verdict cache as every other validator. The verdict is a
// pure function of what the key folds in:
//
//   - the compiler and SDK identity (`swiftc --version`, the SDK's version and
//     BUILD, the target triple and flags) — a runner-image Xcode bump misses
//   - every runtime source, by repo-relative path AND content — a runtime edit
//     misses, for every caller at once
//   - the emitted files, by name and content
//
// The nightly drift run sets `PYREON_VALIDATE_NO_CACHE=1`, so each of these is
// still compiled from scratch once a day.

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { isTransientProcessFailure, withVerdictCache } from '../validate-cache'

const REPO = resolve(import.meta.dirname, '../../../../..')

/** Roots that hold shipped Swift runtime source (the monolith packages and every co-located runtime). */
const RUNTIME_ROOTS = [
  'packages/fundamentals',
  'packages/core',
  'packages/native/runtime-swift',
  'packages/native/router-swift',
] as const

const TARGET = 'arm64-apple-ios17.0-simulator'
/** What the CLI prepends to an emit; the raw transform output carries no imports. */
export const SWIFT_APP_IMPORTS = 'import SwiftUI\nimport Foundation\n'

/**
 * Every Swift file the runtime actually ships, sorted.
 *
 * `Package.swift` is an SPM MANIFEST, not runtime source: two of them collide
 * on filename and swiftc refuses the whole compile. Test sources are excluded
 * because they are not shipped and because a fixture type is free to take an
 * ordinary name (`PyreonTableStateTests` declares `Row`, which collides with
 * the `Row` an app's own table code declares). Matched case-insensitively on
 * the directory, plus the `*Tests.swift` file convention: the real directory
 * is lowercase `tests`.
 */
export function runtimeSwiftSources(repo: string = REPO): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      return
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'lib' || e === '.build' || e === 'Package.swift') continue
      if (e.toLowerCase() === 'tests' || /Tests?\.swift$/.test(e)) continue
      const p = join(dir, e)
      if (statSync(p).isDirectory()) walk(p)
      else if (p.endsWith('.swift')) out.push(p)
    }
  }
  for (const root of RUNTIME_ROOTS) walk(join(repo, root))
  return out.sort()
}

/** One emitted file: the name it is compiled under and the raw transform output. */
export interface EmittedSwiftFile {
  name: string
  code: string
}

export interface RealRuntimeOptions {
  /**
   * Give the compile its own clang module cache instead of the user-wide one.
   * Slower (the SDK's clang modules are rebuilt), and what two callers asked
   * for before this helper existed; it cannot change a verdict.
   */
  isolatedModuleCache?: boolean
  /** Runtime sources to compile in; defaults to everything shipped. */
  sources?: readonly string[]
  /** Repo root the sources are named relative to in the cache key. */
  repo?: string
}

const xcrun = (...args: string[]): string =>
  execFileSync('xcrun', ['--sdk', 'iphonesimulator', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

let _toolchain: { sdkPath: string; identity: string } | undefined
/** The SDK path and everything about the toolchain that can change a verdict. */
function toolchain(): { sdkPath: string; identity: string } {
  if (_toolchain) return _toolchain
  const sdkPath = xcrun('--show-sdk-path')
  // The BUILD version moves on an Xcode point release that keeps the SDK's
  // marketing version, which is exactly the drift a runner-image bump brings.
  const identity = [
    xcrun('swiftc', '--version'),
    xcrun('--show-sdk-version'),
    xcrun('--show-sdk-build-version'),
    TARGET,
  ].join('\n')
  _toolchain = { sdkPath, identity }
  return _toolchain
}

/** For testing: forget the probed toolchain. */
export function _resetRealRuntimeToolchain(): void {
  _toolchain = undefined
}

/** A digest of files by name and content, NUL-separated so no two lists can collide. */
function digest(files: readonly { name: string; text: string }[]): string {
  const h = createHash('sha256')
  for (const f of files) h.update(f.name).update('\0').update(f.text).update('\0')
  return h.digest('hex')
}

/** The verdict-cache key parts for one compile; exported so the key contract is testable without a toolchain. */
export function realRuntimeKeyParts(
  files: readonly EmittedSwiftFile[],
  sources: readonly string[],
  repo: string,
  isolatedModuleCache: boolean,
): { stubs: string; source: string } {
  return {
    // The "stubs" slot holds what the emit is compiled AGAINST: here, the
    // runtime itself.
    stubs: digest(sources.map((p) => ({ name: relative(repo, p), text: readFileSync(p, 'utf8') }))),
    source: `${isolatedModuleCache ? 'isolated-module-cache' : 'shared-module-cache'}\0${digest(
      files.map((f) => ({ name: f.name, text: SWIFT_APP_IMPORTS + f.code })),
    )}`,
  }
}

/**
 * Typecheck `files` (raw emits; the SwiftUI/Foundation imports are added here)
 * in ONE module with the shipped runtime sources, against the real iOS
 * simulator SDK. Returns null when the compiler accepts, else its diagnostics.
 *
 * Callers gate on `isSwiftUIAvailable()`; this throws where `xcrun` is absent.
 */
export function typecheckAgainstRealRuntime(
  files: readonly EmittedSwiftFile[],
  options: RealRuntimeOptions = {},
): string | null {
  const repo = options.repo ?? REPO
  const sources = options.sources ?? runtimeSwiftSources(repo)
  // An empty list would make the compile vacuously succeed, which is the
  // failure mode these checks exist to close.
  if (sources.length <= 40) {
    return `[Pyreon] only ${sources.length} runtime Swift sources found under ${repo}; expected more than 40. The runtime packages moved: update RUNTIME_ROOTS in real-runtime-swift.ts.`
  }
  const isolated = options.isolatedModuleCache === true
  const { sdkPath, identity } = toolchain()
  const key = realRuntimeKeyParts(files, sources, repo, isolated)

  const verdict = withVerdictCache('swift-real-runtime', identity, key.stubs, key.source, () => {
    const dir = mkdtempSync(join(tmpdir(), 'pyreon-real-runtime-'))
    try {
      const paths = files.map((f) => {
        const p = join(dir, f.name)
        writeFileSync(p, SWIFT_APP_IMPORTS + f.code, 'utf8')
        return p
      })
      execFileSync(
        'xcrun',
        [
          '--sdk',
          'iphonesimulator',
          'swiftc',
          '-typecheck',
          ...(isolated ? ['-module-cache-path', join(dir, 'ModuleCache')] : []),
          '-target',
          TARGET,
          '-sdk',
          sdkPath,
          ...paths,
          ...sources,
        ],
        { encoding: 'utf8', stdio: 'pipe' },
      )
      return { ok: true }
    } catch (err) {
      const e = err as { stderr?: string | Buffer; stdout?: string | Buffer; message?: string }
      const output = [e.stderr, e.stdout]
        .map((x) => (typeof x === 'string' ? x : (x?.toString('utf8') ?? '')))
        .join('\n')
        .trim()
      const error = output || e.message || 'swiftc -typecheck failed with no output'
      // A killed or never-started compiler delivered no verdict: never cache it.
      return isTransientProcessFailure(err)
        ? { ok: false, error, transient: true }
        : { ok: false, error }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
  return verdict.ok ? null : (verdict.error ?? 'swiftc -typecheck failed')
}

/** The compiler's `error:` lines, capped — what a failing assertion should print. */
export function swiftErrorLines(diagnostics: string, limit = 12): string {
  return diagnostics
    .split('\n')
    .filter((l) => l.includes('error:'))
    .slice(0, limit)
    .join('\n')
}
