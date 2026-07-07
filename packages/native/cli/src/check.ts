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
  /**
   * 1-based source position parsed from the message when the compiler /
   * toolchain embedded one — transform (oxc) parse errors carry a
   * `╭─[ file:line:col ]` frame and swiftc / kotlinc type-check errors
   * carry `file:line:col:`. Absent for unsupported-subset WARNINGS: those
   * are position-less strings today (threading spans through the ~110
   * warn sites is a tracked follow-up), so an editor surface renders a
   * precise squiggle when `position` is present and a file-level
   * diagnostic otherwise.
   */
  position?: { line: number; column: number }
}

/**
 * Best-effort 1-based source position parsed out of a compiler /
 * toolchain error message. Two formats carry one:
 *   - oxc parse frame:   `╭─[ <path>:<line>:<col> ]`
 *   - swiftc / kotlinc:  `<path>:<line>:<col>: error: …`
 * Returns the FIRST match, or `undefined` when the message carries no
 * position (the common warning case). Pure — the unit-testable core of
 * the editor-diagnostic surface.
 */
export function extractPosition(
  message: string,
): { line: number; column: number } | undefined {
  // Check the framed form first — a bare `:L:C:` scan could otherwise
  // match digits inside the frame's own path.
  const frame = message.match(/\[\s*[^\]\n]*?:(\d+):(\d+)\s*\]/)
  if (frame) return { line: Number(frame[1]), column: Number(frame[2]) }
  const colon = message.match(/:(\d+):(\d+):/)
  if (colon) return { line: Number(colon[1]), column: Number(colon[2]) }
  return undefined
}

