// Compile-validation harness.
//
// Snapshot tests prove "the emit equals what it equalled last time."
// They do NOT prove "the emit is valid Swift / Kotlin." This module
// closes that gap by piping emitted source through the actual language
// compilers. Swift uses `swiftc -parse` (parse-only, no semantic
// analysis). Kotlin uses `kotlinc` with a minimal Compose stubs file
// (see kotlin-stubs.ts) since kotlinc has no parse-only flag — the
// stubs satisfy semantic analysis without requiring real Compose.
//
// Tool detection is automatic: when the language compiler is on PATH,
// validation runs by default. Set `PYREON_SKIP_NATIVE_VALIDATE=1` to
// force-skip both. Set `PYREON_REQUIRE_NATIVE_VALIDATE=1` to fail
// (instead of skip) when tools are absent — useful in CI environments
// where the toolchain SHOULD be installed.

import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { KOTLIN_CHART_VIEW_STUBS, KOTLIN_COMPOSE_STUBS } from './kotlin-stubs'
import { SWIFT_CHART_VIEW_STUBS, SWIFT_UI_STUBS } from './swift-stubs'
import {
  readToolProbe,
  withVerdictCache,
  writeToolProbe,
  type ValidateKind,
} from './validate-cache'

export interface ValidationResult {
  /** True iff the source was accepted as syntactically valid. */
  ok: boolean
  /** Error output from the compiler when `ok` is false. */
  error?: string
  /** True iff this run was skipped (tool not available + not required). */
  skipped?: boolean
  /** Human-readable reason for a skip. */
  skipReason?: string
}

/**
 * Detect whether `swiftc` is on PATH. Cheap probe via `swiftc --version`.
 * Cached for the lifetime of the process — tool availability won't
 * change mid-run.
 */
let _swiftcAvailable: boolean | undefined
let _swiftcVersion = ''
export function isSwiftcAvailable(): boolean {
  if (_swiftcAvailable !== undefined) return _swiftcAvailable
  const cached = readToolProbe('swiftc')
  if (cached !== null) {
    _swiftcAvailable = cached.available
    _swiftcVersion = cached.version
    return _swiftcAvailable
  }
  try {
    // Capture stdout rather than discarding it: the version string is needed
    // as a verdict-cache key component anyway, so taking it here costs
    // nothing and saves a second spawn.
    _swiftcVersion = execFileSync('swiftc', ['--version'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      encoding: 'utf8',
    }).trim()
    _swiftcAvailable = true
  } catch {
    _swiftcAvailable = false
    _swiftcVersion = ''
  }
  writeToolProbe('swiftc', { available: _swiftcAvailable, version: _swiftcVersion })
  return _swiftcAvailable
}

/**
 * The `swiftc` version string, for use as a cache-key component. Empty when
 * the tool is absent. Probing is what populates it, so probe first.
 */
function swiftcVersion(): string {
  if (_swiftcAvailable === undefined) isSwiftcAvailable()
  return _swiftcVersion
}

/** For testing: reset the cached detection result. */
export function _resetSwiftcCache(): void {
  _swiftcAvailable = undefined
  _swiftcVersion = ''
}

/**
 * Validate Swift source via `swiftc -parse`. Returns a structured
 * result with `ok` + optional error. Honors PYREON_SKIP_NATIVE_VALIDATE
 * (force skip) and PYREON_REQUIRE_NATIVE_VALIDATE (fail-on-absent).
 */
export function validateSwift(source: string): ValidationResult {
  return withVerdictCache(
    'swift-parse' satisfies ValidateKind,
    swiftcVersion(),
    '',
    source,
    () => validateSwiftUncached(source),
  )
}

