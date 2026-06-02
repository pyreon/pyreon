#!/usr/bin/env bun
/**
 * measure-native-emit-size.ts — Phase D6 of the 2026-06 native readiness
 * audit. Scout-8 scored "native bundle-size / perf telemetry" at 8/100
 * with the finding: "no check-bundle-budgets cell for native packages;
 * no emit-size measurement; no .ipa/.apk size tracking."
 *
 * This script closes the FIRST gap: emit-size measurement. Runs every
 * example app's `.tsx` source through `@pyreon/native-compiler`'s
 * `transform()` for both targets and prints + writes a JSON baseline
 * of:
 *   - Source `.tsx` byte size
 *   - Emitted Swift byte size + line count + char-per-line median
 *   - Emitted Kotlin byte size + line count + char-per-line median
 *   - Ratio (emit / source) per target — proxy for "how much overhead
 *     does the compiler add"
 *
 * What this does NOT do (Phase D6 ceiling):
 *   - Measure `.ipa` / `.apk` size — needs real-device CI (Phase C)
 *   - Lock budgets like `scripts/check-bundle-budgets.ts` does for web
 *     packages — needs the baseline to settle first (1-2 weeks of nightly
 *     runs to characterize the variance)
 *   - Measure runtime perf — separate `@pyreon/perf-harness` concern
 *
 * Usage:
 *   bun scripts/measure-native-emit-size.ts                  # print + write baseline
 *   bun scripts/measure-native-emit-size.ts --json           # JSON to stdout
 *   bun scripts/measure-native-emit-size.ts --no-write       # don't update baseline
 *
 * Baseline file: `perf-results/native-emit-size.json` — committed to
 * git as a baseline reference. The next iteration of this script
 * (Phase D6.2) will diff against this baseline + flag regressions
 * above a threshold (same shape as `check-bundle-budgets`).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transform } from '../packages/native/compiler/src/index'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(HERE, '..')
const BASELINE_PATH = resolve(REPO_ROOT, 'perf-results/native-emit-size.json')

const argv = process.argv.slice(2)
const flags = {
  json: argv.includes('--json'),
  noWrite: argv.includes('--no-write'),
}

interface SourceInput {
  /** Display name for the report. */
  name: string
  /** Repo-relative path to the source `.tsx`. */
  path: string
}

/**
 * Source files to measure. Hand-maintained list of canonical examples —
 * adding a new example here means including it in the size baseline.
 *
 * Picked for diversity: a minimal Counter, a real-app TodoMVC, and the
 * canonical-vocabulary fixtures (which exercise different primitive
 * shapes per fixture). The fixtures aren't "real apps" but they're
 * the smallest stable surface for measuring per-primitive emit cost.
 */
const SOURCES: SourceInput[] = [
  {
    name: 'native-counter (minimal)',
    path: 'examples/native-counter-ios/src/Counter.tsx',
  },
  {
    name: 'native-todomvc (real-app)',
    path: 'examples/native-todomvc-ios/src/TodoApp.tsx',
  },
  // Per-fixture coverage is a follow-up — add as the canonical-vocab
  // fixtures (B5 / B5.2 / B5.3 / B5.4 / B5.5) merge to main. The script
  // gracefully skips paths that don't exist, so adding them early in
  // a stacked PR is safe.
]

interface Metrics {
  source: { bytes: number; lines: number }
  swift: { bytes: number; lines: number; ratio: number } | null
  kotlin: { bytes: number; lines: number; ratio: number } | null
}

interface Report {
  /** ISO timestamp of when this baseline was recorded — stamped at the
   *  call site, not at import time, to keep the script deterministic
   *  modulo time. */
  generatedAt: string
  results: Record<string, Metrics>
}

function measure(path: string): Metrics {
  const abs = resolve(REPO_ROOT, path)
  if (!existsSync(abs)) {
    // Source missing — skip without failing (a fixture might be
    // removed; we don't want to break the script on every cleanup).
    return {
      source: { bytes: 0, lines: 0 },
      swift: null,
      kotlin: null,
    }
  }
  const source = readFileSync(abs, 'utf8')
  const sourceBytes = Buffer.byteLength(source, 'utf8')
  const sourceLines = source.split('\n').length

  let swift: Metrics['swift'] = null
  let kotlin: Metrics['kotlin'] = null

  try {
    const swiftCode = transform(source, { target: 'swift' }).code
    swift = {
      bytes: Buffer.byteLength(swiftCode, 'utf8'),
      lines: swiftCode.split('\n').length,
      ratio: Math.round((Buffer.byteLength(swiftCode, 'utf8') / sourceBytes) * 100) / 100,
    }
  } catch (err) {
    // Emit failed — record the failure but don't crash the whole
    // run; other sources should still measure.
    console.error(
      `[measure-native-emit-size] swift transform failed for ${path}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  try {
    const kotlinCode = transform(source, { target: 'kotlin' }).code
    kotlin = {
      bytes: Buffer.byteLength(kotlinCode, 'utf8'),
      lines: kotlinCode.split('\n').length,
      ratio: Math.round((Buffer.byteLength(kotlinCode, 'utf8') / sourceBytes) * 100) / 100,
    }
  } catch (err) {
    console.error(
      `[measure-native-emit-size] kotlin transform failed for ${path}: ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  return { source: { bytes: sourceBytes, lines: sourceLines }, swift, kotlin }
}

const results: Record<string, Metrics> = {}
for (const src of SOURCES) {
  results[src.name] = measure(src.path)
}

// Use environment-injected timestamp if available (CI / reproducibility);
// otherwise stamp now. Avoids the script being purely time-deterministic
// while still pinning to a specific instant for the baseline file.
const generatedAt = process.env.PYREON_MEASURE_TIMESTAMP ?? new Date().toISOString()

const report: Report = { generatedAt, results }

if (flags.json) {
  console.log(JSON.stringify(report, null, 2))
} else {
  console.log('Native emit-size baseline')
  console.log('─────────────────────────')
  for (const [name, m] of Object.entries(report.results)) {
    if (m.source.bytes === 0) {
      console.log(`  ${name}: (source missing)`)
      continue
    }
    console.log(`  ${name}`)
    console.log(`    source: ${m.source.bytes}B, ${m.source.lines}L`)
    if (m.swift) {
      console.log(
        `    swift:  ${m.swift.bytes}B, ${m.swift.lines}L (×${m.swift.ratio} source)`,
      )
    } else {
      console.log(`    swift:  (transform failed)`)
    }
    if (m.kotlin) {
      console.log(
        `    kotlin: ${m.kotlin.bytes}B, ${m.kotlin.lines}L (×${m.kotlin.ratio} source)`,
      )
    } else {
      console.log(`    kotlin: (transform failed)`)
    }
  }
}

if (!flags.noWrite) {
  // Ensure perf-results/ exists (it does in this repo, but defensive).
  mkdirSync(dirname(BASELINE_PATH), { recursive: true })
  writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8')
  if (!flags.json) {
    console.log(`\n  baseline: ${BASELINE_PATH.replace(REPO_ROOT + '/', '')}`)
  }
}
