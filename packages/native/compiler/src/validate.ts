// Compile-validation harness.
//
// Snapshot tests prove "the emit equals what it equalled last time."
// They do NOT prove "the emit is valid Swift / Kotlin." This module
// closes that gap by piping emitted source through the actual language
// compilers in parse-only mode. If the compiler accepts the source as
// syntactically valid, the harness passes; if the compiler rejects it,
// the harness surfaces the error.
//
// Phase 0 ships Swift validation only (via `swiftc -parse`). Kotlin
// validation lands in a follow-up PR — the kotlinc toolchain has no
// equivalent `-parse-only` flag, so the Kotlin path needs more design
// work (Compose stubs OR tree-sitter-kotlin parser OR a separate path).
//
// Tool detection is automatic: when `swiftc` is on PATH, validation
// runs by default. Set `PYREON_SKIP_NATIVE_VALIDATE=1` to force-skip.
// Set `PYREON_REQUIRE_NATIVE_VALIDATE=1` to fail (instead of skip)
// when the tool is absent — useful in CI environments where the
// toolchain SHOULD be installed.

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