function validateSwiftUncached(source: string): ValidationResult {
  if (process.env.PYREON_SKIP_NATIVE_VALIDATE === '1') {
    return { ok: true, skipped: true, skipReason: 'PYREON_SKIP_NATIVE_VALIDATE=1' }
  }
  if (!isSwiftcAvailable()) {
    if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1') {
      return {
        ok: false,
        error: 'swiftc not found on PATH (PYREON_REQUIRE_NATIVE_VALIDATE=1 requested).',
      }
    }
    return { ok: true, skipped: true, skipReason: 'swiftc not on PATH' }
  }

  // Write to a temp file (swiftc -parse expects a path arg, not stdin).
  // Use `mkdtempSync` to create a unique directory with secure
  // randomness (Node uses the platform's crypto-secure RNG). Writing
  // a fixed filename inside that directory is safe because the
  // directory itself is uniquely owned by this process.
  //
  // Avoid using `Math.random()` for any part of the temp path — CodeQL
  // (rightly) flags that pattern as insecure-temp-file: predictable
  // names in world-writable dirs can be hijacked via symlink attacks
  // before the write.
  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-native-validate-'))
  const filename = join(tempDir, 'input.swift')
  writeFileSync(filename, source, 'utf8')

  try {
    execFileSync('swiftc', ['-parse', filename], { stdio: 'pipe', encoding: 'utf8' })
    return { ok: true }
  } catch (err) {
    // execFileSync throws on non-zero exit. The thrown error carries
    // `stdout` and `stderr` (Buffer | string) — surface both for the
    // diagnostic.
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string }
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8') ?? ''
    const stdout = typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString('utf8') ?? ''
    const output = [stderr, stdout].filter(Boolean).join('\n').trim()
    return {
      ok: false,
      error: output || e.message || 'swiftc -parse failed with no output',
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort; non-critical if the temp dir lingers.
    }
  }
}

/**
 * Detect whether the SwiftUI SDK is resolvable for `swiftc -typecheck`.
 * SwiftUI is an Apple framework — present on macOS, ABSENT on Linux even
 * when `swiftc` itself is installed (the open-source Linux toolchain has
 * Foundation but no SwiftUI). So the type-check gate can only run on
 * macOS (local dev + macOS CI runners), and must skip — not fail — on a
 * Linux box. Probed by type-checking a trivial `import SwiftUI` file.
 * Cached for the lifetime of the process.
 */
let _swiftUIAvailable: boolean | undefined
export function isSwiftUIAvailable(): boolean {
  if (_swiftUIAvailable !== undefined) return _swiftUIAvailable
  if (!isSwiftcAvailable()) {
    _swiftUIAvailable = false
    return false
  }
  // Disk-cached under a `variant` so it cannot collide with the plain
  // availability probe for the same binary. This probe compiles a real
  // `import SwiftUI` file, so it is far from free, and vitest's per-file
  // isolation runs it once per test file.
  const cachedUI = readToolProbe('swiftc', 'swiftui')
  if (cachedUI !== null) {
    _swiftUIAvailable = cachedUI.available
    return _swiftUIAvailable
  }
  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-swiftui-probe-'))
  const filename = join(tempDir, 'probe.swift')
  writeFileSync(filename, 'import SwiftUI\nlet _pyreonSwiftUIProbe = 0\n', 'utf8')
  try {
    execFileSync('swiftc', ['-typecheck', filename], { stdio: 'ignore' })
    _swiftUIAvailable = true
  } catch {
    _swiftUIAvailable = false
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
  writeToolProbe('swiftc', { available: _swiftUIAvailable, version: '' }, 'swiftui')
  return _swiftUIAvailable
}

/** For testing: reset the cached SwiftUI-availability result. */
export function _resetSwiftUICache(): void {
  _swiftUIAvailable = undefined
}

/**
 * Detect whether the `Observation` module (and its `@Observable` macro) is
 * resolvable for `swiftc -typecheck`. The store/state-tree emit declares an
 * `@Observable final class` but does NOT `import Observation` — on Apple
 * platforms it is implicitly available (and SwiftUI re-exports it), but the stub
 * build strips SwiftUI and a non-Apple toolchain needs the explicit import, so
 * `validateSwiftWithStubs` adds it. `Observation` ships in the Swift 5.9+ stdlib
 * on macOS AND the open-source Linux toolchain, so this probe is normally true
 * wherever `swiftc` exists — but we probe rather than assume, so an older/partial
 * toolchain SKIPS the @Observable fixtures instead of going red (the
 * Linux-parity-safe graceful degradation). Probed by type-checking a trivial
 * `@Observable` class WITH an explicit `import Observation`. Cached for the
 * process lifetime.
 */
let _observationAvailable: boolean | undefined
export function isObservationAvailable(): boolean {
  if (_observationAvailable !== undefined) return _observationAvailable
  if (!isSwiftcAvailable()) {
    _observationAvailable = false
    return false
  }
  // Disk-cached like the SwiftUI probe: this type-checks a real @Observable
  // class, once per isolated test file, to answer a question whose answer only
  // changes when the toolchain does.
  const cachedObs = readToolProbe('swiftc', 'observation')
  if (cachedObs !== null) {
    _observationAvailable = cachedObs.available
    return _observationAvailable
  }
  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-observation-probe-'))
  const filename = join(tempDir, 'probe.swift')
  writeFileSync(
    filename,
    'import Observation\n@Observable final class _PyreonObservationProbe { var x: Int = 0 }\n',
    'utf8',
  )
  try {
    execFileSync('swiftc', ['-typecheck', filename], { stdio: 'ignore' })
    _observationAvailable = true
  } catch {
    _observationAvailable = false
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // best-effort
    }
  }
  writeToolProbe('swiftc', { available: _observationAvailable, version: '' }, 'observation')
  return _observationAvailable
}

