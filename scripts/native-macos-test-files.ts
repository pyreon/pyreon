// Which native-compiler test files need a macOS runner at all.
//
// `Validate emitted Swift (real-SDK typecheck, macOS)` exists for the checks
// only macOS can run: `swiftc -typecheck` against the REAL SwiftUI SDK, the
// Observation module, `xcrun`, and anything that branches on the platform.
// It used to run the WHOLE suite — 692 files, serially — so on the scarcest
// runner in the org it re-ran ~280 files whose Swift is validated against
// STUBS, which the Linux `Validate emitted Swift + Kotlin` job already
// compiles with validation REQUIRED. Measured 2026-11-02: 21–24 min warm and
// 73–81 min cold per PR, while macOS jobs queued for over an hour behind it.
//
// On PRs and main pushes the job now runs only the files this selects. The
// nightly still runs the full suite uncached, so the macOS Swift compiler
// (6.1 there vs 6.0.3 on Linux) keeps covering every stub-validated file once
// a day — the only extra signal the duplicate run carried.
//
// Selection is by CONTENT, not by a hand-kept list, so a new real-SDK test is
// picked up the day it lands. Generous: a mention anywhere in the file counts.
//
// Usage (from packages/native/compiler): bun ../../../scripts/native-macos-test-files.ts

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Anything only a macOS runner can execute or answer. */
export const MACOS_MARKERS: readonly RegExp[] = [
  /\bvalidateSwiftTypecheck\b/, // swiftc -typecheck against the real SwiftUI SDK
  /\bisSwiftUIAvailable\b/,
  /\bisObservationAvailable\b/,
  /\bxcrun\b/,
  /\bxcodebuild\b/,
  /\bxcodegen\b/i,
  /\bdarwin\b/,
  /\bprocess\.platform\b/,
  /\bmacOS\b/,
]

export function isMacOSSpecificTest(source: string): boolean {
  return MACOS_MARKERS.some((re) => re.test(source))
}

export function selectMacOSTestFiles(testsDir: string): string[] {
  return readdirSync(testsDir)
    .filter((f) => /\.test\.tsx?$/.test(f))
    .sort()
    .filter((f) => isMacOSSpecificTest(readFileSync(join(testsDir, f), 'utf8')))
    .map((f) => join(testsDir, f))
}

if (import.meta.main) {
  const dir = process.argv[2] ?? 'src/tests'
  const files = selectMacOSTestFiles(dir)
  if (files.length === 0) {
    // An empty selection would make vitest run EVERYTHING (no filter) — or,
    // worse, a caller could read it as "nothing to check". Fail loudly.
    console.error(`[native-macos-test-files] no macOS-specific tests found under ${dir}`)
    process.exit(1)
  }
  console.log(files.join('\n'))
}
