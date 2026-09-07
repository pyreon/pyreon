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

import { appendFileSync, readFileSync } from 'node:fs'

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
}