/** For testing: reset the cached Observation-availability result. */
export function _resetObservationCache(): void {
  _observationAvailable = undefined
}

/**
 * Validate Swift source via `swiftc -typecheck` against the REAL SwiftUI
 * SDK — full semantic analysis, no stubs, no masking. This is the
 * type-level gate that `validateSwift` (parse-only) deliberately can't
 * provide: it catches the silent type-corruption class (a String where
 * an Int is expected, a `var x: Int { <Double body> }` mismatch, a
 * method call that doesn't exist on the inferred type) that produces
 * syntactically-valid-but-type-invalid Swift.
 *
 * `import SwiftUI` + `import Foundation` are prepended when absent (the
 * per-component emit references `View` / `@State` / `VStack` / `Codable`
 * without emitting the imports — the app-assembly path adds them).
 *
 * SCOPE: this validates emit that references ONLY SwiftUI + stdlib +
 * Foundation symbols. Emit that references the `PyreonRuntime` package
 * (storage / fetch / store / router components) needs that module on the
 * search path — a follow-up that builds the runtime module and passes
 * `-I`. For now, callers pass SwiftUI-only emit (the dominant shape).
 *
 * Skips (does NOT fail) when SwiftUI is unavailable (Linux / no macOS
 * SDK), honoring PYREON_REQUIRE_NATIVE_VALIDATE for the swiftc-absent
 * case only — a Linux CI box legitimately can't run this gate.
 */
/**
 * The preamble `validateSwiftTypecheck` prepends. Exported so the verdict cache
 * can key on the bytes ACTUALLY compiled rather than on the caller's source:
 * changing this text must invalidate cached verdicts, and it can only do that
 * if the same function produces both the key and the file.
 */
export function _swiftTypecheckPreamble(source: string): string {
  return source.includes('import SwiftUI') ? '' : 'import SwiftUI\nimport Foundation\n\n'
}

export function validateSwiftTypecheck(source: string): ValidationResult {
  return withVerdictCache(
    'swift-typecheck' satisfies ValidateKind,
    swiftcVersion(),
    '',
    // The compiled bytes, not the caller's source — see _swiftTypecheckPreamble.
    _swiftTypecheckPreamble(source) + source,
    () => validateSwiftTypecheckUncached(source),
  )
}

