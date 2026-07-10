// The native-compiler suite's cost IS its coverage.
//
// `validate.ts` shells out to a real `swiftc` / `kotlinc` (`execFileSync`), and
// the suite calls it from 175 sites across 98 test files. Measured warm, per
// invocation: `swiftc -parse` 5.2-5.7s, `kotlinc` 17.4s. That is ~2600s of the
// package's ~2800s aggregate test CPU, and it is why `test (native-compiler)`
// needs its own CI runner (see the matrix comment in `.github/workflows/ci.yml`).
//
// That cost makes the suite a standing target for a well-meaning "speed-up"
// that replaces the real compiler with a stub or a regex. Such a change would
// make the suite ~50x faster AND silently worthless: every emit test would keep
// passing while the emitted Swift/Kotlin stopped being checked by anything that
// can actually parse Swift or Kotlin. The `Validate emitted Swift + Kotlin` CI
// job would still be green, because it runs the same stubbed helper.
//
// So this file asserts BEHAVIOURALLY that a real parser is behind the helpers:
// valid source is accepted, and source that only a genuine parser rejects is
// rejected. A stub returning `{ ok: true }` fails the second assertion; a stub
// returning `{ ok: false }` fails the first. A regex approximation fails on the
// nested/structural cases below.
//
// These specs SKIP when the toolchain is absent (a contributor without Xcode or
// a JDK) — they are not a substitute for the toolchain, they are a lock on it
// being used when present. CI has both.

import { describe, expect, it } from 'vitest'
import {
  isKotlincAvailable,
  isSwiftcAvailable,
  validateKotlin,
  validateSwift,
} from '../validate'

describe('validate.ts is backed by a REAL toolchain (cost == coverage)', () => {
  describe.skipIf(!isSwiftcAvailable())('swiftc', () => {
    it('accepts valid Swift', () => {
      const r = validateSwift('let x: Int = 1\nfunc f() -> Int { return x }\n')
      expect(r.skipped ?? false).toBe(false)
      expect(r.ok, r.error).toBe(true)
    })

    it('rejects Swift that only a real parser catches', () => {
      // Unbalanced brace inside a nested closure — accepted by any naive
      // "does it look like code" check, rejected by swiftc.
      const r = validateSwift('func f() {\n  let g = { (a: Int) in\n    return a\n}\n')
      expect(r.skipped ?? false).toBe(false)
      expect(r.ok).toBe(false)
      expect(r.error ?? '').not.toBe('')
    })
  })

  describe.skipIf(!isKotlincAvailable())('kotlinc', () => {
    it('accepts valid Kotlin', () => {
      const r = validateKotlin('fun f(): Int {\n  val x = 1\n  return x\n}\n')
      expect(r.skipped ?? false).toBe(false)
      expect(r.ok, r.error).toBe(true)
    })

    it('rejects Kotlin that only a real compiler catches', () => {
      // Type error, not a syntax error: `val x: Int = "s"` parses fine and is
      // rejected only by something doing real type resolution.
      const r = validateKotlin('fun f() {\n  val x: Int = "not an int"\n}\n')
      expect(r.skipped ?? false).toBe(false)
      expect(r.ok).toBe(false)
      expect(r.error ?? '').not.toBe('')
    })
  })
})
