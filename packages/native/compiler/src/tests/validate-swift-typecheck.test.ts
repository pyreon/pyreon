// Swift `-typecheck`-against-STUBS gate — the per-PR type-level safety net.
//
// `validate-swift.test.ts` runs `swiftc -parse` (syntax only): it CANNOT catch a
// type error — the class that shipped three CI incidents, the sharpest being a
// SwiftUI modifier whose generic constraint the emit violates (`.animation(_:value:)`
// requires the value be `Equatable`; a PMTC-emitted struct isn't). `-parse` waves
// that through; only the device gate (`xcodebuild -typecheck`) caught it, days later.
//
// `swift-typecheck-gate.test.ts` closes the type side against the REAL SwiftUI SDK —
// but SwiftUI is an Apple framework, ABSENT on the Linux PR runner, so every case
// there is `it.skipIf(!isSwiftUIAvailable())` and SKIPS per-PR. This file closes the
// remaining gap: `validateSwiftWithStubs` type-checks against a minimal SwiftUI +
// PyreonRuntime STUB (see swift-stubs.ts), needing ONLY `swiftc` (not the SDK), so it
// RUNS on the plain Linux PR runner — the Swift sibling of `validateKotlin`.
//
// Auto-enabled when `swiftc` is on PATH. `PYREON_SKIP_NATIVE_VALIDATE=1` force-skips;
// `PYREON_REQUIRE_NATIVE_VALIDATE=1` (set by the `Validate emitted Swift + Kotlin` CI
// job) promotes the swiftc-absent SKIP to a hard fail.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { transform } from '../index'
import { isSwiftcAvailable, validateSwift, validateSwiftWithStubs } from '../validate'

// swiftc cold-starts its frontend per invocation; under parallel-suite load a
// single compile can exceed the repo's 20s default. Give real headroom.
vi.setConfig({ testTimeout: 90_000 })

const HERE = dirname(fileURLToPath(import.meta.url))
// tests → src → compiler → native → packages → <repo root>
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..')

function emitSwift(source: string): string {
  return transform(source, { target: 'swift' }).code
}

function emitExample(relPath: string): string {
  return emitSwift(readFileSync(resolve(REPO_ROOT, relPath), 'utf8'))
}

const skipCondition =
  process.env.PYREON_SKIP_NATIVE_VALIDATE === '1' ||
  (!isSwiftcAvailable() && process.env.PYREON_REQUIRE_NATIVE_VALIDATE !== '1')

describe('Swift emit — swiftc -typecheck against stubs (Linux-viable type gate)', () => {
  it('skips gracefully when swiftc is absent (not a failure on a toolchain-less box)', () => {
    // Contract: with swiftc absent AND not required, this is a SKIP — the gate is
    // additive, never a blocker on a runner that lacks the toolchain.
    if (isSwiftcAvailable()) return
    if (process.env.PYREON_REQUIRE_NATIVE_VALIDATE === '1') return
    const res = validateSwiftWithStubs('let _ = 0')
    expect(res.ok).toBe(true)
    expect(res.skipped).toBe(true)
    expect(res.skipReason).toBe('swiftc not on PATH')
  })

  describe.skipIf(skipCondition)('with swiftc present', () => {
    // The two SHIPPED example apps — the real emits that carry the `.animation`
    // class the device gate caught in M2.8. Locking them here means that class is
    // now caught PER-PR on Linux, not days later on the device gate.
    it('native-counter-ios Counter.tsx emit typechecks clean', () => {
      const res = validateSwiftWithStubs(
        emitExample('examples/native-counter-ios/src/Counter.tsx'),
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })

    it('native-todomvc-ios TodoApp.tsx emit typechecks clean', () => {
      const res = validateSwiftWithStubs(
        emitExample('examples/native-todomvc-ios/src/TodoApp.tsx'),
      )
      expect(res.ok, res.error ?? '').toBe(true)
    })

    // THE load-bearing discriminating-power proof. This is the exact M2.8 class:
    // `.animation(_:value:)` requires the value be `Equatable`. A PMTC struct is
    // not — so `value: [Row]` must be REJECTED, while `value: <Bool>` is accepted.
    // Crucially, `swiftc -parse` (the OLD per-PR gate) PASSES the broken form —
    // this is precisely why the type gate is needed.
    const GOOD_ANIMATION = `struct GoodView: View {
  var body: some View { Text("x").animation(.default, value: true) }
}`
    const BROKEN_ANIMATION = `struct Row { var id: Int }
struct BrokenView: View {
  var body: some View { Text("x").animation(.default, value: [Row(id: 1)]) }
}`

    it('ACCEPTS .animation over an Equatable value', () => {
      expect(validateSwiftWithStubs(GOOD_ANIMATION).ok).toBe(true)
    })

    it('REJECTS .animation over a non-Equatable value (the class -parse misses)', () => {
      const tc = validateSwiftWithStubs(BROKEN_ANIMATION)
      expect(tc.ok).toBe(false)
      expect(tc.error ?? '').toMatch(/Equatable/)
    })

    it('swiftc -parse PASSES the broken .animation (proves the -parse blind spot)', () => {
      // The discriminating control: the old gate can't see this type error.
      expect(validateSwift(`import SwiftUI\n${BROKEN_ANIMATION}`).ok).toBe(true)
    })
  })
})