function validateSwiftTypecheckUncached(source: string): ValidationResult {
  if (process.env.PYREON_SKIP_NATIVE_VALIDATE === '1') {
    return { ok: true, skipped: true, skipReason: 'PYREON_SKIP_NATIVE_VALIDATE=1' }
  }
  if (!isSwiftcAvailable()) {
    if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1') {
      return {
        ok: false,
        error: 'swiftc not found on PATH (PYREON_REQUIRE_NATIVE_VALIDATE=1 requested).',
      }
    }
    return { ok: true, skipped: true, skipReason: 'swiftc not on PATH' }
  }
  if (!isSwiftUIAvailable()) {
    // SwiftUI SDK absent (non-macOS). The cheap ubuntu PR gate falls
    // here — it can't type-check against an Apple framework. NOT an
    // error: the macOS device workflow + local macOS dev run this gate.
    return { ok: true, skipped: true, skipReason: 'SwiftUI SDK not available (non-macOS)' }
  }

  const preamble = _swiftTypecheckPreamble(source)
  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-native-typecheck-'))
  const filename = join(tempDir, 'input.swift')
  writeFileSync(filename, preamble + source, 'utf8')

  try {
    execFileSync('swiftc', ['-typecheck', filename], { stdio: 'pipe', encoding: 'utf8' })
    return { ok: true }
  } catch (err) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string }
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8') ?? ''
    const stdout = typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString('utf8') ?? ''
    const output = [stderr, stdout].filter(Boolean).join('\n').trim()
    return {
      ok: false,
      error: output || e.message || 'swiftc -typecheck failed with no output',
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort.
    }
  }
}

/** The framework modules `SWIFT_UI_STUBS` replaces — stripped from the emit so
 *  its symbols resolve to the stubs (a single-module compile), never to the real
 *  Apple SDK (absent on Linux). `Foundation` is NOT here: it's real + available. */
const SWIFT_STUBBED_IMPORTS = /^import (?:SwiftUI|PyreonRuntime|PyreonRouter)\s*$/gm

/** Names of top-level types the emitted source declares (struct/enum/class/actor/protocol). */
function emitDeclaredTypeNames(source: string): Set<string> {
  const names = new Set<string>()
  const re = /(?:^|\n)[ \t]*(?:(?:public|private|internal|fileprivate|final|open)\s+)*(?:struct|enum|class|actor|protocol)\s+([A-Za-z_][A-Za-z0-9_]*)/g
  for (const m of source.matchAll(re)) names.add(m[1]!)
  return names
}

/**
 * Remove from `stub` every top-level `(public )?(struct|enum|class|actor|protocol)
 * NAME … { … }` block whose NAME is in `names`, matching braces so a multi-line
 * declaration is removed whole. Extensions are left alone (they add members, not a
 * conflicting type). Used to emulate real multi-module shadowing (see caller).
 */
function shadowStubDeclarations(stub: string, emit: string): string {
  const names = emitDeclaredTypeNames(emit)
  if (names.size === 0) return stub
  let result = stub
  for (const name of names) {
    const openRe = new RegExp(
      `(?:^|\\n)(?:public |private )?(?:struct|enum|class|actor|protocol)\\s+${name}\\b[^{]*\\{`,
    )
    // Loop in case (unlikely) more than one stub declaration shares the name.
    for (;;) {
      const m = openRe.exec(result)
      if (!m) break
      // Brace-match from the opening `{` at the end of the match.
      let depth = 0
      let end = -1
      for (let i = m.index + m[0].length - 1; i < result.length; i++) {
        const ch = result[i]
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            end = i + 1
            break
          }
        }
      }
      if (end === -1) break // unbalanced — leave as-is rather than corrupt
      result = result.slice(0, m.index) + result.slice(end)
    }
  }
  return result
}

