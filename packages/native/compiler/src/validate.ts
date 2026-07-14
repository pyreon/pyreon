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

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KOTLIN_COMPOSE_STUBS } from './kotlin-stubs'
import { SWIFT_UI_STUBS } from './swift-stubs'

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
export function isSwiftcAvailable(): boolean {
  if (_swiftcAvailable !== undefined) return _swiftcAvailable
  try {
    execFileSync('swiftc', ['--version'], { stdio: 'ignore' })
    _swiftcAvailable = true
  } catch {
    _swiftcAvailable = false
  }
  return _swiftcAvailable
}

/** For testing: reset the cached detection result. */
export function _resetSwiftcCache(): void {
  _swiftcAvailable = undefined
}

/**
 * Validate Swift source via `swiftc -parse`. Returns a structured
 * result with `ok` + optional error. Honors PYREON_SKIP_NATIVE_VALIDATE
 * (force skip) and PYREON_REQUIRE_NATIVE_VALIDATE (fail-on-absent).
 */
export function validateSwift(source: string): ValidationResult {
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
  return _swiftUIAvailable
}

/** For testing: reset the cached SwiftUI-availability result. */
export function _resetSwiftUICache(): void {
  _swiftUIAvailable = undefined
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
export function validateSwiftTypecheck(source: string): ValidationResult {
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

  const preamble = source.includes('import SwiftUI') ? '' : 'import SwiftUI\nimport Foundation\n\n'
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
  const foundation = /^import Foundation\s*$/m.test(stripped) ? '' : 'import Foundation\n'

  // A component the emit declares with the SAME name as a stubbed SwiftUI type
  // (e.g. a user component `Toggle`) SHADOWS that symbol in a real multi-module
  // build — the local module type wins for bare references. Our single-module
  // concat would instead see it as an "invalid redeclaration". Drop the stub's
  // copy of any type the emit declares so the concat behaves like real shadowing.
  const stub = shadowStubDeclarations(SWIFT_UI_STUBS, stripped)

  const tempDir = mkdtempSync(join(tmpdir(), 'pyreon-native-swift-stubs-'))
  const stubsPath = join(tempDir, 'PyreonSwiftStubs.swift')
  const inputPath = join(tempDir, 'Input.swift')
  writeFileSync(stubsPath, stub, 'utf8')
  writeFileSync(inputPath, foundation + stripped, 'utf8')

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
export function isKotlincAvailable(): boolean {
  if (_kotlincAvailable !== undefined) return _kotlincAvailable
  try {
    execFileSync('kotlinc', ['-version'], { stdio: 'ignore' })
    _kotlincAvailable = true
  } catch {
    _kotlincAvailable = false
  }
  return _kotlincAvailable
}

/** For testing: reset the cached detection result. */
export function _resetKotlincCache(): void {
  _kotlincAvailable = undefined
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
  writeFileSync(stubsPath, KOTLIN_COMPOSE_STUBS, 'utf8')
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
