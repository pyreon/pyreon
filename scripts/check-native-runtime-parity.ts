#!/usr/bin/env bun
/**
 * check-native-runtime-parity.ts — Phase D5 of the 2026-06 native
 * readiness audit. Closes Scout-3's note that B1's `RUNTIME_NAME` /
 * `VERSION` parity contract between Swift and Kotlin runtimes was
 * "manual today; CI lint follow-up."
 *
 * Both `PyreonReactivity` and `PyreonTokens` ship a documented
 * cross-target parity contract:
 *
 *   Swift                                Kotlin
 *   PyreonReactivity.runtimeName    ↔   PyreonReactivity.RUNTIME_NAME
 *     = "@pyreon/native-runtime-swift"     = "@pyreon/native-runtime-kotlin"
 *   PyreonTokens.version            ↔   PyreonTokens.VERSION
 *     = "0.0.0-phase0-scaffold"            = "0.0.0-phase0-scaffold"  (must match)
 *
 * The runtimeName/RUNTIME_NAME pair is the per-target package name
 * (intentionally different per package — drift check is just
 * "non-empty, correct package name").
 *
 * The version/VERSION pair MUST MATCH ACROSS TARGETS — when the
 * styler emit lands and bumps Swift's version, Kotlin must bump in
 * the same PR. This script catches forgetting to update one side.
 *
 * Exit code:
 *   0 — all parity contracts hold
 *   1 — drift detected (script prints which contract failed and where)
 *
 * Wired into a CI job to gate PRs that touch either runtime's
 * PyreonReactivity.{swift,kt} or PyreonTokens.{swift,kt}.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')

const SWIFT_REACTIVITY = resolve(
  REPO_ROOT,
  'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonReactivity.swift',
)
const KOTLIN_REACTIVITY = resolve(
  REPO_ROOT,
  'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonReactivity.kt',
)
const SWIFT_TOKENS = resolve(
  REPO_ROOT,
  'packages/native/runtime-swift/Sources/PyreonRuntime/PyreonTokens.swift',
)
const KOTLIN_TOKENS = resolve(
  REPO_ROOT,
  'packages/native/runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonTokens.kt',
)

interface Drift {
  contract: string
  expected: string
  found: { file: string; value: string | null }[]
}

const drifts: Drift[] = []

/**
 * Pull a quoted string-literal value out of a source file given a name
 * pattern. Returns null when the file is absent or no match found.
 *
 * Examples of the patterns we extract:
 *   Swift:  `public static let runtimeName: String = "..."`
 *   Kotlin: `public const val RUNTIME_NAME: String = "..."`
 *
 * The regex is intentionally permissive — `\s+` between tokens absorbs
 * any internal whitespace; it doesn't care about exact spacing/order.
 */
function extractStringLiteral(
  file: string,
  pattern: RegExp,
): { file: string; value: string | null } {
  if (!existsSync(file)) {
    return { file, value: null }
  }
  const src = readFileSync(file, 'utf8')
  const match = src.match(pattern)
  return { file, value: match?.[1] ?? null }
}

// Contract 1: RUNTIME_NAME — per-package, must be the documented value.
const swiftRuntimeName = extractStringLiteral(
  SWIFT_REACTIVITY,
  /runtimeName[^"']*"([^"]+)"/,
)
const kotlinRuntimeName = extractStringLiteral(
  KOTLIN_REACTIVITY,
  /RUNTIME_NAME[^"']*"([^"]+)"/,
)
if (swiftRuntimeName.value !== '@pyreon/native-runtime-swift') {
  drifts.push({
    contract: 'PyreonReactivity.runtimeName (Swift)',
    expected: '@pyreon/native-runtime-swift',
    found: [swiftRuntimeName],
  })
}
if (kotlinRuntimeName.value !== '@pyreon/native-runtime-kotlin') {
  drifts.push({
    contract: 'PyreonReactivity.RUNTIME_NAME (Kotlin)',
    expected: '@pyreon/native-runtime-kotlin',
    found: [kotlinRuntimeName],
  })
}

// Contract 2: VERSION — must match across targets. Both ship the same
// "0.0.0-phase0-scaffold" sentinel today; when styler emit lands and
// bumps one side, the other must follow in the same PR.
const swiftVersion = extractStringLiteral(
  SWIFT_TOKENS,
  /version[^"']*"([^"]+)"/,
)
const kotlinVersion = extractStringLiteral(
  KOTLIN_TOKENS,
  /VERSION[^"']*"([^"]+)"/,
)
if (swiftVersion.value === null || kotlinVersion.value === null) {
  drifts.push({
    contract: 'PyreonTokens.{version,VERSION} (per-target presence)',
    expected: 'both targets must define a version string',
    found: [swiftVersion, kotlinVersion],
  })
} else if (swiftVersion.value !== kotlinVersion.value) {
  drifts.push({
    contract: 'PyreonTokens.{version,VERSION} (cross-target match)',
    expected: `same string on both targets (Swift currently "${swiftVersion.value}")`,
    found: [swiftVersion, kotlinVersion],
  })
}

if (drifts.length === 0) {
  console.log(
    '[check-native-runtime-parity] ✓ all cross-target parity contracts hold',
  )
  console.log(
    `  RUNTIME_NAME: Swift "${swiftRuntimeName.value}" + Kotlin "${kotlinRuntimeName.value}"`,
  )
  console.log(
    `  VERSION:      both targets at "${swiftVersion.value}"`,
  )
  process.exit(0)
}

console.error(
  `[check-native-runtime-parity] ✗ ${drifts.length} drift(s) detected:\n`,
)
for (const drift of drifts) {
  console.error(`  Contract: ${drift.contract}`)
  console.error(`    Expected: ${drift.expected}`)
  for (const { file, value } of drift.found) {
    const rel = file.replace(REPO_ROOT + '/', '')
    console.error(`    ${rel}: ${value === null ? '(missing)' : `"${value}"`}`)
  }
  console.error('')
}
console.error('To fix: update BOTH sides in the SAME PR — the parity is')
console.error('the whole point. Single-side updates silently drift.')
process.exit(1)