/**
 * Validate Swift source via `swiftc -typecheck` against a minimal STUB of the
 * SwiftUI + PyreonRuntime surface (see swift-stubs.ts) — the Swift sibling of
 * `validateKotlin`. Unlike `validateSwiftTypecheck` (which needs the REAL SwiftUI
 * SDK, so it only runs on macOS), this needs ONLY `swiftc`, so it runs on the
 * plain Linux PR runner — closing the per-PR type-check gap that let a type error
 * like `.animation(_:value:)`-needs-Equatable ship past `swiftc -parse`.
 *
 * The emit's `import SwiftUI` / `import PyreonRuntime` / `import PyreonRouter` are
 * stripped and the stub is concatenated, so those symbols resolve within one
 * module (exactly how `validateKotlin` concatenates its Compose stubs). `import
 * Foundation` is guaranteed (kept if present, prepended if not) — Foundation is
 * real on the Linux toolchain, so `String.trimmingCharacters`, `Codable`, etc.
 * type-check for real rather than against a stub.
 *
 * SCOPE: the stub covers the surface the two shipped example apps emit. Emit that
 * references symbols outside the stub (Spacer / ScrollView / Image / @Observable /
 * PyreonRouter / fetch / …) will fail here until the stub is expanded — a tracked
 * follow-up. Callers pass emit known to be within the stub surface.
 *
 * Honors PYREON_SKIP_NATIVE_VALIDATE (force skip) and PYREON_REQUIRE_NATIVE_VALIDATE
 * (fail-on-absent) identically to `validateSwift` / `validateKotlin`.
 */
/**
 * Conditional `FoundationNetworking` import for the EMIT file.
 *
 * Swift imports are per-FILE, so this belongs in the file that references
 * `URLSession` (the emit), NOT in the concatenated stub file — importing it
 * beside the stubs does nothing for the emit and leaves CI failing identically.
 * `canImport` makes it a no-op on Apple platforms.
 */
export const SWIFT_NETWORKING_SHIM =
  '#if canImport(FoundationNetworking)\nimport FoundationNetworking\n#endif\n'

/**
 * The import prelude prepended to the EMIT file. Pure + exported so the
 * per-file import contract is unit-testable without a Linux toolchain (on
 * macOS `canImport` is false, so a compile check cannot distinguish a present
 * shim from a missing one).
 */
export function _swiftInputPrelude(stripped: string, observation: string): string {
  const foundation = /^import Foundation\s*$/m.test(stripped) ? '' : 'import Foundation\n'
  return foundation + SWIFT_NETWORKING_SHIM + observation
}

// ---------------------------------------------------------------------------
// `@pyreon/charts/plot` hosts: an emitted `<SankeyChart>` names the GENERATED
// engine (`layoutSankey` / `renderSankey` / the family structs) and the
// runtime's `PyreonChartCanvas`. The engine is generated from the charts
// sources, so a hand-written stub of it would be the drift-prone copy the
// stub-fidelity rule forbids; instead, when a chart host is present, the stub
// bundle pulls in the REAL committed engine plus the canvas-owned draw-list
// types extracted VERBATIM (exactly how native-chart-engine-generated.test.ts
// compiles them), and stubs only the two views the engine never declares
// (GeometryReader, PyreonChartCanvas). Those two view stubs live in
// swift-stubs.ts / kotlin-stubs.ts — where the stub-coverage ratchet looks —
// so `PyreonChartCanvas` counts as covered. Outside the monorepo the runtime files
// are absent: the view stubs still apply and the engine symbols are reported
// missing — a loud outcome, never a silent pass.
// ---------------------------------------------------------------------------