/** Attach a parsed source position to a finding when its message carries one. */
function withPosition(finding: CheckFinding): CheckFinding {
  const position = extractPosition(finding.message)
  return position ? { ...finding, position } : finding
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
      throw new Error(`[Pyreon] check: ${source} is not a .tsx file`)
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

export interface CheckSourceOptions {
  /** Targets to check (e.g. `['swift', 'kotlin']`). */
  targets: TargetLanguage[]
  /** Also run `swiftc -typecheck` on the Swift emit (macOS-only). */
  typecheck?: boolean
}

export interface CheckSourceResult {
  /**
   * True when the source is a web-only entry (imports the DOM / SSR
   * runtime) — the caller should skip it, exactly as `check()` does
   * file-wise. `findings` is empty in that case.
   */
  webEntry: boolean
  findings: CheckFinding[]
}

/**
 * Check ONE source string IN MEMORY — no disk read. This is the reusable
 * core an editor surface / future LSP calls on an unsaved buffer;
 * `check()` is the disk-reading, tree-walking wrapper around it. Error +
 * type-check-error findings carry a parsed source `position` when the
 * message embeds one (see `extractPosition`).
 */
export function checkSource(
  code: string,
  fileName: string,
  options: CheckSourceOptions,
): CheckSourceResult {
  if (isWebOnlyEntry(code)) return { webEntry: true, findings: [] }

  const findings: CheckFinding[] = []
  // Probe SwiftUI once per call (the compiler caches the result).
  const canTypecheck = options.typecheck === true && isSwiftUIAvailable()
  const typecheckRequestedButUnavailable =
    options.typecheck === true && !isSwiftUIAvailable()

  for (const target of options.targets) {
    let emitted: string | undefined
    try {
      const result = transform(code, { target })
      emitted = result.code
      for (const w of result.warnings) {
        findings.push({ file: fileName, target, kind: 'warning', message: w })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      findings.push(withPosition({ file: fileName, target, kind: 'error', message }))
      continue
    }
    // Opt-in deep type-check (Swift only — SwiftUI SDK).
    if (target === 'swift' && options.typecheck === true) {
      if (typecheckRequestedButUnavailable) {
        findings.push({
          file: fileName,
          target,
          kind: 'typecheck-skipped',
          message: 'SwiftUI SDK unavailable (non-macOS) — type-check skipped',
        })
      } else if (canTypecheck) {
        const res = validateSwiftTypecheck(emitted)
        if (!res.ok) {
          const error = res.error ?? 'swiftc -typecheck failed'
          if (isRuntimeModuleMiss(error)) {
            findings.push({
              file: fileName,
              target,
              kind: 'typecheck-skipped',
              message:
                'references PyreonRuntime/PyreonRouter — type-check skipped (module not on search path)',
            })
          } else {
            findings.push(
              withPosition({ file: fileName, target, kind: 'typecheck-error', message: error }),
            )
          }
        }
      }
    }
  }
  return { webEntry: false, findings }
}

export function check(options: CheckOptions): CheckResult {
  const targets = options.targets ?? (['swift', 'kotlin'] as TargetLanguage[])
  const inputs = resolveCheckInputs(options.source)
  const findings: CheckFinding[] = []
  const skippedWebEntries: string[] = []
  let filesChecked = 0

  for (const file of inputs) {
    const code = readFileSync(file, 'utf8')
    const result = checkSource(code, file, {
      targets,
      ...(options.typecheck ? { typecheck: true } : {}),
    })
    if (result.webEntry) {
      skippedWebEntries.push(file)
      continue
    }
    filesChecked++
    findings.push(...result.findings)
  }

  const errorCount = findings.filter(
    (f) => f.kind === 'error' || f.kind === 'typecheck-error',
  ).length
  const warningCount = findings.filter((f) => f.kind === 'warning').length
  return { filesChecked, skippedWebEntries, findings, errorCount, warningCount }
}

// --- watch mode -----------------------------------------------------------
// mtime-polling (NOT fs.watch): deterministic + cross-platform reliable.
// `fs.watch` recursive support is inconsistent across Node/OS and its
// event timing makes CI tests flaky — a poll over the resolved input
// set + an mtime diff is the robust choice for an authoring-loop watcher.

/** Snapshot each input file's mtime (ms). Missing files are omitted. */
export function collectMtimes(files: string[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of files) {
    try {
      out[f] = statSync(f).mtimeMs
    } catch {
      // file vanished between resolve + stat — treat as absent.
    }
  }
  return out
}

/** True iff any file was added, removed, or its mtime moved. */
export function mtimesChanged(
  prev: Record<string, number>,
  cur: Record<string, number>,
): boolean {
  const prevKeys = Object.keys(prev)
  const curKeys = Object.keys(cur)
  if (prevKeys.length !== curKeys.length) return true
  for (const k of curKeys) {
    if (prev[k] !== cur[k]) return true
  }
  return false
}

// Plain timeout. Abort is handled by the loop's `aborted` checks before
// + after each delay — so an abort during a delay exits within one
// interval (fine for a feedback watcher), and we avoid an
// AbortSignal.addEventListener (which the lint layer flags as a raw
// listener) + a `resolve` name that would shadow node:path's import.
function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

export interface WatchHandlers {
  /** Called with the result of the initial check + every re-check. */
  onResult: (result: CheckResult) => void
  /** Poll interval; default 400ms. */
  intervalMs?: number
  /** Stop the watch loop. */
  signal?: AbortSignal
  /**
   * Test-only: stop after N poll iterations (default Infinity). Keeps the
   * loop's glue covered without a long-running / timing-flaky test.
   */
  maxTicks?: number
}

/**
 * Run `check` once, then re-run it whenever a source `.tsx` mtime moves
 * (or a file is added/removed). Resolves when `signal` aborts or
 * `maxTicks` is reached. The pure diff (`mtimesChanged`) + the already-
 * tested `check()` carry the logic; this is thin polling glue.
 */
export async function watchCheck(
  options: CheckOptions,
  handlers: WatchHandlers,
): Promise<void> {
  const intervalMs = handlers.intervalMs ?? 400
  const maxTicks = handlers.maxTicks ?? Infinity
  let prev = collectMtimes(resolveCheckInputs(options.source))
  handlers.onResult(check(options))
  let ticks = 0
  while (!handlers.signal?.aborted && ticks < maxTicks) {
    await delay(intervalMs)
    if (handlers.signal?.aborted) break
    const cur = collectMtimes(resolveCheckInputs(options.source))
    if (mtimesChanged(prev, cur)) {
      prev = cur
      handlers.onResult(check(options))
    }
    ticks++
  }
}
