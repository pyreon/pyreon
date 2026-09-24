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

import { appendFileSync, existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, relative } from 'node:path'

export interface Decision {
  run: boolean
  /** One line per file that forced the run (empty when it skips). */
  reasons: string[]
}

/** The JSX compiler's napi-rs crate — NOT a PMTC surface. */
const JSX_COMPILER_CRATE = 'packages/core/compiler/native/'

const PACKAGE_JSON = /^packages\/[^/]+\/[^/]+\/package\.json$/

/**
 * `read(path)` returns the file's content at the PR head, or null when it does
 * not exist there (deleted). It is injected so the rule is unit-testable
 * without a checkout.
 */
export function classifyNativeSurface(
  files: readonly string[],
  read: (path: string) => string | null,
  selfWorkflow?: string,
): Decision {
  const reasons: string[] = []
  if (files.length === 0) return { run: true, reasons: ['empty file list — running (fail-closed)'] }
  for (const f of files) {
    if (f.startsWith('packages/native/')) reasons.push(f + ' — PMTC stack')
    else if (f.startsWith('examples/native-')) reasons.push(f + ' — native example')
    else if (/^packages\/[^/]+\/[^/]+\/native\//.test(f) && !f.startsWith(JSX_COMPILER_CRATE))
      reasons.push(f + ' — co-located native source')
    else if (f.startsWith('scripts/check-native-')) reasons.push(f + ' — native gate script')
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
      let declaresNative = false
      try {
        const json = JSON.parse(content) as { pyreon?: { native?: unknown } }
        declaresNative = json.pyreon?.native !== undefined
      } catch {
        declaresNative = true
      }
      if (declaresNative) reasons.push(f + ' — declares pyreon.native')
    }
  }
  return { run: reasons.length > 0, reasons }
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
// no lane builds (native-viz, a *-web sibling): no lane can observe it.

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
  for (const name of readdirSync(join(repoRoot, 'examples')).sort()) {
    const dir = 'examples/' + name
    const m = APP_DIR.exec(dir)
    if (!m) continue
    const platform = m[2] as Platform
    const roots = new Set<string>([asRoot(dir)])
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
    if (existsSync(build)) {
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
    out.push({ platform, app: m[1]!, roots: [...roots].sort() })
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
export function selectApps(files: readonly string[], surfaces: readonly AppSurface[]): AppSelection {
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

if (import.meta.main) {
  const self = process.argv.find((a) => a.startsWith('--self='))?.slice('--self='.length)
  const files = readFileSync('/dev/stdin', 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  const d = classifyNativeSurface(files, readAtHead, self)
  for (const r of d.reasons) console.log('  ' + r)
  console.log(
    d.run
      ? 'native surface touched — validating'
      : 'no native-surface change — native lanes skip (report success)',
  )
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, 'run=' + String(d.run) + '\n')
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
      sel = { ios: 'all', android: 'all', reasons: ['app derivation failed (' + String(err) + ') — every lane'] }
    }
    for (const r of sel.reasons) console.log('  lanes: ' + r)
    console.log('iOS apps: ' + formatApps(sel.ios) + ' | Android apps: ' + formatApps(sel.android))
    if (process.env.GITHUB_OUTPUT)
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        'ios-apps=' + formatApps(sel.ios) + '\nandroid-apps=' + formatApps(sel.android) + '\n',
      )
  }
}