const CHART_HOST_MARK = /\bPyreonChartCanvas\(/
const NATIVE_PACKAGES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readIfPresent(p: string): string | undefined {
  try {
    return readFileSync(p, 'utf8')
  } catch {
    return undefined
  }
}

/** The Swift stub text a chart-host emit needs beyond the SwiftUI bundle; `''` when no host is present. */
export function swiftChartAugmentation(source: string): string {
  if (!CHART_HOST_MARK.test(source)) return ''
  const canvas = readIfPresent(join(NATIVE_PACKAGES_DIR, 'runtime-swift/Sources/PyreonRuntime/PyreonChartCanvas.swift'))
  const engine = readIfPresent(join(NATIVE_PACKAGES_DIR, 'runtime-swift/Sources/PyreonRuntime/PyreonChartEngine.swift'))
  if (canvas === undefined || engine === undefined) return SWIFT_CHART_VIEW_STUBS
  const start = canvas.indexOf('public struct PyreonChartPt')
  const end = canvas.indexOf('/// Parse the engine')
  const types = start >= 0 && end > start ? canvas.slice(start, end) : ''
  return SWIFT_CHART_VIEW_STUBS + '\n' + types + '\n' + engine.replace(SWIFT_STUBBED_IMPORTS, '')
}

/** The Kotlin stub text a chart-host emit needs beyond the Compose bundle; `''` when no host is present. */
export function kotlinChartAugmentation(source: string): string {
  if (!CHART_HOST_MARK.test(source)) return ''
  const canvas = readIfPresent(join(NATIVE_PACKAGES_DIR, 'runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartCanvas.kt'))
  const engine = readIfPresent(join(NATIVE_PACKAGES_DIR, 'runtime-kotlin/src/main/kotlin/com/pyreon/runtime/PyreonChartEngine.kt'))
  if (canvas === undefined || engine === undefined) return KOTLIN_CHART_VIEW_STUBS
  const decls: string[] = []
  for (const m of canvas.matchAll(/data class Pyreon\w+\([^)]*\)/g)) decls.push(m[0])
  const body = engine
    .split('\n')
    .filter((l) => !l.startsWith('package '))
    .join('\n')
  return '\n' + decls.join('\n') + '\n' + KOTLIN_CHART_VIEW_STUBS + '\n' + body
}

export function validateSwiftWithStubs(source: string): ValidationResult {
  if (process.env.PYREON_SKIP_NATIVE_VALIDATE === '1') {
    return { ok: true, skipped: true, skipReason: 'PYREON_SKIP_NATIVE_VALIDATE=1' }
  }
  if (!isSwiftcAvailable()) {
    if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1') {
      return {
        ok: false,
        error: 'swiftc not found on PATH (PYREON_REQUIRE_NATIVE_VALIDATE=1 requested).',
      }
    }
    return { ok: true, skipped: true, skipReason: 'swiftc not on PATH' }
  }

  // Strip the stubbed-module imports so their symbols bind to the stub, and
  // guarantee `import Foundation` (real on Linux) for String/Codable/etc.
  const stripped = source.replace(SWIFT_STUBBED_IMPORTS, '')

  // URLSession is in Foundation on Apple platforms but in a SEPARATE
  // FoundationNetworking module on Linux, where plain Foundation only carries a
  // placeholder typealias to AnyObject. A `useFetch` emit calls
  // `URLSession.shared.data(from:)`, so on Linux it fails with "type
  // 'URLSession' (aka 'AnyObject') has no member 'shared'".
  //
  // This MUST be added to the EMIT file, not just the stub file: Swift imports
  // are per-FILE, so importing FoundationNetworking alongside the stubs does
  // nothing for the emit that actually references URLSession. (Putting it only
  // in the stub was the first attempt, and CI failed identically.)
  //
  // `canImport` keeps it a no-op on Apple platforms, so it is safe to add
  // unconditionally rather than sniffing the emit for `URLSession`.

  // The store/state-tree emit declares an `@Observable final class` but does NOT
  // `import Observation` (on Apple platforms it is implicit + SwiftUI re-exports
  // it; the stub build strips SwiftUI, and a non-Apple toolchain needs the
  // explicit import). Guarantee the import when the emit uses the macro. If the
  // toolchain lacks Observation, SKIP rather than fail — the Linux-parity-safe
  // graceful degradation (an @Observable fixture stays effectively excluded on an
  // Observation-less toolchain instead of going red). NOTE: macOS resolves
  // `@Observable` WITHOUT the import (implicit), so this guarantee is load-bearing
  // only on a toolchain that strips the implicit Observation (the Linux CI gate) —
  // the local bisect target is the PyreonStoreProtocol/PyreonModelProtocol stubs.
  const usesObservable = /@Observable\b/.test(stripped)
  if (usesObservable && !isObservationAvailable()) {
    return { ok: true, skipped: true, skipReason: 'Observation module unavailable on this toolchain' }
  }
  const observation =
    usesObservable && !/^import Observation\s*$/m.test(stripped) ? 'import Observation\n' : ''

  // A component the emit declares with the SAME name as a stubbed SwiftUI type
  // (e.g. a user component `Toggle`) SHADOWS that symbol in a real multi-module
  // build — the local module type wins for bare references. Our single-module
  // concat would instead see it as an "invalid redeclaration". Drop the stub's
  // copy of any type the emit declares so the concat behaves like real shadowing.
  const stub = shadowStubDeclarations(SWIFT_UI_STUBS, stripped) + swiftChartAugmentation(stripped)

  // Everything above transformed the source; `stub` and `inputText` ARE the
  // bytes swiftc will see. Keying on them means every transform — import
  // stripping, the networking shim, the Observation import, stub shadowing — is
  // folded into the key for free, so editing any of that logic invalidates
  // cached verdicts without anyone remembering to bump a version.
  const inputText = _swiftInputPrelude(stripped, observation) + stripped
  return withVerdictCache(
    'swift-stubs' satisfies ValidateKind,
    swiftcVersion(),
    stub,
    inputText,
    () => compileSwiftStubs(stub, inputText),
  )
}

