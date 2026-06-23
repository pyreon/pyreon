// `pyreon-native check` — fast "does my .tsx compile to native?" feedback
// WITHOUT a full build (no xcodegen / gradle / file writes).
//
// The authoring-loop gap this closes: before this, the only way to learn
// whether a component emits valid native code — or what the unsupported-
// TS-subset drops are — was to run a full `build` + open the platform
// toolchain. `check` runs the PMTC `transform()` for BOTH targets in
// memory and reports, per file:
//   - transform ERRORS (the compiler threw on this source)
//   - unsupported-subset WARNINGS (silently-dropped / mis-emitted shapes)
//   - (opt-in `--typecheck`) real `swiftc -typecheck` against the SwiftUI
//     SDK — catches the type-corruption class (`[Any]`, unbound closure
//     params, invalid initializer shapes) that emit-shape + `-parse` miss.
//
// Fast by construction: in-memory transform, no IO. Single-file mode
// (`--source=path/to/App.tsx`) is the edit-loop case; dir mode walks the
// tree. Exit 0 on clean-or-warnings, 2 on any transform/type error.

import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  transform,
  validateSwiftTypecheck,
  isSwiftUIAvailable,
  type TargetLanguage,
} from '@pyreon/native-compiler'
import { findTsxFiles, isWebOnlyEntry } from './build'

export interface CheckOptions {
  /** A `.tsx` file OR a directory to walk. */
  source: string
  /** Targets to check. Defaults to both `swift` + `kotlin`. */
  targets?: TargetLanguage[]
  /**
   * Also run `swiftc -typecheck` (real SwiftUI SDK) on the Swift emit.
   * macOS-only; skips per-file when SwiftUI is unavailable. Emit that
   * references the `PyreonRuntime` / `PyreonRouter` modules is reported
   * as `typecheck-skipped` (those modules aren't on the search path —
   * the multi-module gate is a separate concern), never a false error.
   */
  typecheck?: boolean
}

export type CheckFindingKind = 'error' | 'warning' | 'typecheck-error' | 'typecheck-skipped'

export interface CheckFinding {
  file: string
  target: TargetLanguage
  kind: CheckFindingKind
  message: string
}

export interface CheckResult {
  filesChecked: number
  skippedWebEntries: string[]
  findings: CheckFinding[]
  /** transform-error + typecheck-error count (the exit-2 drivers). */
  errorCount: number
  /** unsupported-subset warning count (advisory). */
  warningCount: number
}

/** Resolve `--source` to a concrete `.tsx` file list (single-file OR walk). */
export function resolveCheckInputs(source: string): string[] {
  const abs = resolve(source)
  const stat = statSync(abs)
  if (stat.isFile()) {
    if (!abs.endsWith('.tsx')) {
      throw new Error(`check: ${source} is not a .tsx file`)
    }
    return [abs]
  }
  return findTsxFiles(abs)
}

/**
 * A `swiftc -typecheck` failure whose ONLY errors are unresolved
 * `Pyreon*` runtime symbols means the emit is fine but references a
 * module not on the search path (PyreonRuntime / PyreonRouter). Classify
 * that as a skip, not a real type error — so `--typecheck` stays honest
 * until the multi-module gate lands.
 */
function isRuntimeModuleMiss(error: string): boolean {
  const errorLines = error.split('\n').filter((l) => /error:/.test(l))
  if (errorLines.length === 0) return false
  return errorLines.every((l) => /cannot find '?Pyreon\w+'? in scope/.test(l))
}

export function check(options: CheckOptions): CheckResult {
  const targets = options.targets ?? (['swift', 'kotlin'] as TargetLanguage[])
  const inputs = resolveCheckInputs(options.source)
  const findings: CheckFinding[] = []
  const skippedWebEntries: string[] = []
  let filesChecked = 0

  // Probe SwiftUI once (cached in the compiler), only when needed.
  const canTypecheck = options.typecheck === true && isSwiftUIAvailable()
  const typecheckRequestedButUnavailable =
    options.typecheck === true && !isSwiftUIAvailable()

  for (const file of inputs) {
    const code = readFileSync(file, 'utf8')
    if (isWebOnlyEntry(code)) {
      skippedWebEntries.push(file)
      continue
    }
    filesChecked++
    for (const target of targets) {
      let emitted: string | undefined
      try {
        const result = transform(code, { target })
        emitted = result.code
        for (const w of result.warnings) {
          findings.push({ file, target, kind: 'warning', message: w })
        }
      } catch (err) {
        findings.push({
          file,
          target,
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
        continue
      }
      // Opt-in deep type-check (Swift only — SwiftUI SDK).
      if (target === 'swift' && options.typecheck === true) {
        if (typecheckRequestedButUnavailable) {
          findings.push({
            file,
            target,
            kind: 'typecheck-skipped',
            message: 'SwiftUI SDK unavailable (non-macOS) — type-check skipped',
          })
        } else if (canTypecheck) {
          const res = validateSwiftTypecheck(emitted)
          if (!res.ok) {
            const error = res.error ?? 'swiftc -typecheck failed'
            findings.push({
              file,
              target,
              kind: isRuntimeModuleMiss(error) ? 'typecheck-skipped' : 'typecheck-error',
              message: isRuntimeModuleMiss(error)
                ? 'references PyreonRuntime/PyreonRouter — type-check skipped (module not on search path)'
                : error,
            })
          }
        }
      }
    }
  }

  const errorCount = findings.filter(
    (f) => f.kind === 'error' || f.kind === 'typecheck-error',
  ).length
  const warningCount = findings.filter((f) => f.kind === 'warning').length
  return { filesChecked, skippedWebEntries, findings, errorCount, warningCount }
}
