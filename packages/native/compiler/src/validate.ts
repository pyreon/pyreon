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