function compileSwiftStubs(stub: string, inputText: string): ValidationResult {
  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-native-swift-stubs-'))
  const stubsPath = join(tempDir, 'PyreonSwiftStubs.swift')
  const inputPath = join(tempDir, 'Input.swift')
  writeFileSync(stubsPath, stub, 'utf8')
  writeFileSync(inputPath, inputText, 'utf8')

  try {
    // Both files compiled as one module; the stubs satisfy SwiftUI/PyreonRuntime
    // references. -typecheck performs full name + type resolution (no codegen).
    execFileSync('swiftc', ['-typecheck', stubsPath, inputPath], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
    return { ok: true }
  } catch (err) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string }
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8') ?? ''
    const stdout = typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString('utf8') ?? ''
    const output = [stderr, stdout].filter(Boolean).join('\n').trim()
    return {
      ok: false,
      error: output || e.message || 'swiftc -typecheck (stubs) failed with no output',
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort.
    }
  }
}

/**
 * Detect whether `kotlinc` is on PATH. Cheap probe via `kotlinc -version`.
 * Cached for the lifetime of the process.
 */
let _kotlincAvailable: boolean | undefined
let _kotlincVersion = ''
export function isKotlincAvailable(): boolean {
  if (_kotlincAvailable !== undefined) return _kotlincAvailable
  const cached = readToolProbe('kotlinc')
  if (cached !== null) {
    _kotlincAvailable = cached.available
    _kotlincVersion = cached.version
    return _kotlincAvailable
  }
  try {
    // `kotlinc -version` writes to STDERR and starts a JVM (~1.4s warm, 10-20s
    // cold under CI load). That is why the result is disk-cached above: with
    // vitest isolating modules per file, this ran 123 times per suite.
    _kotlincVersion = execFileSync('kotlinc', ['-version'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    }).trim()
    _kotlincAvailable = true
  } catch (err) {
    // A non-zero exit means absent; but kotlinc reports its version on stderr
    // and still exits 0, so only a genuine spawn failure lands here.
    const e = err as { stderr?: string | Buffer; status?: number }
    if (e.status === 0) {
      const stderr = typeof e.stderr === 'string' ? e.stderr : (e.stderr?.toString('utf8') ?? '')
      _kotlincVersion = stderr.trim()
      _kotlincAvailable = true
    } else {
      _kotlincAvailable = false
      _kotlincVersion = ''
    }
  }
  writeToolProbe('kotlinc', { available: _kotlincAvailable, version: _kotlincVersion })
  return _kotlincAvailable
}

/**
 * The `kotlinc` version string, for use as a cache-key component. Empty when
 * the tool is absent. Probing is what populates it, so probe first.
 */
function kotlincVersion(): string {
  if (_kotlincAvailable === undefined) isKotlincAvailable()
  return _kotlincVersion
}

/** For testing: reset the cached detection result. */
export function _resetKotlincCache(): void {
  _kotlincAvailable = undefined
  _kotlincVersion = ''
}

/**
 * Validate Kotlin source via `kotlinc` (full semantic analysis) against
 * the bundled Compose stubs (see kotlin-stubs.ts). Returns the same
 * structured result shape as `validateSwift`. Honors the same env vars.
 *
 * Unlike `swiftc -parse`, kotlinc has no parse-only flag — it always
 * performs name + type resolution. To validate without depending on
 * the real Jetpack Compose libraries (which would require Gradle +
 * Android SDK + minutes of bootstrap), we compile alongside a tiny
 * stubs file that mocks the API surface our emitter uses. A real
 * production deploy compiles against actual Compose, not against
 * these stubs.
 */
export function validateKotlin(source: string): ValidationResult {
  return withVerdictCache(
    'kotlin' satisfies ValidateKind,
    kotlincVersion(),
    KOTLIN_COMPOSE_STUBS + kotlinChartAugmentation(source),
    source,
    () => validateKotlinUncached(source),
  )
}

function validateKotlinUncached(source: string): ValidationResult {
  if (process.env.PYREON_SKIP_NATIVE_VALIDATE === '1') {
    return { ok: true, skipped: true, skipReason: 'PYREON_SKIP_NATIVE_VALIDATE=1' }
  }
  if (!isKotlincAvailable()) {
    if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1') {
      return {
        ok: false,
        error: 'kotlinc not found on PATH (PYREON_REQUIRE_NATIVE_VALIDATE=1 requested).',
      }
    }
    return { ok: true, skipped: true, skipReason: 'kotlinc not on PATH' }
  }

  // Set up a temp directory containing the stubs + the input. kotlinc
  // accepts multiple .kt files and compiles them together; the stubs
  // satisfy Compose API references in the input source.
  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-native-validate-kotlin-'))
  const stubsPath = join(tempDir, 'PyreonStubs.kt')
  const inputPath = join(tempDir, 'Input.kt')
  const outDir = join(tempDir, 'out')
  writeFileSync(stubsPath, KOTLIN_COMPOSE_STUBS + kotlinChartAugmentation(source), 'utf8')
  writeFileSync(inputPath, source, 'utf8')

  try {
    execFileSync(
      'kotlinc',
      // -nowarn drops style/dep warnings (the emit may use idioms
      // kotlinc considers improvable but is still valid); -d produces
      // .class files in the temp dir which we discard via rmSync.
      ['-nowarn', '-d', outDir, stubsPath, inputPath],
      { stdio: 'pipe', encoding: 'utf8' },
    )
    return { ok: true }
  } catch (err) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer; message?: string }
    const stderr = typeof e.stderr === 'string' ? e.stderr : e.stderr?.toString('utf8') ?? ''
    const stdout = typeof e.stdout === 'string' ? e.stdout : e.stdout?.toString('utf8') ?? ''
    const output = [stderr, stdout].filter(Boolean).join('\n').trim()
    return {
      ok: false,
      error: output || e.message || 'kotlinc failed with no output',
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Cleanup best-effort.
    }
  }
}
